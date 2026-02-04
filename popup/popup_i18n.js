(async function () {
  const i18n = window.EPC?.i18n;
  if (!i18n) {
    return;
  }
  await i18n.init();
  i18n.applyTranslations(document);
  document.documentElement.lang = i18n.getLanguage();
})();
