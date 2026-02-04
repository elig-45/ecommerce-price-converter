const hostname = window.location.hostname || "";
const EPC = (window.EPC = window.EPC || {});

const DEFAULT_SETTINGS = EPC.storage?.DEFAULT_SETTINGS || {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: "EUR",
  siteCurrencyOverrides: {},
  rateCache: {},
  lastRunStats: null
};

let activeAdapter = null;
let lastStats = null;

function getEffectiveEnabled(settings) {
  const override = settings.siteOverrides?.[hostname];
  if (typeof override === "boolean") {
    return override;
  }
  return Boolean(settings.enabledGlobal);
}

function selectAdapter() {
  const rule = EPC.rules?.selectAdapter ? EPC.rules.selectAdapter(hostname) : { adapter: "generic" };
  const adapter = EPC.siteAdapters?.[rule.adapter] || EPC.siteAdapters?.generic || null;
  return { adapter, forcedSourceCurrency: rule.forcedSourceCurrency || null };
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

async function getRate(from, to) {
  const response = await sendRuntimeMessage({
    type: "RATE_GET",
    from,
    to
  });
  if (!response || !response.ok) {
    throw new Error(response?.error || "rate_unavailable");
  }
  return response;
}

function updateStats(stats) {
  lastStats = stats;
  chrome.storage.local.set({ lastRunStats: stats });
}

async function getSettings() {
  if (EPC.storage?.getSettings) {
    return EPC.storage.getSettings();
  }
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

async function applyConversion() {
  const settings = await getSettings();
  const targetCurrency = settings.preferredTargetCurrency || "EUR";
  const sourceOverride = settings.siteCurrencyOverrides?.[hostname] || null;
  const { adapter, forcedSourceCurrency } = selectAdapter();

  if (!adapter || typeof adapter.start !== "function") {
    throw new Error("adapter_unavailable");
  }

  if (activeAdapter && activeAdapter !== adapter && typeof activeAdapter.stop === "function") {
    activeAdapter.stop();
  }

  activeAdapter = adapter;

  await adapter.start({
    hostname,
    targetCurrency,
    sourceCurrencyOverride: sourceOverride,
    forcedSourceCurrency,
    getRate,
    updateStats
  });

  return { ok: true };
}

function restoreConversion() {
  if (activeAdapter?.stop) {
    activeAdapter.stop();
  }
  const emptyStats = {
    hostname,
    found: 0,
    converted: 0,
    skipped: 0,
    reasonCounts: {},
    timestamp: Date.now()
  };
  updateStats(emptyStats);
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "CONTENT_APPLY") {
    applyConversion()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "apply_failed" }));
    return true;
  }

  if (message.type === "CONTENT_RESTORE") {
    try {
      restoreConversion();
      sendResponse({ ok: true });
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || "restore_failed" });
    }
  }

  if (message.type === "STATS_GET") {
    sendResponse({ ok: true, stats: lastStats });
  }
});

async function initAutoApply() {
  const settings = await getSettings();
  if (getEffectiveEnabled(settings)) {
    try {
      await applyConversion();
    } catch (err) {
      // stay disabled on error
    }
  }
}

initAutoApply();
