(function () {
  const root = typeof self !== "undefined" ? self : window;
  const EPC = (root.EPC = root.EPC || {});

  const DEFAULT_LANGUAGE = "en";
  const SUPPORTED_LANGUAGES = ["en", "fr", "de", "es"];
  const STORAGE_KEY = "uiLanguage";

  let currentLanguage = DEFAULT_LANGUAGE;
  let messages = {};
  let initPromise = null;

  function normalizeLanguage(lang) {
    if (SUPPORTED_LANGUAGES.includes(lang)) {
      return lang;
    }
    return DEFAULT_LANGUAGE;
  }

  async function fetchMessages(lang) {
    try {
      const url = chrome?.runtime?.getURL
        ? chrome.runtime.getURL(`_locales/${lang}/messages.json`)
        : `../_locales/${lang}/messages.json`;
      const response = await fetch(url);
      if (!response.ok) {
        return null;
      }
      return await response.json();
    } catch (err) {
      return null;
    }
  }

  async function loadLanguage(lang) {
    const normalized = normalizeLanguage(lang);
    let data = await fetchMessages(normalized);
    let selected = normalized;
    if (!data && normalized !== DEFAULT_LANGUAGE) {
      data = await fetchMessages(DEFAULT_LANGUAGE);
      selected = DEFAULT_LANGUAGE;
    }
    messages = data || {};
    currentLanguage = selected;
    return currentLanguage;
  }

  function formatMessage(template, vars) {
    if (!vars || typeof template !== "string") {
      return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(vars, key)) {
        const value = vars[key];
        return value == null ? "" : String(value);
      }
      return match;
    });
  }

  async function init() {
    if (initPromise) {
      return initPromise;
    }
    initPromise = (async () => {
      let storedLanguage = null;
      try {
        if (chrome?.storage?.local) {
          const stored = await chrome.storage.local.get({ [STORAGE_KEY]: null });
          storedLanguage = stored[STORAGE_KEY];
        }
      } catch (err) {
        storedLanguage = null;
      }
      await loadLanguage(storedLanguage || DEFAULT_LANGUAGE);
      return currentLanguage;
    })();
    return initPromise;
  }

  async function setLanguage(lang) {
    const normalized = normalizeLanguage(lang);
    await loadLanguage(normalized);
    if (chrome?.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: currentLanguage });
    }
    return currentLanguage;
  }

  function t(key, vars, fallback) {
    const entry = messages?.[key];
    const raw =
      (entry && typeof entry.message === "string" ? entry.message : "") ||
      fallback ||
      key;
    return formatMessage(raw, vars);
  }

  function applyTranslations(rootNode) {
    const rootEl = rootNode || document;
    if (!rootEl || !rootEl.querySelectorAll) {
      return;
    }

    rootEl.querySelectorAll("[data-i18n]").forEach((node) => {
      const key = node.getAttribute("data-i18n");
      if (!key) {
        return;
      }
      node.textContent = t(key);
    });

    const attrBindings = [
      ["data-i18n-title", "title"],
      ["data-i18n-aria-label", "aria-label"],
      ["data-i18n-placeholder", "placeholder"],
      ["data-i18n-alt", "alt"]
    ];

    for (const [dataAttr, targetAttr] of attrBindings) {
      rootEl.querySelectorAll(`[${dataAttr}]`).forEach((node) => {
        const key = node.getAttribute(dataAttr);
        if (!key) {
          return;
        }
        node.setAttribute(targetAttr, t(key));
      });
    }
  }

  EPC.i18n = {
    init,
    setLanguage,
    t,
    applyTranslations,
    getLanguage() {
      return currentLanguage;
    },
    getSupportedLanguages() {
      return [...SUPPORTED_LANGUAGES];
    }
  };
})();
