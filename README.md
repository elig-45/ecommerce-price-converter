# ecommerce-price-converter

A modern MV3 Chrome extension that converts CZK prices into EUR on supported ecommerce sites, including implicit formats like "2 450,-". Built for dynamic pages with an optimistic, fast popup UX.

## Table of Contents
- [Highlights](#highlights)
- [Supported sites (v1)](#supported-sites-v1)
- [Supported price formats](#supported-price-formats)
- [Install from GitHub](#install-from-github)
- [Load the extension (unpacked)](#load-the-extension-unpacked)
- [Updating from GitHub](#updating-from-github)
- [Usage](#usage)
- [Exchange rates](#exchange-rates)
- [Local storage](#local-storage)
- [Permissions](#permissions)
- [Project layout](#project-layout)
- [v1 limitations](#v1-limitations)
- [License](#license)

## Highlights
- Automatic price conversion with double-conversion protection.
- Dynamic pages supported via debounced MutationObserver.
- 6-hour rate cache + manual refresh.
- Modern popup UI: optimistic toggles, skeletons, toasts.

## Supported sites (v1)
- Alza.cz

## Supported price formats
- 2 450,-
- 12450
- 1 299
- Regular spaces and NBSP

## Install from GitHub

### Option A: Download ZIP
1. Go to https://github.com/elig-45/ecommerce-price-converter
2. Click **Code** -> **Download ZIP**.
3. Unzip it to a folder (make sure `manifest.json` is at the root).

### Option B: Clone the repo
```bash
git clone https://github.com/elig-45/ecommerce-price-converter.git
cd ecommerce-price-converter
```

## Load the extension (unpacked)
1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
4. Visit https://www.alza.cz and open the popup to enable conversion.

## Updating from GitHub
- If you downloaded a ZIP: download the latest ZIP from https://github.com/elig-45/ecommerce-price-converter and replace your folder, then click **Reload** on `chrome://extensions`.
- If you cloned: `git pull`, then click **Reload** on `chrome://extensions`.

## Usage
- **Global**: enable/disable conversion everywhere.
- **This site**: override for the active site.
- **Refresh rate**: force a rate update.

## Exchange rates
- Source: https://api.frankfurter.app
- Cached for 6 hours in `chrome.storage.local`.
- On network failure: fallback to cache if available, otherwise error state.

## Local storage
```javascript
enabledGlobal: boolean
siteOverrides: { [hostname]: boolean }
preferredTargetCurrency: "EUR"
rateCache: { rate: number, ts: number }
```

## Permissions
- `storage`: preferences + rate cache.
- `activeTab`: communicate with the active tab from the popup.
- `<all_urls>`: v1 to allow activation without manifest updates.

## Project layout
```plaintext
background/service_worker.js
content/bridge.js
content/alza.js
core/currency_service.js
core/price_parser.js
core/price_converter.js
popup/popup.html
popup/popup.js
popup/popup.css
manifest.json
```

## v1 limitations
- Alza.cz only.
- No multi-currency UI (EUR default).

## License
See [LICENSE](LICENSE).
