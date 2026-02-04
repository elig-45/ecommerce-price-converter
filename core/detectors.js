(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});

  const MARKERS = [
    { re: /€|\bEUR\b/i, currency: "EUR", confidence: "high", weight: 3 },
    { re: /\bUSD\b|\bUS\s*\$\b|\$/i, currency: "USD", confidence: "medium", weight: 1 },
    { re: /£|\bGBP\b/i, currency: "GBP", confidence: "high", weight: 3 },
    { re: /\bCZK\b|Kč|Kc/i, currency: "CZK", confidence: "high", weight: 3 },
    { re: /\bPLN\b|zł/i, currency: "PLN", confidence: "high", weight: 3 },
    { re: /\bHUF\b|Ft/i, currency: "HUF", confidence: "high", weight: 2 },
    { re: /\bCHF\b|(?:\bFr\b\.?)/i, currency: "CHF", confidence: "medium", weight: 2 }
  ];

  function detectCurrency(text) {
    if (typeof text !== "string") {
      return null;
    }
    let best = null;
    for (const marker of MARKERS) {
      if (marker.re.test(text)) {
        if (!best || marker.weight > best.weight) {
          best = marker;
        }
      }
    }
    if (!best) {
      return null;
    }
    return { currency: best.currency, confidence: best.confidence, source: "explicit" };
  }

  let cachedSiteCurrency = null;
  let cachedAt = 0;

  function inferSiteCurrency() {
    if (cachedSiteCurrency) {
      return cachedSiteCurrency;
    }
    const body = document.body || document.documentElement;
    if (!body) {
      return null;
    }

    const counts = {};
    const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 400) {
      const text = (node.nodeValue || "").trim();
      if (text.length > 0 && text.length < 80) {
        const detected = detectCurrency(text);
        if (detected && detected.confidence === "high") {
          counts[detected.currency] = (counts[detected.currency] || 0) + 1;
        }
      }
      scanned += 1;
      node = walker.nextNode();
    }

    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (entries.length === 0) {
      return null;
    }

    const [bestCurrency, bestCount] = entries[0];
    const secondCount = entries[1]?.[1] || 0;

    if (bestCount >= 3 && bestCount >= secondCount * 2) {
      cachedSiteCurrency = { currency: bestCurrency, confidence: "high", source: "site" };
      cachedAt = Date.now();
      return cachedSiteCurrency;
    }

    return null;
  }

  EPC.detectCurrency = detectCurrency;
  EPC.inferSiteCurrency = inferSiteCurrency;
})();
