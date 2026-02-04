(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  const selectors = [
    "span.js-price-box__primary-price__value",
    "span.price-box__primary-price__value",
    "span.coupon-block__price"
  ];

  const selectorQuery = selectors.join(",");

  let observer = null;
  let currentRate = null;
  let currentFormatter = null;
  let currentStats = null;
  let currentContext = null;

  function createStats(hostname, sourceCurrency, targetCurrency) {
    return {
      hostname,
      sourceCurrency,
      targetCurrency,
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

  function collectTargets(rootNode) {
    if (!rootNode) {
      return [];
    }
    if (rootNode.nodeType === Node.DOCUMENT_NODE) {
      return Array.from(rootNode.querySelectorAll(selectorQuery));
    }
    if (rootNode.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }
    const element = rootNode;
    const matches = [];
    if (element.matches(selectorQuery)) {
      matches.push(element);
    }
    matches.push(...element.querySelectorAll(selectorQuery));
    return matches;
  }

  function processTargets(rootNode) {
    if (!currentStats || !currentFormatter) {
      return;
    }
    const targets = collectTargets(rootNode);
    if (targets.length === 0) {
      return;
    }

    for (const el of targets) {
      const text = el.getAttribute("data-epc-original") || el.textContent || "";
      currentStats.found += 1;

      if (currentStats.sourceCurrency === currentStats.targetCurrency) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "same_currency");
        continue;
      }

      const parsed = EPC.parsePrice ? EPC.parsePrice(text) : null;
      if (parsed == null) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "parse_failed");
        continue;
      }

      if (!currentRate) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "no_rate");
        continue;
      }

      const result = EPC.convertElement(el, currentRate, currentFormatter);
      if (result.changed) {
        currentStats.converted += 1;
      } else {
        currentStats.skipped += 1;
        bumpReason(currentStats, "already_converted");
      }
    }

    currentStats.timestamp = Date.now();
    if (currentContext?.updateStats) {
      currentContext.updateStats(currentStats);
    }
  }

  async function start(context) {
    currentContext = context;
    const fromCurrency = context.forcedSourceCurrency || "CZK";
    const toCurrency = context.targetCurrency || "EUR";
    currentStats = createStats(context.hostname, fromCurrency, toCurrency);

    if (fromCurrency === toCurrency) {
      currentContext.updateStats(currentStats);
      return;
    }

    try {
      const rateResponse = await context.getRate(fromCurrency, toCurrency);
      currentRate = rateResponse?.rate || null;
    } catch (err) {
      currentRate = null;
      currentStats.skipped = currentStats.found;
      bumpReason(currentStats, "no_rate");
      currentContext.updateStats(currentStats);
      return;
    }

    currentFormatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: toCurrency
    });

    processTargets(document);

    if (!observer && EPC.createObserver) {
      observer = EPC.createObserver({
        debounceMs: 200,
        maxNodes: 1000,
        onNodes(nodes) {
          for (const node of nodes) {
            processTargets(node);
          }
        }
      });
    }

    observer?.start(document.body || document.documentElement);
  }

  function stop() {
    observer?.stop();
    observer = null;
    currentRate = null;
    currentFormatter = null;
    currentContext = null;
    currentStats = null;
    EPC.scanAndRestore(document, selectors);
  }

  EPC.siteAdapters.alza = {
    selectors,
    start,
    stop
  };
})();
