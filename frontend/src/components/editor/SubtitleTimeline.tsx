import React from 'react'
import { SubtitleSegment } from './types'

interface SubtitleTimelineProps {
  segments: SubtitleSegment[]
  duration: number
  selectedSegmentId: string | null
  onSelectSegment: (segment: SubtitleSegment) => void
}

/**
 * Linha de blocos de legenda dentro da Timeline — Etapa 2.
 * Puramente posicional (percentuais sobre `duration`), sem medir nada em
 * pixel: reaproveita a mesma largura da faixa principal da Timeline.
 */
const SubtitleTimeline: React.FC<SubtitleTimelineProps> = ({ segments, duration, selectedSegmentId, onSelectSegment }) => {
  if (!segments.length || duration <= 0) return null
  return (
    <div className="ac-editor-subtitle-timeline">
      {segments.map((seg) => {
        const left = (seg.startTime / duration) * 100
        const width = Math.max(0.6, ((seg.endTime - seg.startTime) / duration) * 100)
        return (
          <button
            key={seg.id}
            type="button"
            className={`ac-editor-subtitle-block${seg.id === selectedSegmentId ? ' ac-editor-subtitle-block--active' : ''}`}
            style={{ left: `${left}%`, width: `${width}%` }}
            title={seg.text}
            onClick={(e) => { e.stopPropagation(); onSelectSegment(seg) }}
          >
            {seg.text}
          </button>
        )
      })}
    </div>
  )
}

export default SubtitleTimeline
