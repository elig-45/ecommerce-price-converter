import { scanAndConvert, scanAndRestore } from "../core/price_converter.js";

const selectors = [
  "span.js-price-box__primary-price__value",
  "span.coupon-block__price"
];

const DEBOUNCE_MS = 200;

let observer = null;
let pendingNodes = new Set();
let debounceTimer = null;
let active = false;
let currentRate = null;
let currentFormatter = null;

function queueNode(node) {
  if (!node) {
    return;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    pendingNodes.add(node);
  } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
    pendingNodes.add(node.parentElement);
  }
}

function flushPending() {
  if (!active || typeof currentRate !== "number" || !currentFormatter) {
    pendingNodes.clear();
    return;
  }
  const nodes = Array.from(pendingNodes);
  pendingNodes.clear();

  for (const node of nodes) {
    scanAndConvert(node, selectors, currentRate, currentFormatter);
  }
}

function scheduleFlush() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    flushPending();
  }, DEBOUNCE_MS);
}

function start({ rate, formatter }) {
  if (typeof rate !== "number" || !Number.isFinite(rate) || !formatter) {
    return;
  }

  currentRate = rate;
  currentFormatter = formatter;
  active = true;

  scanAndConvert(document, selectors, currentRate, currentFormatter);

  if (!observer) {
    observer = new MutationObserver((mutations) => {
      if (!active) {
        return;
      }
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            queueNode(node);
          }
        } else if (mutation.type === "characterData") {
          queueNode(mutation.target?.parentElement);
        }
      }
      if (pendingNodes.size > 0) {
        scheduleFlush();
      }
    });

    const target = document.body || document.documentElement;
    if (target) {
      observer.observe(target, { childList: true, subtree: true, characterData: true });
    }
  }
}

function stop() {
  active = false;
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  pendingNodes.clear();
  scanAndRestore(document, selectors);
}

export default {
  selectors,
  start,
  stop
};
