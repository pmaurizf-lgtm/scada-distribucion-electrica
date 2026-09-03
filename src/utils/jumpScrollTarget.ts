/** Estado pendiente tras saltar a la acometida remota / AUX. */
export type JumpScrollPending = {
  circuitId: string
  originId: string
  destinationId: string
}

function isVisible(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect()
  return r.width >= 4 && r.height >= 4
}

function chipFromLeg(leg: Element): HTMLElement {
  return (leg.querySelector('.casc-brk') ?? leg) as HTMLElement
}

function findLocalCircuitInDrop(
  drop: Element,
  circuitId: string,
): HTMLElement | null {
  const leg =
    drop.querySelector(
      `.hbus-drop__leg--local[data-circuit-id="${circuitId}"]`,
    ) ??
    drop.querySelector(
      `.hbus-drop__leg--local [data-circuit-id="${circuitId}"]`,
    )
  if (!leg) return null
  const chip = chipFromLeg(leg)
  return isVisible(chip) ? chip : null
}

function originScopes(plant: HTMLElement, originId: string): Element[] {
  const scopes: Element[] = []
  const seen = new Set<Element>()

  const add = (el: Element | null | undefined) => {
    if (!el || seen.has(el)) return
    seen.add(el)
    scopes.push(el)
  }

  plant.querySelectorAll(`.ssb-board[data-ssb="${originId}"]`).forEach(add)
  plant.querySelectorAll(`.msb4sfs-rack[data-msb="${originId}"]`).forEach(add)

  for (const drop of plant.querySelectorAll(
    `.hbus-drop[data-equip="${originId}"]`,
  )) {
    add(drop)
  }

  return scopes
}

/**
 * Localiza el interruptor LOCAL en el origen de la acometida (p. ej. Q03 en
 * SSB-2410 al saltar desde SSB-2209). Evita quedarse en el chip remoto del
 * destino ni en circuitos internos del cuadro receptor.
 */
export function resolveJumpScrollTarget(
  plant: HTMLElement,
  pending: JumpScrollPending,
): { target: HTMLElement; drop: HTMLElement | null } | null {
  const { circuitId, originId, destinationId } = pending

  for (const scope of originScopes(plant, originId)) {
    if (destinationId) {
      for (const drop of scope.querySelectorAll(
        `.hbus-drop[data-equip="${destinationId}"]`,
      )) {
        const chip = findLocalCircuitInDrop(drop, circuitId)
        if (chip) {
          return { target: chip, drop: drop as HTMLElement }
        }
      }
    }

    for (const leg of scope.querySelectorAll(
      `.hbus-drop__leg--local[data-circuit-id="${circuitId}"]`,
    )) {
      const chip = chipFromLeg(leg)
      if (isVisible(chip)) {
        return {
          target: chip,
          drop: leg.closest('.hbus-drop') as HTMLElement | null,
        }
      }
    }

    for (const chip of scope.querySelectorAll(
      `.hbus-drop__leg--local [data-circuit-id="${circuitId}"]`,
    )) {
      const el = chip as HTMLElement
      if (isVisible(el)) {
        return {
          target: el.closest('.casc-brk') as HTMLElement ?? el,
          drop: el.closest('.hbus-drop') as HTMLElement | null,
        }
      }
    }
  }

  const candidates = Array.from(
    plant.querySelectorAll(`[data-circuit-id="${circuitId}"]`),
  ) as HTMLElement[]

  for (const el of candidates) {
    if (el.closest('.hbus-drop__leg--remote')) continue

    const drop = el.closest('.hbus-drop') as HTMLElement | null
    const dropEquip = drop?.getAttribute('data-equip')
    if (dropEquip === destinationId && !el.closest('.hbus-drop__leg--local')) {
      continue
    }

    const target = (el.closest('.casc-brk') as HTMLElement | null) ?? el
    if (!isVisible(target)) continue

    return { target, drop }
  }

  return null
}
