# ecommerce-price-converter

A global MV3 Chrome extension that converts ecommerce prices into your chosen currency. It includes a generic multi-site engine plus a dedicated Alza.cz adapter for robust compatibility.

## Highlights

- Multi-currency target selection (EUR, USD, GBP, CZK, PLN, HUF, CHF).
- Generic price conversion engine for most ecommerce sites.
- Site-specific adapters when needed (Alza.cz included).
- Dynamic page support via debounced MutationObserver.
- 6-hour rate cache per currency pair + manual refresh.
- Modern popup UI with optimistic toggles, skeletons, and toasts.

## Supported sites

- Generic engine: works on most ecommerce sites.
- Alza.cz: dedicated adapter with robust selectors.

## Supported price formats

- 2 450,-
- 12450
- 1 299
- Regular spaces and NBSP

## Install from GitHub

### Option A: Download ZIP

1. Open the GitHub repository page.
2. Click **Code** -> **Download ZIP**.
3. Unzip it to a folder (make sure `manifest.json` is at the root).

### Option B: Clone the repo

```bash
git clone <your-repo-url>
cd ecommerce-price-converter
```

## Load the extension (unpacked)

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the repo folder (the one containing `manifest.json`).
4. Visit any ecommerce site and open the popup.

## Usage

- **Global**: enable/disable conversion everywhere.
- **This site**: override for the active site.
- **Target currency**: choose your preferred currency.
- **Source currency (this site)**: auto-detect or manually override.
- **Refresh rate**: force a rate update.

## How to report a site

If conversion is missing or incorrect:

1. Open the popup.
2. Click **Report this site** to open a prefilled GitHub issue.
3. If needed, click **Copy debug info** and paste it in the issue.

## Exchange rates

- Source: <https://api.frankfurter.app>
- Cached for 6 hours in `chrome.storage.local` (per currency pair).
- On network failure: fallback to cache if available, otherwise error state.

## Local storage

``` text
enabledGlobal: boolean
siteOverrides: { [hostname]: boolean }
preferredTargetCurrency: string
siteCurrencyOverrides: { [hostname]: string }
rateCache: { ["FROM->TO"]: { rate: number, ts: number } }
lastRunStats: { hostname, found, converted, skipped, reasonCounts }
```

## Permissions

- `storage`: preferences + rate cache.
- `activeTab`: communicate with the active tab from the popup.
- `<all_urls>`: allow global conversion without manifest updates.

## Project layout

``` text
background/service_worker.js
content/bridge.js
content/generic.js
content/observer.js
content/adapters/alza.js
core/currency_service.js
core/detectors.js
core/rules_engine.js
core/storage.js
core/price_parser.js
core/price_converter.js
popup/popup.html
popup/popup.js
popup/popup.css
manifest.json
```

## License
See [LICENSE](LICENSE).
