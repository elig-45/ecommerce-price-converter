# Changelog

## [0.2.0] - 2026-02-04

### Added

- Multi-language UI (EN/FR/DE/ES) with selectable language in options and localized manifest metadata.
- Options page (HTML/CSS/JS) opened on first install for language selection.
- Amazon-specific popup message with controls hidden on Amazon domains.
- Adapter-based content architecture with rules engine (generic, Alza, disabled adapters).
- Currency detection helpers and expanded storage defaults (including UI language).
- New assets for the popup (Amazon language menu image and updated screenshot).

### Changed

- Popup layout compacted: source/target selectors side-by-side, reduced spacing, smaller rate card.
- Exchange rate card no longer shows source-unknown text (handled in currency section).
- Debug info retrieval moved to `EPC.getDebugInfo()` in the popup console.
- Manifest updated with `default_locale` and localized action title/name/description.
- README refreshed to reflect new UI and language support.

### Removed

- Legacy `content/alza.js` adapter in favor of adapter-based structure.

## [0.1.0] - 2026-02-04

### Added

- MV3 Chrome extension with CZK -> EUR conversion for ecommerce prices.
- Robust price parser handling implicit formats (e.g., "2 450,-") and NBSP.
- Dynamic page support using debounced MutationObserver and anti double-conversion.
- Alza.cz site adapter with isolated selectors for future extensions.
- Exchange rate service with 6-hour cache and manual refresh.
- Modern popup UI with optimistic toggles, skeleton loading, and toasts.
- Debug logging for content scripts and service worker.
