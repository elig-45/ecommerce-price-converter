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
