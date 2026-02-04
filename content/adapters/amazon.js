(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  const STRUCTURED_SELECTOR = "span.a-price";
  const STRUCTURED_PART_SELECTOR = [
    "span.a-price",
    "span.a-price-whole",
    "span.a-price-fraction",
    "span.a-price-symbol",
    "span.a-offscreen"
  ].join(",");
  const ATTR_AMAZON_ORIGINAL = "data-epc-amazon-original";
  const ATTR_AMAZON_CONVERTED = "data-epc-amazon-converted";
  const ATTR_AMAZON_DELIVERY_ORIGINAL = "data-epc-amazon-delivery-original";
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
    "[aria-label*=\"out of 5 stars\"]",
    "[aria-label*=\"ratings\"]"
  ].join(",");

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

  const EXCLUDED_SIMPLE_SELECTOR = [
    "#selectQuantity",
    "#quantity",
    ".a-dropdown-container",
    ".a-dropdown-prompt",
    ".a-native-dropdown",
    ".a-button-dropdown"
  ].join(",");

  let observer = null;
  let currentContext = null;
  let currentStats = null;
  let currentFormatter = null;
  let rateCache = {};
  let targetCurrency = null;
  let sourceOverride = null;

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

  function ensureSourceCurrency(stats, fromCurrency) {
    if (!fromCurrency) {
      return;
    }
    if (!stats.sourceCurrency) {
      stats.sourceCurrency = fromCurrency;
      return;
    }
    if (stats.sourceCurrency !== fromCurrency) {
      stats.sourceCurrency = "MIXED";
    }
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

  function hasExplicitCurrency(text) {
    return Boolean(EPC.detectCurrency && EPC.detectCurrency(text));
  }

  function isExplicitPriceText(text) {
    return isPriceLikeText(text) && hasExplicitCurrency(text);
  }

  function collectStructuredTargets(rootNode) {
    if (!rootNode) {
      return [];
    }
    if (
      rootNode.nodeType === Node.DOCUMENT_NODE ||
      rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE
    ) {
      const matches = new Set();
      const seed = Array.from(rootNode.querySelectorAll(STRUCTURED_PART_SELECTOR));
      for (const node of seed) {
        if (node.closest(REVIEW_SELECTOR)) {
          continue;
        }
        const priceEl = node.closest(STRUCTURED_SELECTOR);
        if (priceEl && !priceEl.closest(REVIEW_SELECTOR)) {
          matches.add(priceEl);
        }
      }
      return Array.from(matches);
    }
    if (rootNode.nodeType !== Node.ELEMENT_NODE) {
      return [];
    }
    const element = rootNode;
    const matches = new Set();
    const seed = [];
    if (element.matches(STRUCTURED_PART_SELECTOR)) {
      seed.push(element);
    }
    seed.push(...element.querySelectorAll(STRUCTURED_PART_SELECTOR));
    for (const node of seed) {
      if (node.closest(REVIEW_SELECTOR)) {
        continue;
      }
      const priceEl = node.closest(STRUCTURED_SELECTOR);
      if (priceEl && !priceEl.closest(REVIEW_SELECTOR)) {
        matches.add(priceEl);
      }
    }
    return Array.from(matches);
  }

  function collectSimpleTargets(rootNode) {
    const candidates = new Set();
    if (!rootNode) {
      return [];
    }
    const rootElement =
      rootNode.nodeType === Node.DOCUMENT_NODE
        ? rootNode.body
        : rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE
        ? rootNode
        : rootNode;
    if (!rootElement) {
      return [];
    }
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 1500) {
      const parent = node.parentElement;
      if (
        parent &&
        !IGNORE_TAGS.has(parent.tagName) &&
        !parent.closest(STRUCTURED_SELECTOR) &&
        !parent.closest(REVIEW_SELECTOR) &&
        !parent.closest(EXCLUDED_SIMPLE_SELECTOR)
      ) {
        const text = (node.nodeValue || "").replace(/[\u00A0\u202F]/g, " ").trim();
        if (isExplicitPriceText(text)) {
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

  function detectCurrencyForElement(el, text) {
    if (EPC.detectCurrency) {
      const direct = EPC.detectCurrency(text || "");
      if (direct?.currency) {
        return direct;
      }
      const symbol = el?.querySelector(".a-price-symbol")?.textContent || "";
      const symbolDetected = EPC.detectCurrency(symbol);
      if (symbolDetected?.currency) {
        return symbolDetected;
      }
    }
    return null;
  }

  function getFirstTextNode(el) {
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

  function snapshotStructured(priceEl) {
    if (!priceEl || priceEl.hasAttribute(ATTR_AMAZON_ORIGINAL)) {
      return;
    }
    const offscreen = priceEl.querySelector(".a-offscreen");
    const symbol = priceEl.querySelector(".a-price-symbol");
    const whole = priceEl.querySelector(".a-price-whole");
    const decimal = priceEl.querySelector(".a-price-decimal");
    const fraction = priceEl.querySelector(".a-price-fraction");
    const wholeTextNode = getFirstTextNode(whole);

    const snapshot = {
      mode: "structured",
      offscreen: offscreen ? offscreen.textContent : null,
      symbol: symbol ? symbol.textContent : null,
      wholeText: wholeTextNode ? wholeTextNode.nodeValue : null,
      hadWholeTextNode: Boolean(wholeTextNode),
      decimal: decimal ? decimal.textContent : null,
      fraction: fraction ? fraction.textContent : null
    };

    priceEl.setAttribute(ATTR_AMAZON_ORIGINAL, JSON.stringify(snapshot));
  }

  function snapshotSimple(priceEl, mode, value, offscreenValue) {
    if (!priceEl || priceEl.hasAttribute(ATTR_AMAZON_ORIGINAL)) {
      return;
    }
    const snapshot = {
      mode,
      value,
      offscreen: offscreenValue || null
    };
    priceEl.setAttribute(ATTR_AMAZON_ORIGINAL, JSON.stringify(snapshot));
  }

  function getFirstTextNodeWithCurrency(el) {
    if (!el) {
      return null;
    }
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    let node = walker.nextNode();
    let scanned = 0;
    while (node && scanned < 50) {
      const text = (node.nodeValue || "").trim();
      if (text && hasExplicitCurrency(text)) {
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
    const deliveryPrice = el.getAttribute("data-csa-c-delivery-price") || "";
    const detected = EPC.detectCurrency ? EPC.detectCurrency(deliveryPrice) : null;
    if (!detected?.currency) {
      return false;
    }
    const parsed = EPC.parsePrice ? EPC.parsePrice(deliveryPrice) : null;
    if (parsed == null) {
      return false;
    }

    const textNode = getFirstTextNodeWithCurrency(el);
    if (!textNode) {
      return false;
    }

    if (!el.hasAttribute(ATTR_AMAZON_DELIVERY_ORIGINAL)) {
      el.setAttribute(
        ATTR_AMAZON_DELIVERY_ORIGINAL,
        JSON.stringify({ value: textNode.nodeValue })
      );
    }

    const formatted = formatter.format(parsed * rate);
    textNode.nodeValue = textNode.nodeValue.replace(deliveryPrice, formatted);
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

  function applyStructured(priceEl, value, formatter) {
    if (!priceEl || !formatter) {
      return false;
    }
    if (priceEl.getAttribute(ATTR_AMAZON_CONVERTED) === "1") {
      return false;
    }

    const offscreen = priceEl.querySelector(".a-offscreen");
    const symbol = priceEl.querySelector(".a-price-symbol");
    const whole = priceEl.querySelector(".a-price-whole");
    const decimal = priceEl.querySelector(".a-price-decimal");
    const fraction = priceEl.querySelector(".a-price-fraction");
    const ariaHidden = priceEl.querySelector('span[aria-hidden="true"]');

    const parts = formatValueParts(value, formatter);
    const hasStructuredParts = Boolean(whole && fraction);
    const originalOffscreen = offscreen ? offscreen.textContent : null;

    if (hasStructuredParts) {
      snapshotStructured(priceEl);
    } else if (ariaHidden) {
      snapshotSimple(priceEl, "aria", ariaHidden.textContent || "", originalOffscreen);
    } else {
      snapshotSimple(priceEl, "text", priceEl.textContent || "", originalOffscreen);
    }

    if (offscreen) {
      offscreen.textContent = parts.formatted;
    }

    if (hasStructuredParts) {
      if (symbol && parts.currency) {
        symbol.textContent = parts.currency;
      }
      const textNode = getFirstTextNode(whole);
      if (textNode) {
        textNode.nodeValue = parts.integer;
      } else if (decimal) {
        whole.insertBefore(document.createTextNode(parts.integer), decimal);
      } else {
        whole.textContent = parts.integer;
      }
      if (decimal) {
        decimal.textContent = parts.fraction ? parts.decimal || "." : "";
      }
      fraction.textContent = parts.fraction || "";
    } else if (ariaHidden) {
      ariaHidden.textContent = parts.formatted;
    } else {
      priceEl.textContent = parts.formatted;
    }

    priceEl.setAttribute(ATTR_AMAZON_CONVERTED, "1");
    return true;
  }

  function restoreStructured(priceEl) {
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
        const textNode = getFirstTextNode(whole);
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
      ariaHidden.textContent = snapshot.value || "";
    } else if (snapshot.mode === "text") {
      priceEl.textContent = snapshot.value || "";
    }

    priceEl.removeAttribute(ATTR_AMAZON_ORIGINAL);
    priceEl.removeAttribute(ATTR_AMAZON_CONVERTED);
  }

  function inferAmazonCurrencyFromUrl() {
    try {
      const url = new URL(window.location.href);
      const currency = url.searchParams.get("currency");
      if (currency) {
        return currency.toUpperCase();
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  function inferAmazonCurrency() {
    const fromUrl = inferAmazonCurrencyFromUrl();
    if (fromUrl) {
      return fromUrl;
    }
    const fromPrices = inferAmazonCurrencyFromPrices();
    if (fromPrices) {
      return fromPrices;
    }
    const candidates = [
      document.querySelector("#icp-currency-dropdown")?.value,
      document.querySelector(".icp-currency-symbol")?.textContent,
      document.querySelector("#icp-nav-flyout")?.textContent
    ];
    for (const candidate of candidates) {
      if (!candidate) {
        continue;
      }
      const detected = EPC.detectCurrency ? EPC.detectCurrency(candidate) : null;
      if (detected?.currency) {
        return detected.currency;
      }
    }
    const inferred = EPC.inferSiteCurrency ? EPC.inferSiteCurrency() : null;
    return inferred?.currency || null;
  }

  function inferAmazonCurrencyFromPrices() {
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
    if (entries.length === 0) {
      return null;
    }
    return entries[0][0];
  }

  async function processTargets(rootNode) {
    if (!currentStats || !currentFormatter) {
      return;
    }
    const structured = collectStructuredTargets(rootNode);
    const simple = collectSimpleTargets(rootNode);
    const deliveryNodes = rootNode
      ? Array.from(
          (rootNode.nodeType === Node.DOCUMENT_NODE || rootNode.nodeType === Node.DOCUMENT_FRAGMENT_NODE
            ? rootNode
            : rootNode).querySelectorAll
            ? rootNode.querySelectorAll(DELIVERY_SELECTOR)
            : []
        )
      : [];

    if (!structured.length && !simple.length && !deliveryNodes.length) {
      updateStats();
      return;
    }

    const tasks = [];

    for (const el of structured) {
      tasks.push({ kind: "structured", el });
    }
    for (const el of simple) {
      tasks.push({ kind: "simple", el });
    }
    for (const el of deliveryNodes) {
      tasks.push({ kind: "delivery", el });
    }

    for (const task of tasks) {
      const el = task.el;
      if (el.closest(REVIEW_SELECTOR)) {
        continue;
      }
      const text =
        task.kind === "structured"
          ? getPriceText(el)
          : task.kind === "delivery"
          ? el.getAttribute("data-csa-c-delivery-price") || el.textContent || ""
          : el.getAttribute("data-epc-original") || el.textContent || "";
      const trimmed = (text || "").trim();
      if (!isPriceLikeText(trimmed)) {
        continue;
      }

      currentStats.found += 1;

      const detected =
        task.kind === "structured"
          ? detectCurrencyForElement(el, trimmed)
          : task.kind === "delivery"
          ? EPC.detectCurrency
            ? EPC.detectCurrency(trimmed)
            : null
          : EPC.detectCurrency
          ? EPC.detectCurrency(trimmed)
          : null;
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

      const parsed = EPC.parsePrice ? EPC.parsePrice(trimmed) : null;
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

      let changed = false;
      if (task.kind === "structured") {
        changed = applyStructured(el, parsed * rate, currentFormatter);
      } else if (task.kind === "delivery") {
        changed = convertDeliveryMessage(el, rate, currentFormatter);
      } else {
        const result = EPC.convertElement(el, rate, currentFormatter);
        changed = Boolean(result?.changed);
      }

      if (changed) {
        currentStats.converted += 1;
      } else {
        currentStats.skipped += 1;
        bumpReason(currentStats, "already_converted");
      }
    }

    updateStats();
  }

  function restoreAll() {
    const structured = document.querySelectorAll(`[${ATTR_AMAZON_ORIGINAL}]`);
    for (const el of structured) {
      restoreStructured(el);
    }
    const delivery = document.querySelectorAll(`[${ATTR_AMAZON_DELIVERY_ORIGINAL}]`);
    for (const el of delivery) {
      restoreDeliveryMessage(el);
    }
    const genericConverted = document.querySelectorAll("[data-epc-converted]");
    for (const el of genericConverted) {
      EPC.restoreElement(el);
    }
  }

  async function start(context) {
    currentContext = context;
    targetCurrency = context.targetCurrency || "EUR";
    sourceOverride = context.sourceCurrencyOverride || null;
    rateCache = {};

    currentFormatter = new Intl.NumberFormat(navigator.language, {
      style: "currency",
      currency: targetCurrency
    });

    currentStats = createStats(context.hostname);
    if (!currentStats.sourceCurrency) {
      const initialCurrency = sourceOverride || inferAmazonCurrency();
      if (initialCurrency) {
        currentStats.sourceCurrency = initialCurrency;
      }
    }
    updateStats();

    if (sourceOverride && sourceOverride === targetCurrency) {
      restoreAll();
      updateStats();
      return;
    }

    await processTargets(document);

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
    currentFormatter = null;
    currentContext = null;
    currentStats = null;
    rateCache = {};
    targetCurrency = null;
    sourceOverride = null;
    restoreAll();
  }

  EPC.siteAdapters.amazon = {
    start,
    stop
  };
})();
