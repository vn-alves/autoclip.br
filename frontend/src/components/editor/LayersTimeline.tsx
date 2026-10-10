import React, { useRef, useState } from 'react'
import { VideoLayer, layerEndTime } from './types'
import { SourceBounds, moveTimelineRange, resizeLayerRange, timelineSnapPoints } from './layerTimelineMath'

interface LayersTimelineProps {
  layers: VideoLayer[]
  /** Escala da faixa (duração do vídeo final + folga para esticar além dela). */
  duration: number
  /** Duração do vídeo final — alvo dos encaixes de início/centro/fim. */
  contentDuration: number
  /** Duração original do corte (fim da principal em configs antigas, endTime=Infinity). */
  clipDuration: number
  currentTime: number
  selectedLayerId: string | null
  onSelect: (id: string) => void
  onTimeRangeChange: (id: string, startTime: number, endTime: number, sourceStart?: number) => void
  /** Limites da fonte de cada layer (ver resizeLayerRange). */
  getSourceBounds: (layer: VideoLayer) => SourceBounds
  /** true = o vídeo principal fica fixo (versão Web). */
  lockMain?: boolean
  onAddFiles: (files: FileList) => void
  allowAdd: boolean
}

const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'

/** Uma faixa editável por layer, sincronizada com os campos numéricos do painel. */
const LayersTimeline: React.FC<LayersTimelineProps> = ({
  layers, duration, contentDuration, clipDuration, currentTime, selectedLayerId, onSelect, onTimeRangeChange,
  getSourceBounds, lockMain = false, onAddFiles, allowAdd,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [snapTime, setSnapTime] = useState<number | null>(null)
  if (duration <= 0) return null
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex)
  const isLocked = (layer: VideoLayer) => lockMain && layer.isMain && !layer.isDuplicate

  const startGesture = (event: React.PointerEvent, layer: VideoLayer, edge?: 'start' | 'end') => {
    if (isLocked(layer)) { onSelect(layer.id); return }
    event.preventDefault()
    event.stopPropagation()
    onSelect(layer.id)
    const track = event.currentTarget.closest('.ac-layers-timeline-track') as HTMLElement | null
    if (!track) return
    const rect = track.getBoundingClientRect()
    const scale = duration
    const startClientX = event.clientX
    const initial = { startTime: layer.startTime, endTime: layerEndTime(layer, clipDuration), sourceStart: layer.sourceStart || 0 }
    const bounds = getSourceBounds(layer)
    const points = timelineSnapPoints(contentDuration, currentTime, layers.filter((item) => item.id !== layer.id).map((item) => ({
      startTime: item.startTime,
      endTime: layerEndTime(item, clipDuration),
    })))
    const threshold = rect.width > 0 ? scale * 8 / rect.width : 0

    const onMove = (pointerEvent: PointerEvent) => {
      const deltaTime = rect.width > 0 ? (pointerEvent.clientX - startClientX) / rect.width * scale : 0
      if (edge) {
        const r = resizeLayerRange(edge, (edge === 'start' ? initial.startTime : initial.endTime) + deltaTime, initial, bounds, points, threshold)
        setSnapTime(r.snapTime)
        onTimeRangeChange(layer.id, r.startTime, r.endTime, r.sourceStart)
      } else {
        const r = moveTimelineRange(initial.startTime, initial.endTime, deltaTime, scale, points, threshold)
        setSnapTime(r.snapTime)
        onTimeRangeChange(layer.id, r.startTime, r.endTime, initial.sourceStart)
      }
    }
    const onEnd = () => {
      setSnapTime(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onEnd)
    window.addEventListener('pointercancel', onEnd)
  }

  return (
    <div className="ac-layers-timeline">
      <div className="ac-layers-timeline-header">
        <span>Camadas</span>
        {allowAdd && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_VIDEO_TYPES}
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files?.length) onAddFiles(event.target.files)
                event.target.value = ''
              }}
            />
            <button type="button" className="ac-layers-timeline-add" onClick={() => fileInputRef.current?.click()}>
              NEW LAYER +
            </button>
          </>
        )}
      </div>
      {ordered.map((layer) => {
        const start = Math.max(0, layer.startTime)
        const end = Math.min(layerEndTime(layer, clipDuration), duration)
        const leftPct = (start / duration) * 100
        const widthPct = Math.max(0.5, ((end - start) / duration) * 100)
        return (
          <div key={layer.id} className="ac-layers-timeline-row">
            <span className="ac-layers-timeline-label" title={layer.name}>{layer.name}</span>
            <div className="ac-layers-timeline-track">
              {snapTime !== null && (
                <span className="ac-layers-timeline-snap" style={{ left: `${(snapTime / duration) * 100}%` }} />
              )}
              <button
                type="button"
                className={`ac-layers-timeline-bar${layer.id === selectedLayerId ? ' ac-layers-timeline-bar--selected' : ''}${!layer.visible ? ' ac-layers-timeline-bar--hidden' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                onPointerDown={(event) => startGesture(event, layer)}
                onClick={() => onSelect(layer.id)}
                title={`${layer.name}: ${start.toFixed(1)}s – ${end.toFixed(1)}s`}
              >
                {!isLocked(layer) && (
                  <>
                    <span
                      className="ac-layers-timeline-handle ac-layers-timeline-handle--start"
                      onPointerDown={(event) => startGesture(event, layer, 'start')}
                      aria-hidden="true"
                    />
                    <span
                      className="ac-layers-timeline-handle ac-layers-timeline-handle--end"
                      onPointerDown={(event) => startGesture(event, layer, 'end')}
                      aria-hidden="true"
                    />
                  </>
                )}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default LayersTimeline
