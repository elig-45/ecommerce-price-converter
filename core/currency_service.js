export const DEFAULT_FROM = "CZK";
export const DEFAULT_TO = "EUR";
export const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const STORAGE_KEY = "rateCache";

export function isCacheFresh(ts) {
  if (typeof ts !== "number" || !Number.isFinite(ts)) {
    return false;
  }
  return Date.now() - ts < CACHE_TTL_MS;
}

export async function fetchRate(from = DEFAULT_FROM, to = DEFAULT_TO) {
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

async function readRateCache() {
  if (!chrome?.storage?.local) {
    throw new Error("storage_unavailable");
  }
  const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
  const cache = stored[STORAGE_KEY];
  if (!cache || typeof cache.rate !== "number" || typeof cache.ts !== "number") {
    return null;
  }
  if (!Number.isFinite(cache.rate) || !Number.isFinite(cache.ts)) {
    return null;
  }
  return { rate: cache.rate, ts: cache.ts };
}

async function writeRateCache(rate) {
  if (!chrome?.storage?.local) {
    throw new Error("storage_unavailable");
  }
  const cache = { rate, ts: Date.now() };
  await chrome.storage.local.set({ [STORAGE_KEY]: cache });
  return cache;
}

export async function getRate({ force = false, from = DEFAULT_FROM, to = DEFAULT_TO } = {}) {
  const cache = await readRateCache();

  if (!force && cache && isCacheFresh(cache.ts)) {
    return { rate: cache.rate, ts: cache.ts, stale: false, source: "cache" };
  }

  try {
    const rate = await fetchRate(from, to);
    const saved = await writeRateCache(rate);
    return { rate: saved.rate, ts: saved.ts, stale: false, source: "api" };
  } catch (err) {
    if (cache && typeof cache.rate === "number") {
      return { rate: cache.rate, ts: cache.ts, stale: true, source: "cache" };
    }
    throw err;
  }
}
