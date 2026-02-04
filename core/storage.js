(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});

  const DEFAULT_SETTINGS = {
    enabledGlobal: true,
    siteOverrides: {},
    preferredTargetCurrency: "EUR",
    siteCurrencyOverrides: {},
    rateCache: {},
    lastRunStats: null,
    uiLanguage: "en"
  };

  function isPlainObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeRateCache(raw) {
    if (!isPlainObject(raw)) {
      return { data: {}, migrated: false };
    }
    if (typeof raw.rate === "number" && typeof raw.ts === "number") {
      return { data: { "CZK->EUR": { rate: raw.rate, ts: raw.ts } }, migrated: true };
    }
    const data = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value && typeof value.rate === "number" && typeof value.ts === "number") {
        data[key] = { rate: value.rate, ts: value.ts };
      }
    }
    return { data, migrated: false };
  }

  async function getSettings() {
    if (!chrome?.storage?.local) {
      throw new Error("storage_unavailable");
    }
    const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
    const settings = {
      enabledGlobal: stored.enabledGlobal !== false,
      siteOverrides: isPlainObject(stored.siteOverrides) ? stored.siteOverrides : {},
      preferredTargetCurrency:
        typeof stored.preferredTargetCurrency === "string"
          ? stored.preferredTargetCurrency
          : DEFAULT_SETTINGS.preferredTargetCurrency,
      uiLanguage:
        typeof stored.uiLanguage === "string" ? stored.uiLanguage : DEFAULT_SETTINGS.uiLanguage,
      siteCurrencyOverrides: isPlainObject(stored.siteCurrencyOverrides) ? stored.siteCurrencyOverrides : {},
      rateCache: {},
      lastRunStats: isPlainObject(stored.lastRunStats) ? stored.lastRunStats : null
    };

    const normalized = normalizeRateCache(stored.rateCache);
    settings.rateCache = normalized.data;

    if (normalized.migrated) {
      await chrome.storage.local.set({ rateCache: normalized.data });
    }

    return settings;
  }

  async function setSettings(partial) {
    if (!chrome?.storage?.local) {
      throw new Error("storage_unavailable");
    }
    if (!isPlainObject(partial)) {
      return;
    }
    await chrome.storage.local.set(partial);
  }

  function ensureDefaults() {
    if (!chrome?.storage?.local) {
      return;
    }
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
      const normalized = normalizeRateCache(stored.rateCache);
      if (normalized.migrated) {
        updates.rateCache = normalized.data;
      }
      if (Object.keys(updates).length > 0) {
        chrome.storage.local.set(updates);
      }
    });
  }

  EPC.storage = {
    DEFAULT_SETTINGS,
    normalizeRateCache,
    getSettings,
    setSettings,
    ensureDefaults
  };
})();
