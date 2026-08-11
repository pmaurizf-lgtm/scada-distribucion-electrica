/**
 * Elimina circuitos duplicados (mismo origin+dest+protectionName) en abtDownstream.json.
 * Conserva el primero; preferencia si hay notes (ssb-incoming).
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'abtDownstream.json')
const file = JSON.parse(readFileSync(path, 'utf8'))

function key(c) {
  return `${c.originId}>${c.destinationId}>${c.protectionName}`
}

const best = new Map()
const order = []
for (const c of file.circuits) {
  if (c.virtual) {
    order.push(c)
    continue
  }
  const k = key(c)
  const prev = best.get(k)
  if (!prev) {
    best.set(k, c)
    order.push({ __ref: k })
    continue
  }
  // Preferir el que tenga notes (p. ej. ssb-incoming)
  if (!prev.notes && c.notes) best.set(k, c)
}

const circuits = order.map((x) => (x.__ref ? best.get(x.__ref) : x))
const removed = file.circuits.length - circuits.length
file.circuits = circuits
writeFileSync(path, JSON.stringify(file, null, 2) + '\n', 'utf8')
console.log(`Circuitos: ${circuits.length + removed} → ${circuits.length} (eliminados ${removed})`)
