(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.rules = EPC.rules || {};

  function selectAdapter(hostname) {
    if (hostname && hostname.endsWith("alza.cz")) {
      return { adapter: "alza", forcedSourceCurrency: "CZK" };
    }
    if (hostname) {
      const isAmazon = /(^|\\.)amazon\\./i.test(hostname);
      const excluded = /amazonaws\\.com$|amazonpay\\.|amazonstatic\\.com$/i.test(hostname);
      if (isAmazon && !excluded) {
        return { adapter: "amazon", forcedSourceCurrency: null };
      }
    }
    return { adapter: "generic", forcedSourceCurrency: null };
  }

  EPC.rules.selectAdapter = selectAdapter;
})();
