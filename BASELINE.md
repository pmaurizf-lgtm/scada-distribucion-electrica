# Baseline congelado — MSB 690 V

**Tag:** `v0.1-msb-690`  
**Commit:** `a95601c` — unifilar MSB listo (SB|SA, bus-tie 1SB–2SA, RESPETO, PUMA/DCP-10, árbol de búsqueda).

## Restaurar si algo se rompe

```bash
git switch -c repair-from-baseline v0.1-msb-690
# o, solo consultar:
git show v0.1-msb-690
```

## Extender sin tocar el MSB

| Qué | Dónde |
|-----|--------|
| Cadenas ABT→TRF→LCS | `src/abtDownstream/` |
| Datos 440/230 | `src/data/abtDownstream.json` |
| Reglas Cursor | `.cursor/rules/msb-690-frozen.mdc`, `abt-downstream.mdc` |

Cadena objetivo (plano): **ABT → TRF (690/440-230) → LCS dual 440 V / 230 V**.

En `system690.json` ya existen los enlaces ABT→TRF; los LCS se añaden en el seed / Excel 440-230, no reescribiendo la planta MSB.
