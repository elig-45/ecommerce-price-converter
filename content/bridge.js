const DEFAULT_FROM = "CZK";
const DEFAULT_TO = "EUR";

const hostname = window.location.hostname || "";
const isSupportedSite = hostname.endsWith("alza.cz");

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: DEFAULT_TO
};

function log(message, data) {
  const ts = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[epc ${ts}] ${message}`, data);
  } else {
    console.log(`[epc ${ts}] ${message}`);
  }
}

function getSiteAdapter() {
  if (!isSupportedSite) {
    log("⚠️ Unsupported site", { hostname });
    return null;
  }
  const adapter = window.EPC?.siteAdapters?.alza || null;
  if (!adapter) {
    log("⚠️ Adapter not ready", { hostname, hasEpc: Boolean(window.EPC) });
  }
  return adapter;
}

function getEffectiveEnabled(settings) {
  const override = settings.siteOverrides?.[hostname];
  if (typeof override === "boolean") {
    return override;
  }
  return Boolean(settings.enabledGlobal);
}

function createFormatter(currency) {
  return new Intl.NumberFormat(navigator.language, {
    style: "currency",
    currency
  });
}

function sendRuntimeMessage(message) {
  log("📨 Sending runtime message", message);
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        log("❌ Runtime message error", chrome.runtime.lastError.message);
        resolve({ ok: false, error: chrome.runtime.lastError.message });
      } else {
        log("✅ Runtime message response", response);
        resolve(response);
      }
    });
  });
}

async function requestRate(targetCurrency) {
  log("💱 Requesting rate", { from: DEFAULT_FROM, to: targetCurrency });
  const response = await sendRuntimeMessage({
    type: "RATE_GET",
    from: DEFAULT_FROM,
    to: targetCurrency
  });

  if (!response || !response.ok) {
    throw new Error(response?.error || "rate_unavailable");
  }

  return response;
}

async function applyConversion() {
  log("🚀 Apply conversion requested");
  const siteAdapter = getSiteAdapter();
  if (!siteAdapter) {
    log("❌ Apply failed: unsupported_site");
    throw new Error("unsupported_site");
  }

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  log("📦 Loaded settings", settings);
  const targetCurrency = settings.preferredTargetCurrency || DEFAULT_TO;
  const formatter = createFormatter(targetCurrency);
  const rateResponse = await requestRate(targetCurrency);

  siteAdapter.start({ rate: rateResponse.rate, formatter });
  log("✅ Conversion started", { rate: rateResponse.rate, currency: targetCurrency });

  return { ok: true };
}

function restoreConversion() {
  log("↩️ Restore conversion requested");
  const siteAdapter = getSiteAdapter();
  if (!siteAdapter) {
    log("❌ Restore failed: unsupported_site");
    throw new Error("unsupported_site");
  }
  siteAdapter.stop();
  log("✅ Conversion stopped");
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  log("📥 Content message received", message);
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
});

async function initAutoApply() {
  log("🟡 initAutoApply()");
  const siteAdapter = getSiteAdapter();
  if (!siteAdapter) {
    return;
  }
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  log("📦 Loaded settings (auto)", settings);
  if (getEffectiveEnabled(settings)) {
    try {
      await applyConversion();
    } catch (err) {
      log("❌ Auto-apply failed", err?.message || err);
      // Rate unavailable or other error; stay disabled.
    }
  } else {
    log("⏸️ Auto-apply skipped (disabled)");
  }
}

initAutoApply();
