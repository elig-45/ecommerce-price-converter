const CURRENCIES = ["EUR", "USD", "GBP", "CZK", "PLN", "HUF", "CHF"];
const SOURCE_AUTO = "AUTO";

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: "EUR",
  siteCurrencyOverrides: {},
  lastRunStats: null
};

const subtitle = document.getElementById("subtitle");
const toggleGlobal = document.getElementById("toggleGlobal");
const toggleSite = document.getElementById("toggleSite");
const siteSubtext = document.getElementById("siteSubtext");
const targetSelect = document.getElementById("targetCurrency");
const sourceSelect = document.getElementById("sourceCurrency");
const sourceHint = document.getElementById("sourceHint");
const rateValue = document.getElementById("rateValue");
const rateText = document.getElementById("rateText");
const lastUpdated = document.getElementById("lastUpdated");
const refreshBtn = document.getElementById("refreshBtn");
const statFound = document.getElementById("statFound");
const statConverted = document.getElementById("statConverted");
const statSkipped = document.getElementById("statSkipped");
const reportBtn = document.getElementById("reportBtn");
const copyBtn = document.getElementById("copyBtn");
const toastContainer = document.getElementById("toastContainer");

let enabledGlobal = true;
let siteOverrides = {};
let siteCurrencyOverrides = {};
let preferredTargetCurrency = "EUR";
let activeTabId = null;
let activeTabUrl = "";
let hostname = "";
let lastStats = null;
let appLoading = true;
let rateLoading = false;

function setAppLoading(isLoading) {
  appLoading = isLoading;
  document.body.dataset.loading = isLoading ? "true" : "false";
  toggleGlobal.disabled = isLoading;
  toggleSite.disabled = isLoading || !hostname;
  targetSelect.disabled = isLoading;
  sourceSelect.disabled = isLoading || !hostname || isAlzaHost();
  refreshBtn.disabled = isLoading || rateLoading;
}

function setRateLoading(isLoading) {
  rateLoading = isLoading;
  rateValue.classList.toggle("loading", isLoading);
  refreshBtn.disabled = isLoading || appLoading || !getSourceCurrency().source;
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

function isAlzaHost() {
  return hostname.endsWith("alza.cz");
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
  siteSubtext.textContent = hostname;
}

function getSourceCurrency() {
  const forced = isAlzaHost() ? "CZK" : null;
  const override = siteCurrencyOverrides?.[hostname] || null;
  const detected = lastStats?.sourceCurrency || null;
  const source = forced || override || detected || null;
  return { source, forced, override, detected };
}

function updateSourceHint() {
  const { forced, override, detected } = getSourceCurrency();
  if (forced) {
    sourceHint.textContent = `Forced: ${forced}`;
    return;
  }
  if (override) {
    sourceHint.textContent = `Override: ${override}`;
    return;
  }
  if (detected) {
    sourceHint.textContent = `Detected: ${detected}`;
    return;
  }
  sourceHint.textContent = "Detected: --";
}

function updateSubtitle() {
  const source = getSourceCurrency().source || "?";
  subtitle.textContent = `${source} -> ${preferredTargetCurrency}`;
}

function populateSelects() {
  targetSelect.innerHTML = "";
  for (const currency of CURRENCIES) {
    const option = document.createElement("option");
    option.value = currency;
    option.textContent = currency;
    targetSelect.appendChild(option);
  }
  targetSelect.value = preferredTargetCurrency;

  sourceSelect.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = SOURCE_AUTO;
  autoOption.textContent = "Auto";
  sourceSelect.appendChild(autoOption);
  for (const currency of CURRENCIES) {
    const option = document.createElement("option");
    option.value = currency;
    option.textContent = currency;
    sourceSelect.appendChild(option);
  }

  if (isAlzaHost()) {
    sourceSelect.value = "CZK";
  } else if (siteCurrencyOverrides?.[hostname]) {
    sourceSelect.value = siteCurrencyOverrides[hostname];
  } else {
    sourceSelect.value = SOURCE_AUTO;
  }
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
    hostname
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "content_unavailable");
  }

  return response;
}

async function loadRate(force = false) {
  const { source } = getSourceCurrency();
  if (!source) {
    rateText.textContent = "Source currency unknown";
    lastUpdated.textContent = "Last updated: --";
    refreshBtn.disabled = true;
    return;
  }

  setRateLoading(true);
  const response = await sendRuntimeMessage({
    type: force ? "RATE_REFRESH" : "RATE_GET",
    from: source,
    to: preferredTargetCurrency
  });

  if (response && response.ok) {
    const formatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: preferredTargetCurrency
    });
    rateText.textContent = `1 ${source} = ${formatter.format(response.rate)}`;
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

