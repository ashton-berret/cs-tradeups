const DEFAULT_SETTINGS = {
  appBaseUrl: 'http://127.0.0.1:5173',
  sharedSecret: '',
};

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

function normalizeBaseUrl(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '');
}
