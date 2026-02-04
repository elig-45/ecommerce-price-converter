(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  const IGNORE_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "TEXTAREA",
    "INPUT",
    "SELECT",
    "OPTION",
    "CODE",
    "PRE"
  ]);

  let observer = null;
  let currentContext = null;
  let currentStats = null;
  let currentFormatter = null;
  let processing = false;
  let pendingRoots = [];
  let rateCache = {};
  let siteCurrency = null;
  let sourceOverride = null;
  let targetCurrency = null;

  function createStats(hostname) {
    return {
      hostname,
      sourceCurrency: null,
      targetCurrency: targetCurrency || null,
      found: 0,
      converted: 0,
      skipped: 0,
      reasonCounts: {},
      timestamp: Date.now()
    };
  }

  function bumpReason(stats, reason) {
    stats.reasonCounts[reason] = (stats.reasonCounts[reason] || 0) + 1;
  }

  function stripCurrencyMarkers(text) {
    return text.replace(/€|£|\$|Kč|Kc|zł|zl|Ft|CHF|Fr|EUR|USD|GBP|CZK|PLN|HUF/gi, "");
  }

  function isPriceLikeText(text) {
    if (!text || typeof text !== "string") {
      return false;
    }
    const normalized = text.replace(/[\u00A0\u202F]/g, " ");
    const trimmed = normalized.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      return false;
    }
    if (!/\d/.test(trimmed)) {
      return false;
    }
    const stripped = stripCurrencyMarkers(trimmed);
    if (!/^[\d\s.,-]+$/.test(stripped)) {
      return false;
    }
    if (/[A-Za-z]/.test(stripped)) {
      return false;
    }
    return true;
  }

  function collectCandidateElements(rootNode) {
    const candidates = new Set();
    if (!rootNode) {
      return [];
    }
    const rootElement = rootNode.nodeType === Node.DOCUMENT_NODE ? rootNode.body : rootNode;
    if (!rootElement) {
      return [];
    }
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 1500) {
      const parent = node.parentElement;
      if (parent && !IGNORE_TAGS.has(parent.tagName) && parent.childElementCount === 0) {
        const text = (node.nodeValue || "").replace(/[\u00A0\u202F]/g, " ").trim();
        if (isPriceLikeText(text)) {
          candidates.add(parent);
        }
      }
      scanned += 1;
      node = walker.nextNode();
    }
    return Array.from(candidates);
  }

  function updateStats() {
    if (!currentStats) {
      return;
    }
    currentStats.timestamp = Date.now();
    if (currentContext?.updateStats) {
      currentContext.updateStats(currentStats);
    }
  }

  function ensureSourceCurrency(stats, explicitCurrency) {
    if (stats.sourceCurrency) {
      return;
    }
    if (sourceOverride) {
      stats.sourceCurrency = sourceOverride;
    } else if (siteCurrency?.currency) {
      stats.sourceCurrency = siteCurrency.currency;
    } else if (explicitCurrency) {
      stats.sourceCurrency = explicitCurrency;
    }
  }

  async function getRateCached(from, to) {
    const key = `${from}->${to}`;
    if (rateCache[key]) {
      return rateCache[key];
    }
    const promise = currentContext
      .getRate(from, to)
      .then((res) => res?.rate || null)
      .catch(() => null);
    rateCache[key] = promise;
    return promise;
  }

  async function processElements(rootNode) {
    if (!currentStats || !currentFormatter) {
      return;
    }
    const elements = collectCandidateElements(rootNode);
    if (!elements.length) {
      updateStats();
      return;
    }

    for (const el of elements) {
      const text = el.getAttribute("data-epc-original") || el.textContent || "";
      const trimmed = text.trim();
      if (!isPriceLikeText(trimmed)) {
        continue;
      }

      currentStats.found += 1;

      if (!sourceOverride && !siteCurrency?.currency && EPC.inferSiteCurrency) {
        siteCurrency = EPC.inferSiteCurrency();
      }

      const detected = EPC.detectCurrency ? EPC.detectCurrency(trimmed) : null;
      const explicitCurrency = detected?.currency || null;
      const fromCurrency = explicitCurrency || sourceOverride || siteCurrency?.currency || null;

      if (!fromCurrency) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "unknown_currency");
        continue;
      }

      ensureSourceCurrency(currentStats, fromCurrency);

      if (fromCurrency === targetCurrency) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "same_currency");
        continue;
      }

      const parsed = EPC.parsePrice ? EPC.parsePrice(trimmed) : null;
      if (parsed == null) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "parse_failed");
        continue;
      }

      let rate = null;
      try {
        rate = await getRateCached(fromCurrency, targetCurrency);
      } catch (err) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "no_rate");
        continue;
      }

      if (!rate) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "no_rate");
        continue;
      }

      const result = EPC.convertElement(el, rate, currentFormatter);
      if (result.changed) {
        currentStats.converted += 1;
      } else {
        currentStats.skipped += 1;
        bumpReason(currentStats, "already_converted");
      }
    }

    updateStats();
  }

  async function runQueue() {
    if (processing) {
      return;
    }
    processing = true;
    while (pendingRoots.length > 0) {
      const rootNode = pendingRoots.shift();
      await processElements(rootNode);
    }
    processing = false;
  }

  function enqueue(rootNode) {
    pendingRoots.push(rootNode);
    runQueue();
  }

  function restoreAll() {
    const nodes = document.querySelectorAll("[data-epc-converted]");
    for (const node of nodes) {
      EPC.restoreElement(node);
    }
  }

  async function start(context) {
    currentContext = context;
    targetCurrency = context.targetCurrency || "EUR";
    sourceOverride = context.sourceCurrencyOverride || null;
    rateCache = {};
    siteCurrency = sourceOverride ? { currency: sourceOverride } : EPC.inferSiteCurrency?.();

    currentFormatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: targetCurrency
    });

    currentStats = createStats(context.hostname);
    if (siteCurrency?.currency && !currentStats.sourceCurrency) {
      currentStats.sourceCurrency = siteCurrency.currency;
    }

    if (
      (sourceOverride && sourceOverride === targetCurrency) ||
      (siteCurrency?.currency && siteCurrency.currency === targetCurrency)
    ) {
      restoreAll();
      updateStats();
      return;
    }

    enqueue(document);

    if (!observer && EPC.createObserver) {
      observer = EPC.createObserver({
        debounceMs: 200,
        maxNodes: 1000,
        onNodes(nodes) {
          for (const node of nodes) {
            enqueue(node);
          }
        }
      });
    }

    observer?.start(document.body || document.documentElement);
  }

  function stop() {
    observer?.stop();
    observer = null;
    processing = false;
    pendingRoots = [];
    currentFormatter = null;
    currentContext = null;
    currentStats = null;
    rateCache = {};
    siteCurrency = null;
    restoreAll();
  }

  EPC.siteAdapters.generic = {
    start,
    stop
  };
})();