async function loadStats() {
  const response = await sendTabMessage(activeTabId, { type: "STATS_GET", hostname });
  if (response?.ok && response.stats) {
    lastStats = response.stats;
  } else {
    const stored = await chrome.storage.local.get({ lastRunStats: null });
    if (stored.lastRunStats && stored.lastRunStats.hostname === hostname) {
      lastStats = stored.lastRunStats;
    }
  }

  statFound.textContent = lastStats?.found ?? "--";
  statConverted.textContent = lastStats?.converted ?? "--";
  statSkipped.textContent = lastStats?.skipped ?? "--";

  updateSourceHint();
  updateSubtitle();
  await loadRate(false);
}

function buildDebugInfo() {
  const version = chrome.runtime.getManifest().version;
  const stats = lastStats || {};
  const sourceInfo = getSourceCurrency();
  const timestamp = new Date().toISOString();

  const lines = [
    `Hostname: ${hostname || "--"}`,
    `URL: ${activeTabUrl || "--"}`,
    `Extension version: ${version}`,
    `Target currency: ${preferredTargetCurrency}`,
    `Detected source currency: ${sourceInfo.detected || "--"}`,
    `Source override: ${sourceInfo.override || "--"}`,
    `Forced source currency: ${sourceInfo.forced || "--"}`,
    `Stats: found=${stats.found ?? "--"}, converted=${stats.converted ?? "--"}, skipped=${stats.skipped ?? "--"}`,
    `Reason counts: ${JSON.stringify(stats.reasonCounts || {})}`,
    `Timestamp: ${timestamp}`
  ];

  return lines.join("\n");
}

function buildIssueUrl() {
  const title = `Price conversion issue on ${hostname || "unknown site"}`;
  const body = `## Report\n\n${buildDebugInfo()}`;
  const base = "https://github.com/elig-45/ecommerce-price-converter/issues/new";
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

async function init() {
  setAppLoading(true);

  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const activeTab = tabs && tabs.length > 0 ? tabs[0] : null;
  activeTabId = activeTab?.id ?? null;
  activeTabUrl = activeTab?.url || "";

  try {
    if (activeTabUrl) {
      const url = new URL(activeTabUrl);
      hostname = url.hostname;
    }
  } catch (err) {
    hostname = "";
  }

  updateSiteSubtext();

  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  enabledGlobal = stored.enabledGlobal ?? true;
  siteOverrides = stored.siteOverrides && typeof stored.siteOverrides === "object" ? stored.siteOverrides : {};
  siteCurrencyOverrides =
    stored.siteCurrencyOverrides && typeof stored.siteCurrencyOverrides === "object" ? stored.siteCurrencyOverrides : {};
  preferredTargetCurrency = stored.preferredTargetCurrency || "EUR";

  toggleGlobal.checked = enabledGlobal;
  updateSiteToggleUI();
  populateSelects();

  setAppLoading(false);
  await loadStats();
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
    await loadStats();
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
    await loadStats();
  } catch (err) {
    siteOverrides = previousOverrides;
    toggleSite.checked = previousEffective;
    await chrome.storage.local.set({ siteOverrides: previousOverrides });
    showToast("Could not apply changes on this page.", "error");
  }
});

targetSelect.addEventListener("change", async () => {
  const previousTarget = preferredTargetCurrency;
  preferredTargetCurrency = targetSelect.value;
  updateSubtitle();

  await chrome.storage.local.set({ preferredTargetCurrency });

  try {
    if (getEffectiveEnabled()) {
      await applyToContent();
    }
    await loadStats();
    await loadRate(false);
  } catch (err) {
    preferredTargetCurrency = previousTarget;
    targetSelect.value = previousTarget;
    updateSubtitle();
    await chrome.storage.local.set({ preferredTargetCurrency: previousTarget });
    showToast("Could not apply currency change.", "error");
  }
});

sourceSelect.addEventListener("change", async () => {
  const previousOverrides = { ...siteCurrencyOverrides };
  const previousValue = previousOverrides[hostname] || SOURCE_AUTO;
  const selected = sourceSelect.value;

  if (hostname) {
    if (selected === SOURCE_AUTO) {
      delete siteCurrencyOverrides[hostname];
    } else {
      siteCurrencyOverrides[hostname] = selected;
    }
  }

  await chrome.storage.local.set({ siteCurrencyOverrides });

  try {
    if (getEffectiveEnabled()) {
      await applyToContent();
    }
    await loadStats();
  } catch (err) {
    siteCurrencyOverrides = previousOverrides;
    sourceSelect.value = previousValue;
    await chrome.storage.local.set({ siteCurrencyOverrides: previousOverrides });
    showToast("Could not apply source currency.", "error");
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
      await loadStats();
    } catch (err) {
      showToast("Rate refreshed, but page update failed.", "error");
    }
  }
});

reportBtn.addEventListener("click", () => {
  if (!hostname) {
    showToast("No active site to report.", "error");
    return;
  }
  chrome.tabs.create({ url: buildIssueUrl() });
});

copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(buildDebugInfo());
    showToast("Debug info copied.", "success");
  } catch (err) {
    showToast("Copy failed.", "error");
  }
});

init();
