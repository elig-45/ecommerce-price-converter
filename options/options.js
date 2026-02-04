(async function () {
  const i18n = window.EPC?.i18n;
  const languageSelect = document.getElementById("languageSelect");
  const saveBtn = document.getElementById("saveBtn");
  const status = document.getElementById("status");
  const firstRun = document.getElementById("firstRun");

  function setStatus(message, variant) {
    if (!status) {
      return;
    }
    status.textContent = message || "";
    status.dataset.variant = variant || "";
  }

  function shouldShowFirstRun() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") === "install") {
      return true;
    }
    return false;
  }

  async function ensureLanguageReady() {
    if (i18n?.init) {
      await i18n.init();
      if (i18n.applyTranslations) {
        i18n.applyTranslations(document);
      }
      document.documentElement.lang = i18n.getLanguage();
    }
  }

  async function init() {
    await ensureLanguageReady();
    if (languageSelect && i18n?.getLanguage) {
      languageSelect.value = i18n.getLanguage();
    }

    if (firstRun) {
      firstRun.hidden = !shouldShowFirstRun();
    }
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const selected = languageSelect?.value || "en";
      try {
        if (i18n?.setLanguage) {
          await i18n.setLanguage(selected);
        } else if (chrome?.storage?.local) {
          await chrome.storage.local.set({ uiLanguage: selected });
        }
        await ensureLanguageReady();
        if (firstRun) {
          firstRun.hidden = true;
        }
        setStatus(i18n?.t("options_status_saved", null, "Saved."), "success");
      } catch (err) {
        setStatus(i18n?.t("options_status_error", null, "Save failed. Try again."), "error");
      }
    });
  }

  init();
})();
