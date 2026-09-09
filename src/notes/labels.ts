import { system690 } from '../data/system690'
import type { NoteTarget } from './types'

export function labelForNoteTarget(target: NoteTarget): string {
  if (target.kind === 'circuit') {
    const c = system690.circuits.find((x) => x.id === target.circuitId)
    if (!c) return target.circuitId
    const name = c.protectionName?.trim()
    const ref = c.circuitRef?.trim()
    if (name && ref && name !== ref) return `${name} · ${ref}`
    return name || ref || c.id
  }
  const eq = system690.equipment.find((x) => x.id === target.equipmentId)
  if (!eq) return target.equipmentId
  const name = eq.name?.trim()
  if (name && name !== eq.id) return `${eq.id} · ${name}`
  return eq.id
}

export function kindLabelForNoteTarget(target: NoteTarget): string {
  return target.kind === 'circuit' ? 'Interruptor' : 'Equipo'
}
