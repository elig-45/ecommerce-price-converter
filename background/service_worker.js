import { DEFAULT_FROM, DEFAULT_TO, getRate } from "../core/currency_service.js";

const DEFAULT_SETTINGS = {
  enabledGlobal: true,
  siteOverrides: {},
  preferredTargetCurrency: DEFAULT_TO
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(DEFAULT_SETTINGS, (stored) => {
    if (chrome.runtime.lastError) {
      return;
    }
    const updates = {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      if (stored[key] === undefined) {
        updates[key] = value;
      }
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "RATE_GET" || message.type === "RATE_REFRESH") {
    const force = message.type === "RATE_REFRESH";
    const from = typeof message.from === "string" ? message.from : DEFAULT_FROM;
    const to = typeof message.to === "string" ? message.to : DEFAULT_TO;
    const ts = new Date().toISOString();
    console.log(`[epc ${ts}] 📡 Rate request`, { type: message.type, from, to, sender });

    getRate({ force, from, to })
      .then((data) => {
        console.log(`[epc ${new Date().toISOString()}] ✅ Rate response`, data);
        sendResponse({ ok: true, ...data });
      })
      .catch((err) => {
        console.log(`[epc ${new Date().toISOString()}] ❌ Rate error`, err?.message || err);
        sendResponse({ ok: false, error: err?.message || "rate_unavailable" });
      });

    return true;
  }
});
