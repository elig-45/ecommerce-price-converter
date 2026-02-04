const EPC = (window.EPC = window.EPC || {});
const i18n = EPC.i18n || null;

function t(key, vars, fallback) {
  if (i18n?.t) {
    return i18n.t(key, vars, fallback);
  }
  if (typeof fallback === "string") {
    return fallback;
  }
  if (typeof key === "string") {
    return key;
  }
  return "";
}

const CURRENCIES = ["EUR", "USD", "GBP", "CZK", "PLN", "HUF", "CHF"];
const SOURCE_AUTO = "AUTO";

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: "EUR",
  siteCurrencyOverrides: {},
  lastRunStats: null,
  uiLanguage: "en"
};

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
const toastContainer = document.getElementById("toastContainer");
const amazonMessage = document.getElementById("amazonMessage");
const mainContent = document.getElementById("mainContent");

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
  const locale = i18n?.getLanguage ? i18n.getLanguage() : undefined;
  return new Date(ts).toLocaleString(locale || undefined);
}

function isAlzaHost() {
  return hostname.endsWith("alza.cz");
}

function isAmazonHost() {
  if (!hostname) {
    return false;
  }
  const isAmazon = /(^|\.)amazon\./i.test(hostname);
  const excluded = /amazonaws\.com$|amazonpay\.|amazonstatic\.com$/i.test(hostname);
  return isAmazon && !excluded;
}

function updateAmazonMessage() {
  if (!amazonMessage) {
    return;
  }
  const isAmazon = isAmazonHost();
  amazonMessage.hidden = !isAmazon;
  if (mainContent) {
    mainContent.hidden = isAmazon;
  }
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
    siteSubtext.textContent = t("unsupported_page", null, "Unsupported page");
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
    sourceHint.textContent = t("source_hint_forced", { value: forced }, `Forced: ${forced}`);
    return;
  }
  if (override) {
    sourceHint.textContent = t("source_hint_override", { value: override }, `Override: ${override}`);
    return;
  }
  if (detected) {
    sourceHint.textContent = t("source_hint_detected", { value: detected }, `Detected: ${detected}`);
    return;
  }
  sourceHint.textContent = t("source_hint_none", null, "Detected: --");
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
  autoOption.textContent = t("auto_label", null, "Auto");
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

function isIgnorableMessageError(message) {
  if (!message) {
    return false;
  }
  return (
    message.includes("Receiving end does not exist") ||
    message.includes("message port closed") ||
    message.includes("No tab with id") ||
    message.includes("no_active_tab")
  );
}

