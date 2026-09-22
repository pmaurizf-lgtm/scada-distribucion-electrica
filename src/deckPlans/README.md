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

Escribe `src/data/deckPlans/hits.json`.

## Correcciones manuales (automáticas)

Al **Ajustar marca** en el visor, la posición se guarda en `localStorage` y se sincroniza a Firestore (`shared/deckPlanOverrides`) si hay sesión. No hace falta exportar.

Opcional: botón «Copia JSON…» para backup en `overrides.json`.

Tras cambiar reglas: `npm run notes:rules`.
