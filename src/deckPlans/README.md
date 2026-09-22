# Planos de cubierta (local → imagen)

## Regenerar JPEG + manifest

```bash
npm run deck-plans:compress
```

Lee `planos/*.png` y escribe `public/deck-plans/*.jpg` + `src/data/deckPlans/manifest.json`.

## OCR de códigos de local

```bash
npm run deck-plans:ocr
```

Escribe `src/data/deckPlans/hits.json`. Las correcciones definitivas van en `overrides.json` (tienen prioridad). Los ajustes desde el visor se guardan en `localStorage` y se pueden exportar desde la UI.
