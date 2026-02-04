(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  const PRICE_SELECTOR = "span.a-price";
  const DELIVERY_SELECTOR = "[data-csa-c-delivery-price]";

  const REVIEW_SELECTOR = [
    "[data-cy=\"reviews-block\"]",
    ".a-icon-star",
    ".a-icon-star-mini",
    ".a-icon-star-small",
    ".a-star-mini",
    ".a-star-small",
    ".a-star-medium",
    ".mvt-review-star",
    ".mvt-review-star-mini",
    "[aria-label*='out of 5 stars']",
    "[aria-label*='ratings']"
  ].join(",");

  const EXCLUDED_SELECTOR = [
    "#selectQuantity",
    "#quantity",
    ".a-dropdown-container",
    ".a-dropdown-prompt",
    ".a-native-dropdown",
    ".a-button-dropdown"
  ].join(",");

  const ATTR_AMAZON_ORIGINAL = "data-epc-amazon-original";
  const ATTR_AMAZON_CONVERTED = "data-epc-amazon-converted";
  const ATTR_AMAZON_TARGET = "data-epc-amazon-target";
  const ATTR_AMAZON_DELIVERY_ORIGINAL = "data-epc-amazon-delivery-original";

  let observer = null;
  let currentContext = null;
  let currentStats = null;
  let currentFormatter = null;
  let rateCache = {};
  let targetCurrency = null;
  let sourceOverride = null;
  let siteCurrency = null;
  let processing = false;
  let pendingRoots = [];

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

  function updateStats() {
    if (!currentStats) {
      return;
    }
    currentStats.timestamp = Date.now();
    if (currentContext?.updateStats) {
      currentContext.updateStats(currentStats);
    }
  }

  function normalizeText(text) {
    return (text || "").replace(/[\u00A0\u202F]/g, " ").trim();
  }

  function stripCurrencyMarkers(text) {
    return text.replace(/€|£|\$|Kč|Kc|zł|zl|Ft|CHF|Fr|EUR|USD|GBP|CZK|PLN|HUF/gi, "");
  }

  function isPriceLikeText(text) {
    if (!text || typeof text !== "string") {
      return false;
    }
    const trimmed = normalizeText(text);
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

  function collectTargets(rootNode, selector) {
    if (!rootNode) {
      return [];
    }
    if (rootNode.nodeType === Node.DOCUMENT_NODE || rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      return Array.from(rootNode.querySelectorAll(selector));
    }
    if (rootNode.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }
    const element = rootNode;
    const matches = [];
    if (element.matches(selector)) {
      matches.push(element);
    }
    matches.push(...element.querySelectorAll(selector));
    return matches;
  }

  function shouldSkipElement(el) {
    if (!el) {
      return true;
    }
    if (el.closest(REVIEW_SELECTOR)) {
      return true;
    }
    if (el.closest(EXCLUDED_SELECTOR)) {
      return true;
    }
    return false;
  }

  function getPrimaryTextNode(el) {
    if (!el) {
      return null;
    }
    return Array.from(el.childNodes).find((node) => node.nodeType === Node.TEXT_NODE) || null;
  }

  function formatValueParts(value, formatter) {
    const parts = formatter.formatToParts(value);
    let currency = "";
    let integer = "";
    let decimal = "";
    let fraction = "";
    let sign = "";

    for (const part of parts) {
      if (part.type === "currency") {
        currency = part.value;
      } else if (part.type === "integer" || part.type === "group") {
        integer += part.value;
      } else if (part.type === "decimal") {
        decimal = part.value;
      } else if (part.type === "fraction") {
        fraction += part.value;
      } else if (part.type === "minusSign") {
        sign = part.value;
      }
    }

    if (sign) {
      integer = `${sign}${integer}`;
    }

    return {
      formatted: formatter.format(value),
      currency,
      integer,
      decimal,
      fraction
    };
  }

  function snapshotPrice(priceEl, mode) {
    if (!priceEl || priceEl.hasAttribute(ATTR_AMAZON_ORIGINAL)) {
      return;
    }
    const offscreen = priceEl.querySelector(".a-offscreen");
    const symbol = priceEl.querySelector(".a-price-symbol");
    const whole = priceEl.querySelector(".a-price-whole");
    const decimal = priceEl.querySelector(".a-price-decimal");
    const fraction = priceEl.querySelector(".a-price-fraction");
    const ariaHidden = priceEl.querySelector('span[aria-hidden="true"]');
    const wholeTextNode = getPrimaryTextNode(whole);

    const snapshot = {
      mode,
      offscreen: offscreen ? offscreen.textContent : null,
      symbol: symbol ? symbol.textContent : null,
      wholeText: wholeTextNode ? wholeTextNode.nodeValue : null,
      hadWholeTextNode: Boolean(wholeTextNode),
      decimal: decimal ? decimal.textContent : null,
      fraction: fraction ? fraction.textContent : null,
      ariaHidden: ariaHidden ? ariaHidden.textContent : null,
      text: priceEl.textContent || null
    };

    priceEl.setAttribute(ATTR_AMAZON_ORIGINAL, JSON.stringify(snapshot));
  }

  function restorePrice(priceEl) {
    if (!priceEl) {
      return;
    }
    const raw = priceEl.getAttribute(ATTR_AMAZON_ORIGINAL);
    if (!raw) {
      return;
    }
    let snapshot = null;
    try {
      snapshot = JSON.parse(raw);
    } catch (err) {
      snapshot = null;
    }
    if (!snapshot) {
      priceEl.removeAttribute(ATTR_AMAZON_ORIGINAL);
      priceEl.removeAttribute(ATTR_AMAZON_CONVERTED);
      return;
    }

    const offscreen = priceEl.querySelector(".a-offscreen");
    const symbol = priceEl.querySelector(".a-price-symbol");
    const whole = priceEl.querySelector(".a-price-whole");
    const decimal = priceEl.querySelector(".a-price-decimal");
    const fraction = priceEl.querySelector(".a-price-fraction");
    const ariaHidden = priceEl.querySelector('span[aria-hidden="true"]');

    if (snapshot.offscreen != null && offscreen) {
      offscreen.textContent = snapshot.offscreen;
    }

    if (snapshot.mode === "structured") {
      if (symbol && snapshot.symbol != null) {
        symbol.textContent = snapshot.symbol;
      }
      if (whole) {
        const textNode = getPrimaryTextNode(whole);
        if (snapshot.hadWholeTextNode) {
          if (textNode) {
            textNode.nodeValue = snapshot.wholeText || "";
          } else if (snapshot.wholeText != null) {
            whole.insertBefore(document.createTextNode(snapshot.wholeText), decimal || null);
          }
        } else if (textNode) {
          whole.removeChild(textNode);
        }
      }
      if (decimal && snapshot.decimal != null) {
        decimal.textContent = snapshot.decimal;
      }
      if (fraction && snapshot.fraction != null) {
        fraction.textContent = snapshot.fraction;
      }
    } else if (snapshot.mode === "aria" && ariaHidden) {
      ariaHidden.textContent = snapshot.ariaHidden || "";
    } else if (snapshot.mode === "text") {
      priceEl.textContent = snapshot.text || "";
    }

    priceEl.removeAttribute(ATTR_AMAZON_ORIGINAL);
    priceEl.removeAttribute(ATTR_AMAZON_CONVERTED);
    priceEl.removeAttribute(ATTR_AMAZON_TARGET);
  }

  function getPriceText(priceEl) {
    if (!priceEl) {
      return "";
    }
    const offscreen = priceEl.querySelector(".a-offscreen");
    if (offscreen && offscreen.textContent) {
      return offscreen.textContent.trim();
    }
    const ariaHidden = priceEl.querySelector('span[aria-hidden="true"]');
    if (ariaHidden && ariaHidden.textContent) {
      return ariaHidden.textContent.trim();
    }
    const symbol = priceEl.querySelector(".a-price-symbol")?.textContent || "";
    const whole = priceEl.querySelector(".a-price-whole")?.textContent || "";
    const fraction = priceEl.querySelector(".a-price-fraction")?.textContent || "";
    const combined = `${symbol}${whole}${fraction}`.replace(/\s+/g, " ").trim();
    if (combined) {
      return combined;
    }
    return (priceEl.textContent || "").trim();
  }

  function detectCurrencyFromPrice(priceEl, text) {
    if (!EPC.detectCurrency) {
      return null;
    }
    const symbol = priceEl?.querySelector(".a-price-symbol")?.textContent || "";
    const symbolDetected = EPC.detectCurrency(symbol);
    if (symbolDetected?.currency) {
      return symbolDetected;
    }
    const direct = EPC.detectCurrency(text || "");
    if (direct?.currency) {
      return direct;
    }
    return null;
  }

  function applyPrice(priceEl, value, formatter) {
    if (!priceEl || !formatter) {
      return false;
    }
    const resolvedCurrency = formatter.resolvedOptions?.().currency || targetCurrency;
    const storedTarget = priceEl.getAttribute(ATTR_AMAZON_TARGET);
    const hasChildConversions = Boolean(priceEl.querySelector("[data-epc-converted]"));
    const isConverted = priceEl.getAttribute(ATTR_AMAZON_CONVERTED) === "1";
    const shouldReapply = isConverted && (hasChildConversions || (storedTarget && storedTarget !== resolvedCurrency));
    if (isConverted && !shouldReapply) {
      return false;
    }

    const offscreen = priceEl.querySelector(".a-offscreen");
    const symbol = priceEl.querySelector(".a-price-symbol");
    const whole = priceEl.querySelector(".a-price-whole");
    const decimal = priceEl.querySelector(".a-price-decimal");
    const fraction = priceEl.querySelector(".a-price-fraction");
    const ariaHidden = priceEl.querySelector('span[aria-hidden="true"]');

    const parts = formatValueParts(value, formatter);
    const hasStructured = Boolean(whole && fraction);
    const mode = hasStructured ? "structured" : ariaHidden ? "aria" : "text";

    snapshotPrice(priceEl, mode);

    if (offscreen) {
      offscreen.textContent = parts.formatted;
    }

    if (hasStructured) {
      if (symbol && parts.currency) {
        symbol.textContent = parts.currency;
      }
      const textNode = getPrimaryTextNode(whole);
      if (textNode) {
        textNode.nodeValue = parts.integer;
      } else if (whole) {
        whole.textContent = parts.integer;
      }
      if (decimal) {
        decimal.textContent = parts.fraction ? parts.decimal || "." : "";
      }
      if (fraction) {
        fraction.textContent = parts.fraction || "";
      }
    } else if (ariaHidden) {
      ariaHidden.textContent = parts.formatted;
    } else {
      priceEl.textContent = parts.formatted;
    }

    priceEl.setAttribute(ATTR_AMAZON_CONVERTED, "1");
    if (resolvedCurrency) {
      priceEl.setAttribute(ATTR_AMAZON_TARGET, resolvedCurrency);
    }
    return true;
  }

  function restoreGenericArtifactsInPrice(priceEl) {
    if (!priceEl || !EPC.restoreElement) {
      return;
    }
    const converted = priceEl.querySelectorAll("[data-epc-converted]");
    for (const node of converted) {
      EPC.restoreElement(node);
    }
  }

  function getFirstTextNodeWithCurrency(el) {
    if (!el) {
      return null;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 50) {
      const text = normalizeText(node.nodeValue || "");
      if (text && EPC.detectCurrency && EPC.detectCurrency(text)) {
        return node;
      }
      scanned += 1;
      node = walker.nextNode();
    }
    return null;
  }

  function convertDeliveryMessage(el, rate, formatter) {
    if (!el || !formatter) {
      return false;
    }
    if (el.getAttribute(ATTR_AMAZON_CONVERTED) === "1") {
      return false;
    }
    const raw = el.getAttribute("data-csa-c-delivery-price") || "";
    const trimmed = normalizeText(raw);
    if (!trimmed) {
      return false;
    }
    const detected = EPC.detectCurrency ? EPC.detectCurrency(trimmed) : null;
    if (!detected?.currency) {
      return false;
    }
    const parsed = EPC.parsePrice ? EPC.parsePrice(trimmed) : null;
    if (parsed == null) {
      return false;
    }

    const textNode = getFirstTextNodeWithCurrency(el);
    if (!textNode) {
      return false;
    }

    if (!el.hasAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL)) {
      el.setAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL, JSON.stringify({ value: textNode.nodeValue }));
    }

    const formatted = formatter.format(parsed * rate);
    const nodeText = textNode.nodeValue || "";
    textNode.nodeValue = nodeText.replace(raw, formatted).replace(trimmed, formatted);
    el.setAttribute(ATTR_AMAZON_CONVERTED, "1");
    return true;
  }

  function restoreDeliveryMessage(el) {
    if (!el) {
      return;
    }
    const raw = el.getAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL);
    if (!raw) {
      return;
    }
    let snapshot = null;
    try {
      snapshot = JSON.parse(raw);
    } catch (err) {
      snapshot = null;
    }
    if (!snapshot?.value) {
      el.removeAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL);
      return;
    }
    const textNode = getFirstTextNodeWithCurrency(el);
    if (textNode) {
      textNode.nodeValue = snapshot.value;
    }
    el.removeAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL);
    el.removeAttribute(ATTR_AMAZON_CONVERTED);
  }

  function getCurrencyFromInputs() {
    const inputs = Array.from(
      document.querySelectorAll(
        "input[name$='[customerVisiblePrice][currencyCode]'], input[id$='[customerVisiblePrice][currencyCode]']"
      )
    );
    for (const input of inputs) {
      const value = (input.value || "").trim();
      if (value) {
        return value.toUpperCase();
      }
    }
    return null;
  }

  function inferAmazonCurrency() {
    if (siteCurrency) {
      return siteCurrency;
    }
    const fromInputs = getCurrencyFromInputs();
    if (fromInputs) {
      siteCurrency = fromInputs;
      return siteCurrency;
    }
    const nodes = Array.from(
      document.querySelectorAll(".a-price .a-price-symbol, .a-price .a-offscreen")
    ).slice(0, 30);
    const counts = {};
    for (const node of nodes) {
      const text = (node.textContent || "").trim();
      if (!text) {
        continue;
      }
      const detected = EPC.detectCurrency ? EPC.detectCurrency(text) : null;
      if (detected?.currency) {
        counts[detected.currency] = (counts[detected.currency] || 0) + 1;
      }
    }
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (entries.length > 0) {
      siteCurrency = entries[0][0];
      return siteCurrency;
    }
    const inferred = EPC.inferSiteCurrency ? EPC.inferSiteCurrency() : null;
    siteCurrency = inferred?.currency || null;
    return siteCurrency;
  }

  function ensureSourceCurrency(stats, currency) {
    if (!stats.sourceCurrency && currency) {
      stats.sourceCurrency = currency;
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

  async function processTargets(rootNode) {
    if (!currentStats || !currentFormatter) {
      return;
    }

    const priceTargets = collectTargets(rootNode, PRICE_SELECTOR).filter((el) => !shouldSkipElement(el));
    const deliveryTargets = collectTargets(rootNode, DELIVERY_SELECTOR);

    if (!priceTargets.length && !deliveryTargets.length) {
      updateStats();
      return;
    }

    for (const priceEl of priceTargets) {
      restoreGenericArtifactsInPrice(priceEl);
      const priceText = getPriceText(priceEl);
      if (!isPriceLikeText(priceText)) {
        continue;
      }

      currentStats.found += 1;

      const detected = detectCurrencyFromPrice(priceEl, priceText);
      const fromCurrency = sourceOverride || detected?.currency || inferAmazonCurrency();

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

      const parsed = EPC.parsePrice ? EPC.parsePrice(priceText) : null;
      if (parsed == null) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "parse_failed");
        continue;
      }

      const rate = await getRateCached(fromCurrency, targetCurrency);
      if (!rate) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "no_rate");
        continue;
      }

      if (applyPrice(priceEl, parsed * rate, currentFormatter)) {
        currentStats.converted += 1;
      } else {
        currentStats.skipped += 1;
        bumpReason(currentStats, "already_converted");
      }
    }

    for (const deliveryEl of deliveryTargets) {
      if (deliveryEl.closest(REVIEW_SELECTOR)) {
        continue;
      }
      const raw = deliveryEl.getAttribute("data-csa-c-delivery-price") || "";
      if (!isPriceLikeText(raw)) {
        continue;
      }
      currentStats.found += 1;

      const detected = EPC.detectCurrency ? EPC.detectCurrency(raw) : null;
      const fromCurrency = sourceOverride || detected?.currency || inferAmazonCurrency();
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

      const rate = await getRateCached(fromCurrency, targetCurrency);
      if (!rate) {
        currentStats.skipped += 1;
        bumpReason(currentStats, "no_rate");
        continue;
      }

      if (convertDeliveryMessage(deliveryEl, rate, currentFormatter)) {
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
      await processTargets(rootNode);
    }
    processing = false;
  }

  function enqueue(rootNode) {
    pendingRoots.push(rootNode);
    runQueue();
  }

  function restoreAll() {
    const prices = document.querySelectorAll(`[${ATTR_AMAZON_ORIGINAL}]`);
    for (const priceEl of prices) {
      restorePrice(priceEl);
    }
    const deliveries = document.querySelectorAll(`[${ATTR_AMAZON_DELIVERY_ORIGINAL}]`);
    for (const deliveryEl of deliveries) {
      restoreDeliveryMessage(deliveryEl);
    }
  }

  async function start(context) {
    currentContext = context;
    targetCurrency = context.targetCurrency || "EUR";
    sourceOverride = context.sourceCurrencyOverride || context.forcedSourceCurrency || null;
    rateCache = {};
    siteCurrency = null;

    currentFormatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: targetCurrency
    });

    currentStats = createStats(context.hostname);
    if (sourceOverride) {
      currentStats.sourceCurrency = sourceOverride;
    } else {
      const inferred = inferAmazonCurrency();
      if (inferred) {
        currentStats.sourceCurrency = inferred;
      }
    }
    updateStats();

    if (sourceOverride && sourceOverride === targetCurrency) {
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
    targetCurrency = null;
    sourceOverride = null;
    siteCurrency = null;
    restoreAll();
  }

  EPC.siteAdapters.amazon = {
    start,
    stop
  };
})();
