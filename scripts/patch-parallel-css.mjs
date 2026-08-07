import { readFileSync, writeFileSync } from 'fs'

const p = 'src/App.css'
const text = readFileSync(p, 'utf8')
const crlf = text.includes('\r\n')
const nl = crlf ? '\r\n' : '\n'

const start =
  text.indexOf(`/*${nl} * QVS + QS* en paralelo:`) >= 0
    ? text.indexOf(`/*${nl} * QVS + QS* en paralelo:`)
    : text.indexOf(' * QVS + QS* en paralelo:') - (crlf ? 4 : 3)

const end = text.indexOf('.lcs440-rail__qvs-leg .casc-brk {', start)
if (start < 0 || end < 0) {
  console.error('markers', start, end)
  process.exit(1)
}

const neu = `/*
 * QVS + QS* en paralelo:
 * - Columna VS crece a la dcha. (--lcs-vs-parallel-ext) → QVM se aleja
 * - QVS centrado en el tramo core (sync TRF); QS1 en la extensión
 * - CSB alineado en top/altura con el TRF vía syncParallelCsb
 */
.lcs440-board--parallel-feed {
  --lcs-vs-parallel-ext: 6.4rem;
}

.lcs440-rail__feed-bay {
  grid-column: 1;
  grid-row: qvs / bus;
  position: relative;
  width: 100%;
  min-width: 0;
  justify-self: stretch;
  align-self: stretch;
  z-index: 5;
  pointer-events: none;
  overflow: visible;
}

.lcs440-board--parallel-feed .lcs440-rail__feed-bay {
  z-index: 16;
}

.equip-chassis--lcs:has(.lcs440-board--parallel-feed) {
  z-index: 12;
}

/* QVS: centro del tramo core (sin la extensión QS) */
.lcs440-rail__feed-bay .lcs440-rail__qvs-leg {
  grid-column: auto;
  grid-row: auto;
  position: absolute;
  left: calc((100% - var(--lcs-vs-parallel-ext, 0rem)) / 2);
  top: 0;
  bottom: 0;
  transform: translateX(-50%);
  height: auto;
}

/* QS1 centrado en la extensión VS, a la izquierda de QVM */
.lcs440-rail__qs-leg {
  position: absolute;
  left: calc(100% - var(--lcs-vs-parallel-ext, 6.4rem) / 2);
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  width: 3.4rem;
  min-width: 3.4rem;
  transform: translateX(-50%);
  overflow: visible;
  pointer-events: none;
  z-index: 6;
}

.lcs440-rail__qs-leg .casc-brk {
  pointer-events: auto;
  flex: 0 0 auto;
  position: relative;
  z-index: 4;
  isolation: isolate;
  background: var(--bg-elevated);
  min-width: 2.6rem;
}

.lcs440-rail__qs-leg--flow .lcs440-rail__qvs-leg__wire {
  background: var(--line-alt);
}

.lcs440-rail__qs-leg__wire--from {
  flex: 0 0 var(--qs-stub-h, 0.85rem);
  min-height: var(--qs-stub-h, 0.85rem);
  opacity: 1;
  background: var(--line-alt);
}

/* CSB: misma familia visual que un cuadro; top/altura los pone el sync con TRF */
.lcs440-rail__parallel-src {
  position: absolute;
  left: 50%;
  top: -4.5rem;
  bottom: auto;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  width: 7.2rem;
  min-width: 7.2rem;
  padding: 0.3rem 0.35rem;
  border: 1px solid rgba(140, 150, 170, 0.5);
  border-radius: 2px;
  background: linear-gradient(
    180deg,
    rgba(32, 36, 44, 0.95),
    rgba(22, 26, 32, 0.92)
  );
  color: inherit;
  font: inherit;
  box-sizing: border-box;
  pointer-events: auto;
  z-index: 20;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.lcs440-rail__parallel-src .hbus-drop__sym {
  font-size: 0.95rem;
  line-height: 1;
}

.lcs440-rail__parallel-src .hbus-drop__id {
  font-family: var(--mono);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #c5ccd8;
}

.lcs440-rail__parallel-src .hbus-drop__name {
  font-size: 0.52rem;
  font-weight: 400;
  line-height: 1.15;
  text-align: center;
  color: var(--muted);
  max-width: 100%;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.lcs440-rail__parallel-src__tag {
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--line-alt);
  border: 1px solid color-mix(in srgb, var(--line-alt) 55%, transparent);
  border-radius: 2px;
  padding: 0.05rem 0.28rem;
  margin-top: 0.1rem;
}

.lcs440-rail__parallel-src--live,
.lcs440-rail__parallel-src--flow {
  border-color: color-mix(in srgb, var(--line-alt) 70%, var(--border));
}

.lcs440-rail__parallel-src::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 100%;
  width: 2px;
  height: 0.2rem;
  transform: translateX(-50%);
  background: var(--line-alt);
}

/* Pista VS: tramo core (sync TRF) + extensión bajo QS1 */
.lcs440-rail__vs-bus-track {
  grid-column: 1;
  grid-row: bus;
  display: flex;
  align-items: stretch;
  align-self: stretch;
  width: 100%;
  min-width: var(--lcs-vs-col);
  z-index: 1;
}

.lcs440-board--parallel-feed .lcs440-rail__vs-bus-track {
  min-width: calc(var(--lcs-vs-col) + var(--lcs-vs-parallel-ext));
}

.lcs440-rail__vs-bus-track .lcs440-rail__vs-bus {
  grid-column: auto;
  grid-row: auto;
  flex: 1 1 auto;
  min-width: 0;
  width: auto;
}

.lcs440-rail__vs-bus--parallel-ext {
  flex: 0 0 var(--lcs-vs-parallel-ext);
  width: var(--lcs-vs-parallel-ext);
  min-width: var(--lcs-vs-parallel-ext);
  margin-left: -1px;
  border-radius: 0 1px 1px 0;
}

.lcs440-rail__vs-parallel-spacer {
  flex: 0 0 var(--lcs-vs-parallel-ext, 6.4rem);
  width: var(--lcs-vs-parallel-ext, 6.4rem);
  min-width: var(--lcs-vs-parallel-ext, 6.4rem);
  pointer-events: none;
}

`.replace(/\n/g, nl)

writeFileSync(p, text.slice(0, start) + neu + text.slice(end))
console.log('ok', start, end)
