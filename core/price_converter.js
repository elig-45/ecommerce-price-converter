(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  const parsePrice = EPC.parsePrice;

  const ATTR_ORIGINAL = "data-epc-original";
  const ATTR_CONVERTED = "data-epc-converted";

  function convertElement(el, rate, formatter) {
    if (!el || typeof rate !== "number" || !Number.isFinite(rate) || !formatter) {
      return { changed: false };
    }

    const hasConverted = el.getAttribute(ATTR_CONVERTED) === "1";
    let baseText = el.getAttribute(ATTR_ORIGINAL);

    if (hasConverted && baseText == null) {
      return { changed: false };
    }

    if (baseText == null) {
      baseText = el.textContent;
    }

    if (typeof baseText !== "string") {
      return { changed: false };
    }

    const parsed = parsePrice ? parsePrice(baseText) : null;
    if (parsed == null) {
      return { changed: false };
    }

    if (!hasConverted || el.getAttribute(ATTR_ORIGINAL) == null) {
      el.setAttribute(ATTR_ORIGINAL, baseText);
    }

    const converted = formatter.format(parsed * rate);
    if (el.textContent !== converted) {
      el.textContent = converted;
    }
    el.setAttribute(ATTR_CONVERTED, "1");

    return { changed: true };
  }

  function restoreElement(el) {
    if (!el) {
      return { restored: false };
    }
    const original = el.getAttribute(ATTR_ORIGINAL);
    const wasConverted = el.hasAttribute(ATTR_CONVERTED);

    if (original != null) {
      el.textContent = original;
    }

    el.removeAttribute(ATTR_ORIGINAL);
    el.removeAttribute(ATTR_CONVERTED);

    return { restored: original != null || wasConverted };
  }

  function collectTargets(rootNode, selector) {
    if (!rootNode) {
      return [];
    }
    if (rootNode.nodeType === Node.DOCUMENT_NODE) {
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

  function scanAndConvert(rootNode, selectors, rate, formatter) {
    if (!Array.isArray(selectors) || selectors.length === 0) {
      return { count: 0 };
    }
    const selector = selectors.join(",");
    const targets = collectTargets(rootNode, selector);
    let count = 0;

    for (const target of targets) {
      if (convertElement(target, rate, formatter).changed) {
        count += 1;
      }
    }

    return { count };
  }

  function scanAndRestore(rootNode, selectors) {
    if (!Array.isArray(selectors) || selectors.length === 0) {
      return { count: 0 };
    }
    const selector = selectors.join(",");
    const targets = collectTargets(rootNode, selector);
    let count = 0;

    for (const target of targets) {
      if (restoreElement(target).restored) {
        count += 1;
      }
    }

    return { count };
  }

  EPC.convertElement = convertElement;
  EPC.restoreElement = restoreElement;
  EPC.scanAndConvert = scanAndConvert;
  EPC.scanAndRestore = scanAndRestore;
})();
