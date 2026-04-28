const DEFAULT_SETTINGS = {
  appBaseUrl: 'http://127.0.0.1:5173',
  sharedSecret: '',
  discoveryDelayMs: 6000,
};

const DISCOVERY_STATUS_KEY = 'discoveryStatus';
let activeRun = null;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const next = {};

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (!current[key]) {
      next[key] = value;
    }
  }

  if (Object.keys(next).length > 0) {
    await chrome.storage.local.set(next);
  }
});

chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  void handleMessage(message)
    .then(sendResponse)
    .catch((err) => {
      sendResponse({
        ok: false,
        code: 'UNEXPECTED_ERROR',
        message: err instanceof Error ? err.message : String(err),
      });
    });

  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case 'bridge:ingest-candidate':
      return ingestCandidate(message.payload);
    case 'bridge:get-discovery-targets':
      return getDiscoveryTargets();
    case 'bridge:start-discovery':
      return startDiscovery(message.options || {});
    case 'bridge:stop-discovery':
      return stopDiscovery();
    case 'bridge:get-discovery-status':
      return getDiscoveryStatus();
    case 'bridge:get-settings':
      return loadSettings();
    default:
      return {
        ok: false,
        code: 'UNKNOWN_MESSAGE',
        message: `Unknown message type: ${String(message?.type)}`,
      };
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  return {
    ok: true,
    settings: {
      appBaseUrl: normalizeBaseUrl(stored.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl),
      sharedSecret: stored.sharedSecret || '',
    },
  };
}

async function ingestCandidate(payload) {
  const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const appBaseUrl = normalizeBaseUrl(settings.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl);
  const sharedSecret = (settings.sharedSecret || '').trim();

  if (!appBaseUrl || !sharedSecret) {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'Configure the app URL and shared secret in the extension options first.',
    };
  }

  const response = await fetch(`${appBaseUrl}/api/extension/candidates`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-extension-secret': sharedSecret,
    },
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    return {
      ok: false,
      code: 'HTTP_ERROR',
      status: response.status,
      message: body?.message || body?.error || `Request failed with status ${response.status}`,
      details: body,
    };
  }

  return {
    ok: true,
    status: response.status,
    body,
  };
}

async function getDiscoveryTargets() {
  const settings = await getConfiguredSettings();
  if (!settings.ok) return settings;

  const response = await fetch(`${settings.appBaseUrl}/api/discovery/targets`, {
    method: 'GET',
    headers: {
      'x-extension-secret': settings.sharedSecret,
    },
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      code: 'HTTP_ERROR',
      status: response.status,
      message: body?.message || body?.error || `Targets request failed with status ${response.status}`,
      details: body,
    };
  }

  return { ok: true, body };
}

async function startDiscovery(options) {
  if (activeRun?.running) {
    return {
      ok: false,
      code: 'RUNNING',
      message: 'Discovery is already running.',
      status: activeRun.status,
    };
  }

  const settings = await getConfiguredSettings();
  if (!settings.ok) return settings;

  const targetsResult = await getDiscoveryTargets();
  if (!targetsResult.ok) return targetsResult;

  const limit = toPositiveInteger(options.limit) || 50;
  const delayMs = toPositiveInteger(options.delayMs) || toPositiveInteger(settings.discoveryDelayMs) || 6000;
  const targets = Array.isArray(targetsResult.body?.targets)
    ? targetsResult.body.targets.slice(0, limit)
    : [];

  const runId = `run_${Date.now()}`;
  const status = {
    runId,
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    targetCount: targets.length,
    currentTargetIndex: 0,
    currentTarget: null,
    submitted: 0,
    saved: 0,
    duplicates: 0,
    skipped: 0,
    errors: [],
  };

  activeRun = { running: true, stopRequested: false, status };
  await setDiscoveryStatus(status);
  void runDiscovery({ settings, targets, delayMs, runId });

  return { ok: true, status };
}

async function stopDiscovery() {
  if (!activeRun?.running) {
    const status = await getStoredDiscoveryStatus();
    return { ok: true, status };
  }
  activeRun.stopRequested = true;
  activeRun.status.running = false;
  activeRun.status.finishedAt = new Date().toISOString();
  activeRun.status.errors.push({ message: 'Stop requested by operator.' });
  await setDiscoveryStatus(activeRun.status);
  return { ok: true, status: activeRun.status };
}

async function getDiscoveryStatus() {
  return { ok: true, status: await getStoredDiscoveryStatus() };
}

