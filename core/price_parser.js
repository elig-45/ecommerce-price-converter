(function () {
  const root = window;
  const EPC = (root.EPC = root.EPC || {});

  function parsePrice(input) {
    if (typeof input !== "string") {
      return null;
    }

    let text = input.replace(/[\u00A0\u202F]/g, " ").trim();
    if (!text) {
      return null;
    }

    text = text.replace(/[^\d.,\s-]/g, "");
    text = text.replace(/[.,]\s*-\s*$/, "");
    text = text.replace(/\s+/g, " ").trim();

    if (!/\d/.test(text)) {
      return null;
    }

    let negative = false;
    if (text.startsWith("-")) {
      negative = true;
      text = text.slice(1).trim();
    }

    text = text.replace(/\s+/g, "");

    const hasComma = text.includes(",");
    const hasDot = text.includes(".");

    let decSep = null;
    if (hasComma && hasDot) {
      decSep = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
    } else if (hasComma || hasDot) {
      const sep = hasComma ? "," : ".";
      const lastIdx = text.lastIndexOf(sep);
      const digitsAfter = text.length - lastIdx - 1;
      if (digitsAfter >= 1 && digitsAfter <= 2) {
        decSep = sep;
      }
    }

    let cleaned = "";
    if (decSep) {
      let decimalUsed = false;
      for (const ch of text) {
        if (ch >= "0" && ch <= "9") {
          cleaned += ch;
        } else if (ch === decSep && !decimalUsed) {
          cleaned += ".";
          decimalUsed = true;
        }
      }
    } else {
      cleaned = text.replace(/\D/g, "");
    }

    if (!cleaned || cleaned === ".") {
      return null;
    }

    const value = Number((negative ? "-" : "") + cleaned);
    if (!Number.isFinite(value)) {
      return null;
    }

    return value;
  }

  EPC.parsePrice = parsePrice;
})();
