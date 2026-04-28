const DEFAULT_SETTINGS = {
  appBaseUrl: 'http://127.0.0.1:5173',
  sharedSecret: '',
  discoveryDelayMs: 6000,
};

const form = document.getElementById('settings-form');
const appBaseUrlInput = document.getElementById('appBaseUrl');
const sharedSecretInput = document.getElementById('sharedSecret');
const discoveryDelayMsInput = document.getElementById('discoveryDelayMs');
const targetLimitInput = document.getElementById('targetLimit');
const status = document.getElementById('status');
const discoveryStatus = document.getElementById('discovery-status');
const startDiscoveryButton = document.getElementById('start-discovery');
const stopDiscoveryButton = document.getElementById('stop-discovery');
const refreshDiscoveryStatusButton = document.getElementById('refresh-discovery-status');

void loadSettings();
void refreshDiscoveryStatus();
window.setInterval(refreshDiscoveryStatus, 2500);
form.addEventListener('submit', saveSettings);
startDiscoveryButton.addEventListener('click', startDiscovery);
stopDiscoveryButton.addEventListener('click', stopDiscovery);
refreshDiscoveryStatusButton.addEventListener('click', refreshDiscoveryStatus);

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  appBaseUrlInput.value = stored.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl;
  sharedSecretInput.value = stored.sharedSecret || DEFAULT_SETTINGS.sharedSecret;
  discoveryDelayMsInput.value = stored.discoveryDelayMs || DEFAULT_SETTINGS.discoveryDelayMs;
}

async function saveSettings(event) {
  event.preventDefault();

  const settings = {
    appBaseUrl: appBaseUrlInput.value.trim().replace(/\/+$/, ''),
    sharedSecret: sharedSecretInput.value.trim(),
    discoveryDelayMs: Number(discoveryDelayMsInput.value) || DEFAULT_SETTINGS.discoveryDelayMs,
  };

  await chrome.storage.local.set(settings);
  status.textContent = 'Saved';
  window.setTimeout(() => {
    status.textContent = '';
  }, 1500);
}

async function startDiscovery() {
  discoveryStatus.textContent = 'Starting discovery...';
  const response = await sendRuntimeMessage({
    type: 'bridge:start-discovery',
    options: {
      limit: Number(targetLimitInput.value) || 50,
      delayMs: Number(discoveryDelayMsInput.value) || DEFAULT_SETTINGS.discoveryDelayMs,
    },
  });
  renderDiscoveryResponse(response);
}

async function stopDiscovery() {
  const response = await sendRuntimeMessage({ type: 'bridge:stop-discovery' });
  renderDiscoveryResponse(response);
}

async function refreshDiscoveryStatus() {
  const response = await sendRuntimeMessage({ type: 'bridge:get-discovery-status' });
  renderDiscoveryResponse(response);
}

function renderDiscoveryResponse(response) {
  if (!response?.ok) {
    discoveryStatus.textContent = response?.message || 'Discovery request failed.';
    return;
  }
  renderDiscoveryStatus(response.status);
}

function renderDiscoveryStatus(runStatus) {
  if (!runStatus) {
    discoveryStatus.textContent = 'No discovery run yet.';
    return;
  }

  const lines = [
    runStatus.running ? 'Running' : 'Idle',
    `Targets: ${runStatus.currentTargetIndex || 0}/${runStatus.targetCount || 0}`,
    runStatus.currentTarget ? `Current: ${runStatus.currentTarget}` : null,
    `Submitted: ${runStatus.submitted || 0}`,
    `Saved: ${runStatus.saved || 0}`,
    `Duplicates: ${runStatus.duplicates || 0}`,
    `Skipped: ${runStatus.skipped || 0}`,
    `Errors: ${Array.isArray(runStatus.errors) ? runStatus.errors.length : 0}`,
    runStatus.startedAt ? `Started: ${runStatus.startedAt}` : null,
    runStatus.finishedAt ? `Finished: ${runStatus.finishedAt}` : null,
  ].filter(Boolean);

  const recentErrors = Array.isArray(runStatus.errors)
    ? runStatus.errors.slice(-3).map((err) => `- ${err.target || err.listingId || 'run'}: ${err.message}`)
    : [];

  discoveryStatus.textContent = recentErrors.length
    ? `${lines.join('\n')}\n\nRecent errors:\n${recentErrors.join('\n')}`
    : lines.join('\n');
}

function sendRuntimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}
