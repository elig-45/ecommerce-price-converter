(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});
  EPC.rules = EPC.rules || {};

  function selectAdapter(hostname) {
    if (hostname && hostname.endsWith("alza.cz")) {
      return { adapter: "alza", forcedSourceCurrency: "CZK" };
    }
    return { adapter: "generic", forcedSourceCurrency: null };
  }

  EPC.rules.selectAdapter = selectAdapter;
})();
