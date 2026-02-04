import { parsePrice } from "./price_parser.js";

const ATTR_ORIGINAL = "data-epc-original";
const ATTR_CONVERTED = "data-epc-converted";

export function convertElement(el, rate, formatter) {
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

  const parsed = parsePrice(baseText);
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

export function restoreElement(el) {
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

function collectTargets(root, selector) {
  if (!root) {
    return [];
  }
  if (root.nodeType === Node.DOCUMENT_NODE) {
    return Array.from(root.querySelectorAll(selector));
  }
  if (root.nodeType !== Node.ELEMENT_NODE) {
    return [];
  }
  const element = root;
  const matches = [];
  if (element.matches(selector)) {
    matches.push(element);
  }
  matches.push(...element.querySelectorAll(selector));
  return matches;
}

export function scanAndConvert(root, selectors, rate, formatter) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return { count: 0 };
  }
  const selector = selectors.join(",");
  const targets = collectTargets(root, selector);
  let count = 0;

  for (const target of targets) {
    if (convertElement(target, rate, formatter).changed) {
      count += 1;
    }
  }

  return { count };
}

export function scanAndRestore(root, selectors) {
  if (!Array.isArray(selectors) || selectors.length === 0) {
    return { count: 0 };
  }
  const selector = selectors.join(",");
  const targets = collectTargets(root, selector);
  let count = 0;

  for (const target of targets) {
    if (restoreElement(target).restored) {
      count += 1;
    }
  }

  return { count };
}
