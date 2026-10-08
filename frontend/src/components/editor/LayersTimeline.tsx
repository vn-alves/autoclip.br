import React, { useRef, useState } from 'react'
import { VideoLayer } from './types'
import { moveTimelineRange, resizeTimelineRange, timelineSnapPoints } from './layerTimelineMath'

interface LayersTimelineProps {
  layers: VideoLayer[]
  duration: number
  currentTime: number
  selectedLayerId: string | null
  onSelect: (id: string) => void
  onTimeRangeChange: (id: string, startTime: number, endTime: number) => void
  onAddFiles: (files: FileList) => void
  allowAdd: boolean
}

const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'

/** Uma faixa editável por layer, sincronizada com os campos numéricos do painel. */
const LayersTimeline: React.FC<LayersTimelineProps> = ({
  layers, duration, currentTime, selectedLayerId, onSelect, onTimeRangeChange, onAddFiles, allowAdd,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [snapTime, setSnapTime] = useState<number | null>(null)
  if (duration <= 0) return null
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex)

  const startGesture = (event: React.PointerEvent, layer: VideoLayer, edge?: 'start' | 'end') => {
    if (layer.isMain) { onSelect(layer.id); return }
    event.preventDefault()
    event.stopPropagation()
    onSelect(layer.id)
    const track = event.currentTarget.closest('.ac-layers-timeline-track') as HTMLElement | null
    if (!track) return
    const rect = track.getBoundingClientRect()
    const startClientX = event.clientX
    const initialStart = layer.startTime
    const initialEnd = Math.min(layer.endTime, duration)
    const points = timelineSnapPoints(duration, currentTime, layers.filter((item) => item.id !== layer.id).map((item) => ({
      startTime: item.startTime,
      endTime: Number.isFinite(item.endTime) ? item.endTime : duration,
    })))
    const threshold = rect.width > 0 ? duration * 8 / rect.width : 0

    const onMove = (pointerEvent: PointerEvent) => {
      const deltaTime = rect.width > 0 ? (pointerEvent.clientX - startClientX) / rect.width * duration : 0
      const result = edge
        ? resizeTimelineRange(edge, edge === 'start' ? initialStart + deltaTime : initialEnd + deltaTime, initialStart, initialEnd, duration, points, threshold)
        : moveTimelineRange(initialStart, initialEnd, deltaTime, duration, points, threshold)
      setSnapTime(result.snapTime)
      onTimeRangeChange(layer.id, result.startTime, result.endTime)
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
        const end = layer.endTime === Number.POSITIVE_INFINITY ? duration : Math.min(layer.endTime, duration)
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
                {!layer.isMain && (
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
