const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  theme: "system"
});

const enabledInput = document.querySelector("#enabled");
const themeInput = document.querySelector("#theme");
const status = document.querySelector("#status");
let statusTimer;

function announce(message) {
  window.clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = window.setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  enabledInput.checked = settings.enabled;
  themeInput.value = settings.theme;
}

enabledInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ enabled: enabledInput.checked });
  announce(enabledInput.checked ? "Enhancements enabled" : "Enhancements paused");
});

themeInput.addEventListener("change", async () => {
  await chrome.storage.local.set({ theme: themeInput.value });
  announce("Appearance updated");
});

loadSettings();

