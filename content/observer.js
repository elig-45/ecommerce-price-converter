(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});

  function createObserver({ onNodes, debounceMs = 200, maxNodes = 1000 } = {}) {
    let observer = null;
    let pendingNodes = new Set();
    let debounceTimer = null;
    let active = false;

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
      if (!active) {
        pendingNodes.clear();
        return;
      }
      let nodes = Array.from(pendingNodes);
      pendingNodes.clear();
      if (maxNodes && nodes.length > maxNodes) {
        nodes = nodes.slice(0, maxNodes);
      }
      if (typeof onNodes === "function" && nodes.length > 0) {
        onNodes(nodes);
      }
    }

    function scheduleFlush() {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        flushPending();
      }, debounceMs);
    }

    function start(rootNode) {
      if (active) {
        return;
      }
      active = true;
      const target = rootNode || document.body || document.documentElement;
      if (!target) {
        return;
      }
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
      }
      observer.observe(target, { childList: true, subtree: true, characterData: true });
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
    }

    return { start, stop };
  }

  EPC.createObserver = createObserver;
})();
