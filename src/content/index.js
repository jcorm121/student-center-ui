(() => {
  const ROOT_CLASS = "scu-extension-enabled";
  const MOUNT_ID = "scu-extension-root";
  const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    theme: "system"
  });

  let settings = { ...DEFAULT_SETTINGS };
  let observer = null;
  let pollTimer = null;
  let scheduled = false;

  function getRoute() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
  }

  function ensureMountPoint() {
    if (!document.body || document.getElementById(MOUNT_ID)) return;

    const root = document.createElement("div");
    root.id = MOUNT_ID;
    root.dataset.route = getRoute();
    root.setAttribute("aria-hidden", "true");
    document.body.append(root);
  }

  function applySettings() {
    const enabled = Boolean(settings.enabled);
    document.documentElement.classList.toggle(ROOT_CLASS, enabled);
    document.documentElement.dataset.scuTheme = settings.theme;

    if (enabled) {
      ensureMountPoint();
      startPolling();
    } else {
      stopPolling();
      globalThis.SCU.dashboard?.unmount();
      document.getElementById(MOUNT_ID)?.remove();
    }
  }

  function enhancePage() {
    scheduled = false;
    if (!settings.enabled) return;

    ensureMountPoint();
    const root = document.getElementById(MOUNT_ID);
    if (root) root.dataset.route = getRoute();

    globalThis.SCU.dashboard?.refresh();
  }

  function scheduleEnhancement() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(enhancePage);
  }

  function observePage() {
    observer?.disconnect();
    observer = new MutationObserver(scheduleEnhancement);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function startPolling() {
    if (pollTimer !== null) return;
    pollTimer = window.setInterval(scheduleEnhancement, 1200);
  }

  function stopPolling() {
    if (pollTimer === null) return;
    window.clearInterval(pollTimer);
    pollTimer = null;
  }

  async function initialize() {
    settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
    applySettings();
    observePage();
    scheduleEnhancement();
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    for (const [key, change] of Object.entries(changes)) {
      settings[key] = change.newValue;
    }

    applySettings();
    scheduleEnhancement();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize, { once: true });
  } else {
    initialize();
  }
})();
