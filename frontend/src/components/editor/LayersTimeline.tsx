import React from 'react'
import { VideoLayer } from './types'

interface LayersTimelineProps {
  layers: VideoLayer[]
  duration: number
  selectedLayerId: string | null
  onSelect: (id: string) => void
}

/**
 * Uma faixa por layer, mostrando visualmente o intervalo [startTime, endTime] dela dentro da
 * duração total do corte (item 11). Só leitura/seleção — editar o intervalo é feito nos campos
 * numéricos do LayerPanel; aqui o objetivo é dar visibilidade, não duplicar o controle.
 */
const LayersTimeline: React.FC<LayersTimelineProps> = ({ layers, duration, selectedLayerId, onSelect }) => {
  if (layers.length <= 1 || duration <= 0) return null
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex)

  return (
    <div className="ac-layers-timeline">
      {ordered.map((layer) => {
        const start = Math.max(0, layer.startTime)
        const end = layer.endTime === Number.POSITIVE_INFINITY ? duration : Math.min(layer.endTime, duration)
        const leftPct = (start / duration) * 100
        const widthPct = Math.max(0.5, ((end - start) / duration) * 100)
        return (
          <div key={layer.id} className="ac-layers-timeline-row">
            <span className="ac-layers-timeline-label" title={layer.name}>{layer.name}</span>
            <div className="ac-layers-timeline-track">
              <button
                type="button"
                className={`ac-layers-timeline-bar${layer.id === selectedLayerId ? ' ac-layers-timeline-bar--selected' : ''}${!layer.visible ? ' ac-layers-timeline-bar--hidden' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                onClick={() => onSelect(layer.id)}
                title={`${layer.name}: ${start.toFixed(1)}s – ${end.toFixed(1)}s`}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default LayersTimeline