async function loadRate(force = false) {
  const { source } = getSourceCurrency();
  if (!source) {
    rateText.textContent = "--";
    lastUpdated.textContent = t("last_updated_unknown", null, "Last updated: --");
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
    rateText.textContent = t(
      "rate_line",
      { source, rate: formatter.format(response.rate) },
      `1 ${source} = ${formatter.format(response.rate)}`
    );
    const ts = formatTimestamp(response.ts);
    const staleKey = response.stale ? "last_updated_stale" : "last_updated";
    const fallback = `Last updated: ${ts}${response.stale ? " (stale)" : ""}`;
    lastUpdated.textContent = t(staleKey, { ts }, fallback);
  } else {
    rateText.textContent = t("rate_unavailable", null, "Rate unavailable");
    lastUpdated.textContent = t("last_updated_unknown", null, "Last updated: --");
    showToast(t("rate_unavailable_toast", null, "Rate unavailable. Check connection."), "error");
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
  await loadRate(false);
}

function buildDebugInfo() {
  const version = chrome.runtime.getManifest().version;
  const stats = lastStats || {};
  const sourceInfo = getSourceCurrency();
  const timestamp = new Date().toISOString();

  const lines = [
    t("debug_hostname", { value: hostname || "--" }, `Hostname: ${hostname || "--"}`),
    t("debug_url", { value: activeTabUrl || "--" }, `URL: ${activeTabUrl || "--"}`),
    t("debug_extension_version", { value: version }, `Extension version: ${version}`),
    t("debug_target_currency", { value: preferredTargetCurrency }, `Target currency: ${preferredTargetCurrency}`),
    t(
      "debug_detected_source_currency",
      { value: sourceInfo.detected || "--" },
      `Detected source currency: ${sourceInfo.detected || "--"}`
    ),
    t("debug_source_override", { value: sourceInfo.override || "--" }, `Source override: ${sourceInfo.override || "--"}`),
    t(
      "debug_forced_source_currency",
      { value: sourceInfo.forced || "--" },
      `Forced source currency: ${sourceInfo.forced || "--"}`
    ),
    t(
      "debug_stats",
      {
        found: stats.found ?? "--",
        converted: stats.converted ?? "--",
        skipped: stats.skipped ?? "--"
      },
      `Stats: found=${stats.found ?? "--"}, converted=${stats.converted ?? "--"}, skipped=${stats.skipped ?? "--"}`
    ),
    t(
      "debug_reason_counts",
      { value: JSON.stringify(stats.reasonCounts || {}) },
      `Reason counts: ${JSON.stringify(stats.reasonCounts || {})}`
    ),
    t("debug_timestamp", { value: timestamp }, `Timestamp: ${timestamp}`)
  ];

  return lines.join("\n");
}

function exposeDebugInfo() {
  EPC.getDebugInfo = () => buildDebugInfo();
}

function buildIssueUrl() {
  const siteLabel = hostname || t("unknown_site", null, "unknown site");
  const title = t("issue_title", { site: siteLabel }, `Price conversion issue on ${siteLabel}`);
  const body = `## ${t("issue_report_heading", null, "Report")}\n\n${buildDebugInfo()}`;
  const base = "https://github.com/elig-45/ecommerce-price-converter/issues/new";
  return `${base}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

async function init() {
  setAppLoading(true);

  if (i18n?.init) {
    await i18n.init();
    if (i18n.applyTranslations) {
      i18n.applyTranslations(document);
    }
    document.documentElement.lang = i18n.getLanguage();
  }

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
  updateAmazonMessage();

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
  exposeDebugInfo();
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
    const msg = err?.message || "";
    if (isIgnorableMessageError(msg)) {
      showToast(
        t("settings_saved_next_load", null, "Settings saved. Will apply on the next page load."),
        "error"
      );
      return;
    }

    enabledGlobal = previousGlobal;
    siteOverrides = previousOverrides;
    toggleGlobal.checked = previousGlobal;
    updateSiteToggleUI();

    await chrome.storage.local.set({
      enabledGlobal: previousGlobal,
      siteOverrides: previousOverrides
    });

    showToast(t("apply_failed", null, "Could not apply changes on this page."), "error");
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
    const msg = err?.message || "";
    if (isIgnorableMessageError(msg)) {
      showToast(
        t("settings_saved_next_load", null, "Settings saved. Will apply on the next page load."),
        "error"
      );
      return;
    }

    siteOverrides = previousOverrides;
    toggleSite.checked = previousEffective;
    await chrome.storage.local.set({ siteOverrides: previousOverrides });
    showToast(t("apply_failed", null, "Could not apply changes on this page."), "error");
  }
});

targetSelect.addEventListener("change", async () => {
  const previousTarget = preferredTargetCurrency;
  preferredTargetCurrency = targetSelect.value;

  await chrome.storage.local.set({ preferredTargetCurrency });

  try {
    if (getEffectiveEnabled()) {
      await applyToContent();
    }
    await loadStats();
    await loadRate(false);
  } catch (err) {
    const msg = err?.message || "";
    if (isIgnorableMessageError(msg)) {
      showToast(
        t("settings_saved_next_load", null, "Settings saved. Will apply on the next page load."),
        "error"
      );
      return;
    }

    preferredTargetCurrency = previousTarget;
    targetSelect.value = previousTarget;
    await chrome.storage.local.set({ preferredTargetCurrency: previousTarget });
    showToast(t("currency_change_failed", null, "Could not apply currency change."), "error");
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
    const msg = err?.message || "";
    if (isIgnorableMessageError(msg)) {
      showToast(
        t("settings_saved_next_load", null, "Settings saved. Will apply on the next page load."),
        "error"
      );
      return;
    }

    siteCurrencyOverrides = previousOverrides;
    sourceSelect.value = previousValue;
    await chrome.storage.local.set({ siteCurrencyOverrides: previousOverrides });
    showToast(t("source_currency_failed", null, "Could not apply source currency."), "error");
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
      const msg = err?.message || "";
      if (isIgnorableMessageError(msg)) {
        showToast(
          t("rate_refreshed_next_load", null, "Rate refreshed. Will apply on the next page load."),
          "error"
        );
        return;
      }
      showToast(
        t("rate_refreshed_page_failed", null, "Rate refreshed, but page update failed."),
        "error"
      );
    }
  }
});

reportBtn.addEventListener("click", () => {
  if (!hostname) {
    showToast(t("no_active_site", null, "No active site to report."), "error");
    return;
  }
  chrome.tabs.create({ url: buildIssueUrl() });
});

init();
