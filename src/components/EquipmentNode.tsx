import { memo } from 'react'
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react'
import type { EquipmentKind } from '../types'
import type { EquipmentNodeData } from '../utils/graphBuilder'
import { labelSecondaryDenom } from '../utils/equipmentLabels'

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
  const isBus =
    !!equipment.virtual || equipment.id.startsWith('MSB-6PWS')
  const secondary = labelSecondaryDenom(equipment)
  return (
    <div
      className={`eq-node eq-node--${equipment.kind}${isBus ? ' eq-node--bus' : ''}${selected ? ' eq-node--selected' : ''}${highlightClass}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        id="in-normal"
        className="eq-handle eq-handle--normal"
        style={{ left: '35%' }}
      />
      <Handle
        type="target"
        position={Position.Top}
        id="in-alt"
        className="eq-handle eq-handle--alt"
        style={{ left: '65%' }}
      />
      <span className="eq-node__kind">
        {isBus ? 'Barra / cuadro' : KIND_LABEL[equipment.kind]}
      </span>
      <strong className="eq-node__name">{equipment.name}</strong>
      <span className="eq-node__meta">
        {equipment.id}
        {secondary ? (
          <>
            <br />
            <em className="denom-dcp" title={secondary.title}>
              {secondary.value}
            </em>
          </>
        ) : null}
        {equipment.local ? ` · ${equipment.local}` : ''}
        {!equipment.local && equipment.voltage ? ` · ${equipment.voltage}` : ''}
      </span>
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-normal"
        className="eq-handle eq-handle--normal"
        style={{ left: '35%' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="out-alt"
        className="eq-handle eq-handle--alt"
        style={{ left: '65%' }}
      />
    </div>
  )
}

export const EquipmentNode = memo(EquipmentNodeComponent)
