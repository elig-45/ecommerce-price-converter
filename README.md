# ecommerce-price-converter

Conversion instantanee des prix CZK -> EUR sur sites e-commerce, y compris les formats implicites (ex: 2 450,-). Concu pour les pages dynamiques et une UX moderne.

## Points forts
- Conversion automatique des prix visibles, sans double-conversion.
- Gestion des pages dynamiques via MutationObserver debounced.
- Cache du taux 6h + rafraichissement manuel.
- Popup moderne: toggles optimistes, skeletons, toasts.

## Formats de prix supportes
- 2 450,-
- 12450
- 1 299
- Espaces classiques, espaces insécables (NBSP)

## Sites supportes (v1)
- Alza.cz

## Installation (unpacked)
1. Ouvrir `chrome://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur "Load unpacked" et selectionner ce dossier.
4. Aller sur https://www.alza.cz puis ouvrir le popup.

## Utilisation
- Global: active/desactive la conversion partout.
- This site: override local pour le site actif.
- Refresh rate: force un refresh du taux.

## Taux de change
- Source: https://api.frankfurter.app
- Cache local 6h dans `chrome.storage.local`.
- Si le reseau echoue: fallback sur le cache si dispo, sinon etat d'erreur.

## Stockage local
```
enabledGlobal: boolean
siteOverrides: { [hostname]: boolean }
preferredTargetCurrency: "EUR"
rateCache: { rate: number, ts: number }
```

## Permissions
- `storage`: memoriser les preferences et le cache de taux.
- `activeTab`: interagir avec l'onglet actif depuis le popup.
- `<all_urls>`: v1, pour permettre l'activation sans modifier le manifest.

## Architecture (fichiers)
```
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

## Limitations v1
- Uniquement Alza.cz.
- Pas d'UI multi-devises (EUR par defaut).

## Licence
Voir `LICENSE`.
