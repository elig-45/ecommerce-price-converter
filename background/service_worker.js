importScripts("../core/storage.js", "../core/currency_service.js");

const EPC = self.EPC || {};

chrome.runtime.onInstalled.addListener(() => {
  if (EPC.storage?.ensureDefaults) {
    EPC.storage.ensureDefaults();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "RATE_GET" || message.type === "RATE_REFRESH") {
    const force = message.type === "RATE_REFRESH";
    const from = typeof message.from === "string" ? message.from : "CZK";
    const to = typeof message.to === "string" ? message.to : "EUR";

    EPC.currency
      .getRate({ force, from, to })
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "rate_unavailable" }));

    return true;
  }

  if (message.type === "SETTINGS_GET") {
    EPC.storage
      .getSettings()
      .then((settings) => sendResponse({ ok: true, settings }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "settings_unavailable" }));
    return true;
  }

  if (message.type === "SETTINGS_SET") {
    const partial = message.partial && typeof message.partial === "object" ? message.partial : {};
    EPC.storage
      .setSettings(partial)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err?.message || "settings_save_failed" }));
    return true;
  }
});
