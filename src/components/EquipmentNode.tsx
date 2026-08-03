import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { EquipmentKind } from '../types'
import type { EquipmentNodeData } from '../utils/graphBuilder'

const KIND_LABEL: Record<EquipmentKind, string> = {
  generador: 'Generador',
  conversion: 'Conversión',
  cuadro_principal: 'Cuadro principal',
  cuadro_secundario: 'Cuadro secundario',
  consumidor: 'Consumidor',
}

type EqNode = Node<EquipmentNodeData, 'equipment'>

function EquipmentNodeComponent({ data, selected }: NodeProps<EqNode>) {
  const { equipment, highlight } = data
  const highlightClass = highlight ? ` eq-node--${highlight}` : ''
  return (
    <div
      className={`eq-node eq-node--${equipment.kind}${selected ? ' eq-node--selected' : ''}${highlightClass}`}
    >
      <Handle type="target" position={Position.Top} className="eq-handle" />
      <span className="eq-node__kind">{KIND_LABEL[equipment.kind]}</span>
      <strong className="eq-node__name">{equipment.name}</strong>
      <span className="eq-node__meta">
        {equipment.id}
        {equipment.voltage ? ` · ${equipment.voltage}` : ''}
      </span>
      <Handle type="source" position={Position.Bottom} className="eq-handle" />
    </div>
  )
}

export const EquipmentNode = memo(EquipmentNodeComponent)
