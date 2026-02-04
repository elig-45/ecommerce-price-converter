(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.siteAdapters = EPC.siteAdapters || {};

  function start() {
    // Intentionally do nothing. Site conversions are disabled.
  }

  function stop() {
    // Nothing to clean up.
  }

  EPC.siteAdapters.disabled = {
    start,
    stop
  };
})();
