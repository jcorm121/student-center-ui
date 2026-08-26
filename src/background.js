const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  theme: "system"
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set(stored);
});

