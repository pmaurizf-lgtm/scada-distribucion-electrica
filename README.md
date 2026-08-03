# SCADA · Distribución eléctrica de buque (boceto)

Vista gráfica interactiva tipo SCADA de la distribución eléctrica de un barco: generadores → conversión → cuadros principales/secundarios → consumidores, con **líneas normales** y **alternativas**.

Stack: **Vite + React + TypeScript + React Flow**. Solo frontend web (sin Java, sin Python, sin backend).

## Arranque local

```bash
npm install
npm run dev
```

Abre la URL que muestre Vite (normalmente `http://localhost:5173`).

## Qué incluye el boceto

- Diagrama jerárquico con layout automático (Dagre)
- Nodos por tipo de equipo (generador, conversión, cuadro, consumidor)
- **Búsqueda de equipo**: al buscar por nombre o ID, centra el nodo en el SCADA y resalta todas las alimentaciones **aguas arriba**
- **Estado de protecciones** (simulado):
  - **Cerrada** → rojo (circuito energizado / interruptor cerrado)
  - **Abierta** → verde (circuito abierto / interruptor abierto)
- Botones **Simular estado**, **Cargar archivo** (JSON) y **Quitar estados**
- Aristas: trazo continuo/discontinuo según línea normal o alternativa; color según estado de protección cuando hay estado cargado
- Clic en nodo o arista → panel de detalle
- Datos de ejemplo en `src/data/sampleDistribution.ts`
- Estado simulado en `src/data/sampleProtectionStatus.ts` (también `public/ejemplo-estado-protecciones.json`)

## Probar la búsqueda

1. Escribe p. ej. `Bomba de agua de mar` o `PUMP-SW`
2. Pulsa **Buscar**
3. El equipo parpadea en amarillo; los equipos y circuitos aguas arriba quedan resaltados; el resto se atenúa
4. El panel lista cada alimentación aguas arriba con su protección y estado

## Estado de protecciones (archivo futuro)

Formato JSON esperado:

```json
[
  { "circuitId": "C-001", "protectionName": "ACB GEN-1", "state": "cerrada" },
  { "circuitId": "C-013", "state": "abierta" }
]
```

Puedes cargar `public/ejemplo-estado-protecciones.json` con el botón **Cargar archivo**.

## Mapeo con tu Excel

Cuando facilites el Excel, las columnas se mapearán a este esquema (`src/types.ts`):

| Columna Excel (ejemplo) | Campo en la app |
| --- | --- |
| Origen | `circuit.originId` / equipo |
| Destino | `circuit.destinationId` / equipo |
| Nombre del circuito | `circuit.name` |
| Protección | `circuit.protectionName` |
| Intensidad de protección (A) | `circuit.protectionCurrentA` |
| Tipo de línea (normal / alt.) | `circuit.lineType` |
| Estado protección (futuro) | `cerrada` / `abierta` |

## Publicar en GitHub Pages

1. Crea el repositorio en GitHub y súbelo.
2. En el repo: **Settings → Pages → Source: GitHub Actions**.
3. El workflow `.github/workflows/pages.yml` publica al hacer push a `main`.

`vite.config.ts` usa `base: './'` para project sites de GitHub Pages.

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción en `dist/` |
| `npm run preview` | Previsualiza el build local |
| `npm run lint` | Lint (oxlint) |