async function runDiscovery({ settings, targets, delayMs, runId }) {
  let tabId = null;

  try {
    for (let index = 0; index < targets.length; index += 1) {
      if (!activeRun || activeRun.stopRequested || activeRun.status.runId !== runId) break;

      const target = targets[index];
      activeRun.status.currentTargetIndex = index + 1;
      activeRun.status.currentTarget = target.marketHashName;
      await setDiscoveryStatus(activeRun.status);

      const tab = await openOrUpdateTab(tabId, target.listingUrl);
      tabId = tab.id;
      await waitForTabComplete(tabId);
      await sleep(delayMs);

      const scan = await sendTabMessage(tabId, {
        type: 'bridge:scan-target',
        target,
        delayMs: Math.min(1500, Math.max(0, delayMs / 3)),
      });

      if (!scan?.ok) {
        activeRun.status.errors.push({
          target: target.marketHashName,
          message: scan?.message || 'Target scan failed.',
        });
        await setDiscoveryStatus(activeRun.status);
        continue;
      }

      activeRun.status.skipped += scan.skipped || 0;
      if (Array.isArray(scan.errors)) {
        for (const error of scan.errors.slice(0, 5)) {
          activeRun.status.errors.push({
            target: target.marketHashName,
            listingId: error.listingId,
            message: error.message || 'Visible row extraction failed.',
          });
        }
      }
      const payloads = Array.isArray(scan.payloads) ? scan.payloads : [];

      for (const payload of payloads) {
        if (!activeRun || activeRun.stopRequested || activeRun.status.runId !== runId) break;
        activeRun.status.submitted += 1;
        const response = await ingestCandidateWithSettings(payload, settings);
        if (response.ok) {
          if (response.body?.wasDuplicate) activeRun.status.duplicates += 1;
          else activeRun.status.saved += 1;
        } else {
          activeRun.status.errors.push({
            target: target.marketHashName,
            listingId: payload?.listingId,
            message: response.message || 'Candidate submission failed.',
          });
        }
        await setDiscoveryStatus(activeRun.status);
      }
    }
  } catch (err) {
    if (activeRun?.status.runId === runId) {
      activeRun.status.errors.push({ message: err instanceof Error ? err.message : String(err) });
    }
  } finally {
    if (tabId != null) {
      await chrome.tabs.remove(tabId).catch(() => {});
    }
    if (activeRun?.status.runId === runId) {
      activeRun.status.running = false;
      activeRun.status.finishedAt = new Date().toISOString();
      activeRun.status.currentTarget = null;
      await setDiscoveryStatus(activeRun.status);
      activeRun = null;
    }
  }
}

async function ingestCandidateWithSettings(payload, settings) {
  const response = await fetch(`${settings.appBaseUrl}/api/extension/candidates`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-extension-secret': settings.sharedSecret,
    },
    body: JSON.stringify(payload),
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    return {
      ok: false,
      code: 'HTTP_ERROR',
      status: response.status,
      message: body?.message || body?.error || `Request failed with status ${response.status}`,
      details: body,
    };
  }

  return { ok: true, status: response.status, body };
}

async function getConfiguredSettings() {
  const settings = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const appBaseUrl = normalizeBaseUrl(settings.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl);
  const sharedSecret = (settings.sharedSecret || '').trim();

  if (!appBaseUrl || !sharedSecret) {
    return {
      ok: false,
      code: 'CONFIG_ERROR',
      message: 'Configure the app URL and shared secret in the extension options first.',
    };
  }

  return {
    ok: true,
    appBaseUrl,
    sharedSecret,
    discoveryDelayMs: settings.discoveryDelayMs || DEFAULT_SETTINGS.discoveryDelayMs,
  };
}

async function readResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);
}

async function openOrUpdateTab(tabId, url) {
  if (tabId != null) {
    try {
      return await chrome.tabs.update(tabId, { url, active: false });
    } catch (_err) {
      // Fall through and create a new tab if the old tab was closed.
    }
  }

  return chrome.tabs.create({ url, active: false });
}

function waitForTabComplete(tabId) {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(done, 20000);

    function done() {
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        done();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendTabMessage(tabId, message) {
  return chrome.tabs.sendMessage(tabId, message).catch((err) => ({
    ok: false,
    message: err instanceof Error ? err.message : String(err),
  }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function setDiscoveryStatus(status) {
  await chrome.storage.local.set({ [DISCOVERY_STATUS_KEY]: status });
}

async function getStoredDiscoveryStatus() {
  const stored = await chrome.storage.local.get(DISCOVERY_STATUS_KEY);
  return stored[DISCOVERY_STATUS_KEY] || null;
}

function normalizeBaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}
