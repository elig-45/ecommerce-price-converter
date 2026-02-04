import { DEFAULT_FROM, DEFAULT_TO } from "../core/currency_service.js";

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: DEFAULT_TO
};

const toggleGlobal = document.getElementById("toggleGlobal");
const toggleSite = document.getElementById("toggleSite");
const siteSubtext = document.getElementById("siteSubtext");
const rateValue = document.getElementById("rateValue");
const rateText = document.getElementById("rateText");
const lastUpdated = document.getElementById("lastUpdated");
const refreshBtn = document.getElementById("refreshBtn");
const toastContainer = document.getElementById("toastContainer");

let enabledGlobal = true;
let siteOverrides = {};
let preferredTargetCurrency = DEFAULT_TO;
let activeTabId = null;
let hostname = "";
let isSupportedHost = false;
let appLoading = true;
let rateLoading = false;

function setAppLoading(isLoading) {
  appLoading = isLoading;
  document.body.dataset.loading = isLoading ? "true" : "false";
  toggleGlobal.disabled = isLoading;
  toggleSite.disabled = isLoading || !hostname || !isSupportedHost;
  refreshBtn.disabled = isLoading || rateLoading;
}

function setRateLoading(isLoading) {
  rateLoading = isLoading;
  rateValue.classList.toggle("loading", isLoading);
  refreshBtn.disabled = isLoading || appLoading;
  refreshBtn.dataset.loading = isLoading ? "true" : "false";
}

function showToast(message, variant = "error") {
  const toast = document.createElement("div");
  toast.className = `toast ${variant}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, 2600);
}

function formatTimestamp(ts) {
  if (typeof ts !== "number") {
    return "--";
  }
  return new Date(ts).toLocaleString();
}

function getEffectiveEnabled() {
  const override = siteOverrides?.[hostname];
  if (typeof override === "boolean") {
    return override;
  }
  return Boolean(enabledGlobal);
}

function normalizeOverridesForGlobal(newGlobal) {
  const normalized = { ...siteOverrides };
  for (const [host, value] of Object.entries(normalized)) {
    if (value === newGlobal) {
      delete normalized[host];
    }
  }
  return normalized;
}

function updateSiteToggleUI() {
  toggleSite.checked = getEffectiveEnabled();
}

function updateSiteSubtext() {
  if (!hostname) {
    siteSubtext.textContent = "Unsupported page";
    return;
  }
  if (!isSupportedHost) {
    siteSubtext.textContent = "Unsupported site (Alza.cz only)";
    return;
  }
  siteSubtext.textContent = hostname;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve) => {
    if (typeof tabId !== "number") {
      resolve({ ok: false, error: "no_active_tab" });
      return;
    }

    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(response);
      }
    });
  });
}

async function applyToContent() {
  const effectiveEnabled = getEffectiveEnabled();
  const type = effectiveEnabled ? "CONTENT_APPLY" : "CONTENT_RESTORE";
  const response = await sendTabMessage(activeTabId, {
    type,
    enabled: effectiveEnabled,
    hostname
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "content_unavailable");
  }

  return response;
}

async function loadRate(force = false) {
  setRateLoading(true);
  const response = await sendRuntimeMessage({
    type: force ? "RATE_REFRESH" : "RATE_GET",
    from: DEFAULT_FROM,
    to: preferredTargetCurrency
  });

  if (response && response.ok) {
    const formatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: preferredTargetCurrency
    });
    rateText.textContent = `1 ${DEFAULT_FROM} = ${formatter.format(response.rate)}`;
    const ts = formatTimestamp(response.ts);
    const staleSuffix = response.stale ? " (stale)" : "";
    lastUpdated.textContent = `Last updated: ${ts}${staleSuffix}`;
  } else {
    rateText.textContent = "Rate unavailable";
    lastUpdated.textContent = "Last updated: --";
    showToast("Rate unavailable. Check connection.", "error");
  }

  setRateLoading(false);
}

async function init() {
  setAppLoading(true);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs.length > 0 ? tabs[0] : null;
  activeTabId = activeTab?.id ?? null;

  try {
    if (activeTab?.url) {
      const url = new URL(activeTab.url);
      hostname = url.hostname;
      isSupportedHost = hostname.endsWith("alza.cz");
    }
  } catch (err) {
    hostname = "";
    isSupportedHost = false;
  }

  updateSiteSubtext();

  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  enabledGlobal = stored.enabledGlobal ?? true;
  siteOverrides = stored.siteOverrides && typeof stored.siteOverrides === "object" ? stored.siteOverrides : {};
  preferredTargetCurrency = stored.preferredTargetCurrency || DEFAULT_TO;

  if (!stored.preferredTargetCurrency) {
    chrome.storage.local.set({ preferredTargetCurrency: DEFAULT_TO });
  }

  toggleGlobal.checked = enabledGlobal;
  updateSiteToggleUI();
  toggleSite.disabled = !hostname || !isSupportedHost;

  setAppLoading(false);
  await loadRate(false);
}

toggleGlobal.addEventListener("change", async () => {
  const previousGlobal = enabledGlobal;
  const previousOverrides = { ...siteOverrides };

  enabledGlobal = toggleGlobal.checked;
  siteOverrides = normalizeOverridesForGlobal(enabledGlobal);
  updateSiteToggleUI();

  await chrome.storage.local.set({
    enabledGlobal,
    siteOverrides
  });

  try {
    await applyToContent();
  } catch (err) {
    enabledGlobal = previousGlobal;
    siteOverrides = previousOverrides;
    toggleGlobal.checked = previousGlobal;
    updateSiteToggleUI();

    await chrome.storage.local.set({
      enabledGlobal: previousGlobal,
      siteOverrides: previousOverrides
    });

    showToast("Could not apply changes on this page.", "error");
  }
});

toggleSite.addEventListener("change", async () => {
  const previousOverrides = { ...siteOverrides };
  const previousEffective = getEffectiveEnabled();
  const desired = toggleSite.checked;

  if (hostname) {
    if (desired === enabledGlobal) {
      delete siteOverrides[hostname];
    } else {
      siteOverrides[hostname] = desired;
    }
  }

  await chrome.storage.local.set({ siteOverrides });

  try {
    await applyToContent();
  } catch (err) {
    siteOverrides = previousOverrides;
    toggleSite.checked = previousEffective;
    await chrome.storage.local.set({ siteOverrides: previousOverrides });
    showToast("Could not apply changes on this page.", "error");
  }
});

refreshBtn.addEventListener("click", async () => {
  if (rateLoading || appLoading) {
    return;
  }
  await loadRate(true);

  if (getEffectiveEnabled()) {
    try {
      await applyToContent();
    } catch (err) {
      showToast("Rate refreshed, but page update failed.", "error");
    }
  }
});

init();
