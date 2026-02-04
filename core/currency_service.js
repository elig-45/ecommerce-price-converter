(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});
  const currency = (EPC.currency = EPC.currency || {});

  const DEFAULT_FROM = "CZK";
  const DEFAULT_TO = "EUR";
  const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

  function makePairKey(from, to) {
    return `${from}->${to}`;
  }

  function isCacheFresh(ts) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) {
      return false;
    }
    return Date.now() - ts < CACHE_TTL_MS;
  }

  async function fetchRate(from = DEFAULT_FROM, to = DEFAULT_TO) {
    const url = `https://api.frankfurter.app/latest?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error("rate_fetch_failed");
    }
    const data = await response.json();
    const rate = data?.rates?.[to];
    if (typeof rate !== "number" || !Number.isFinite(rate)) {
      throw new Error("rate_invalid");
    }
    return rate;
  }

  function normalizeRateCache(raw) {
    if (EPC.storage?.normalizeRateCache) {
      return EPC.storage.normalizeRateCache(raw);
    }
    if (!raw || typeof raw !== "object") {
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

  async function readRateCache() {
    if (!chrome?.storage?.local) {
      throw new Error("storage_unavailable");
    }
    const stored = await chrome.storage.local.get({ rateCache: {} });
    const normalized = normalizeRateCache(stored.rateCache);
    if (normalized.migrated) {
      await chrome.storage.local.set({ rateCache: normalized.data });
    }
    return normalized.data;
  }

  async function writeRateCache(pairKey, rate) {
    if (!chrome?.storage?.local) {
      throw new Error("storage_unavailable");
    }
    const cache = await readRateCache();
    cache[pairKey] = { rate, ts: Date.now() };
    await chrome.storage.local.set({ rateCache: cache });
    return cache[pairKey];
  }

  async function getRate({ force = false, from = DEFAULT_FROM, to = DEFAULT_TO } = {}) {
    const pairKey = makePairKey(from, to);
    const cache = await readRateCache();
    const entry = cache[pairKey];

    if (!force && entry && isCacheFresh(entry.ts)) {
      return { rate: entry.rate, ts: entry.ts, stale: false, source: "cache", pair: pairKey };
    }

    try {
      const rate = await fetchRate(from, to);
      const saved = await writeRateCache(pairKey, rate);
      return { rate: saved.rate, ts: saved.ts, stale: false, source: "api", pair: pairKey };
    } catch (err) {
      if (entry && typeof entry.rate === "number") {
        return { rate: entry.rate, ts: entry.ts, stale: true, source: "cache", pair: pairKey };
      }
      throw err;
    }
  }

  currency.DEFAULT_FROM = DEFAULT_FROM;
  currency.DEFAULT_TO = DEFAULT_TO;
  currency.CACHE_TTL_MS = CACHE_TTL_MS;
  currency.makePairKey = makePairKey;
  currency.isCacheFresh = isCacheFresh;
  currency.fetchRate = fetchRate;
  currency.getRate = getRate;
})();
