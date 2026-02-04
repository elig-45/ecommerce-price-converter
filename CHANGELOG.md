# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-04

### Added

- MV3 Chrome extension with CZK -> EUR conversion for ecommerce prices.
- Robust price parser handling implicit formats (e.g., "2 450,-") and NBSP.
- Dynamic page support using debounced MutationObserver and anti double-conversion.
- Alza.cz site adapter with isolated selectors for future extensions.
- Exchange rate service with 6-hour cache and manual refresh.
- Modern popup UI with optimistic toggles, skeleton loading, and toasts.
- Debug logging for content scripts and service worker.

## [0.2.0] - 2026-02-04

### Added

- Multi-language UI (EN/FR/DE/ES) with selectable language in options.
- Options page opened on first install.
- Amazon-specific popup message with controls hidden on Amazon domains.

### Changed

- Popup layout compacted and currency selectors displayed side-by-side.
- Exchange rate card reduced in height.
- Debug info retrieval moved to `EPC.getDebugInfo()` in the popup console.
