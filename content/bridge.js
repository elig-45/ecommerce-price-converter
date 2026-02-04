import alzaAdapter from "./alza.js";
import { DEFAULT_FROM, DEFAULT_TO } from "../core/currency_service.js";

const hostname = window.location.hostname || "";
const isSupportedSite = hostname.endsWith("alza.cz");
const siteAdapter = isSupportedSite ? alzaAdapter : null;

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: DEFAULT_TO
};

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

async function requestRate(targetCurrency) {
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
  if (!siteAdapter) {
    throw new Error("unsupported_site");
  }

  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  const targetCurrency = settings.preferredTargetCurrency || DEFAULT_TO;
  const formatter = createFormatter(targetCurrency);
  const rateResponse = await requestRate(targetCurrency);

  siteAdapter.start({ rate: rateResponse.rate, formatter });

  return { ok: true };
}

function restoreConversion() {
  if (!siteAdapter) {
    throw new Error("unsupported_site");
  }
  siteAdapter.stop();
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
});

async function initAutoApply() {
  if (!siteAdapter) {
    return;
  }
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (getEffectiveEnabled(settings)) {
    try {
      await applyConversion();
    } catch (err) {
      // Rate unavailable or other error; stay disabled.
    }
  }
}

initAutoApply();
