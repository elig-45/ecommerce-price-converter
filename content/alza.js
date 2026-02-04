(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  function log(message, data) {
    const ts = new Date().toISOString();
    if (data !== undefined) {
      console.log(`[epc ${ts}] ${message}`, data);
    } else {
      console.log(`[epc ${ts}] ${message}`);
    }
  }

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
      EPC.scanAndConvert(node, selectors, currentRate, currentFormatter);
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
      log("❌ start() invalid params", { rate, formatter: Boolean(formatter) });
      return;
    }

    currentRate = rate;
    currentFormatter = formatter;
    active = true;

    log("🧩 Alza adapter start", { rate, selectors });
    EPC.scanAndConvert(document, selectors, currentRate, currentFormatter);

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
        log("👀 MutationObserver attached", { target: target.nodeName });
      } else {
        log("⚠️ No document body/root to observe");
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
    EPC.scanAndRestore(document, selectors);
    log("🛑 Alza adapter stopped");
  }

  EPC.siteAdapters.alza = {
    selectors,
    start,
    stop
  };

  log("✅ Alza adapter registered", { selectors });
})();
