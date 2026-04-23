const DEFAULT_SETTINGS = {
  appBaseUrl: 'http://127.0.0.1:5173',
  sharedSecret: '',
};

const form = document.getElementById('settings-form');
const appBaseUrlInput = document.getElementById('appBaseUrl');
const sharedSecretInput = document.getElementById('sharedSecret');
const status = document.getElementById('status');

void loadSettings();
form.addEventListener('submit', saveSettings);

async function loadSettings() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  appBaseUrlInput.value = stored.appBaseUrl || DEFAULT_SETTINGS.appBaseUrl;
  sharedSecretInput.value = stored.sharedSecret || DEFAULT_SETTINGS.sharedSecret;
}

async function saveSettings(event) {
  event.preventDefault();

  const settings = {
    appBaseUrl: appBaseUrlInput.value.trim().replace(/\/+$/, ''),
    sharedSecret: sharedSecretInput.value.trim(),
  };

  await chrome.storage.local.set(settings);
  status.textContent = 'Saved';
  window.setTimeout(() => {
    status.textContent = '';
  }, 1500);
}
