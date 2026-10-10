import React, { useRef, useState } from 'react'
import { VideoLayer, layerEndTime } from './types'
import { SourceBounds, moveTimelineRange, resizeLayerRange, timelineSnapPoints } from './layerTimelineMath'
import { Btn, Icon } from '../../ui'
import { canSplitVideoLayer } from './splitVideoLayer'
import VideoFilmstrip from './VideoFilmstrip'

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
  onSeek: (time: number) => void
  onSplit: (id: string) => void
  onDuplicate: (id: string) => void
  onRemove: (id: string) => void
  mainSourceOffset: number
}

const ACCEPTED_VIDEO_TYPES = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'

/** Uma faixa editável por layer, sincronizada com os campos numéricos do painel. */
const LayersTimeline: React.FC<LayersTimelineProps> = ({
  layers, duration, contentDuration, clipDuration, currentTime, selectedLayerId, onSelect, onTimeRangeChange,
  getSourceBounds, lockMain = false, onAddFiles, allowAdd,
  onSeek, onSplit, onDuplicate, onRemove, mainSourceOffset,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [snapTime, setSnapTime] = useState<number | null>(null)
  if (duration <= 0) return null
  const ordered = [...layers].sort((a, b) => b.zIndex - a.zIndex)
  const isLocked = (layer: VideoLayer) => lockMain && layer.isMain && !layer.isDuplicate
  const selected = layers.find((layer) => layer.id === selectedLayerId)
  const tracks = new Map<string, VideoLayer[]>()
  for (const layer of ordered) {
    const key = layer.trackId ?? layer.id
    tracks.set(key, [...(tracks.get(key) ?? []), layer])
  }
  const seekTrack = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const seek = (x: number) => onSeek(Math.max(0, Math.min(contentDuration, (x - rect.left) / rect.width * duration)))
    seek(event.clientX)
    event.currentTarget.setPointerCapture(event.pointerId)
    const target = event.currentTarget
    const move = (e: PointerEvent) => seek(e.clientX)
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }

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
        <div className="ac-layers-timeline-actions">
          <Btn variant="text" size="sm" aria-label="Dividir trecho" title="Dividir trecho no marcador" disabled={!selected || isLocked(selected) || !canSplitVideoLayer(selected, currentTime, clipDuration)} onClick={() => { if (selected) onSplit(selected.id) }}><Icon.Cut size={15} /></Btn>
          <Btn variant="text" size="sm" aria-label="Duplicar trecho" title="Duplicar trecho" disabled={!selected || !allowAdd} onClick={() => { if (selected) onDuplicate(selected.id) }}><Icon.Copy size={15} /></Btn>
          <Btn variant="text" size="sm" aria-label="Remover trecho" title="Remover trecho" disabled={!selected || (selected.isMain && !selected.isDuplicate && !layers.some((layer) => layer.id !== selected.id && layer.isMain))} onClick={() => { if (selected) onRemove(selected.id) }}><Icon.Trash size={15} /></Btn>
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
            <Btn variant="text" size="sm" className="ac-layers-timeline-add" onClick={() => fileInputRef.current?.click()}>
              NEW LAYER +
            </Btn>
          </>
        )}
        </div>
      </div>
      <div className="ac-layers-timeline-row">
        <span className="ac-layers-timeline-label">Tempo</span>
        <div className="ac-layers-timeline-ruler" onPointerDown={seekTrack}>
          {[0, 1, 2, 3, 4].map((tick) => <span key={tick} style={{ left: `${tick * 25}%` }}>{(duration * tick / 4).toFixed(1)}s</span>)}
        </div>
      </div>
      {[...tracks.entries()].map(([trackId, segments]) => (
        <div key={trackId} className="ac-layers-timeline-row">
          <span className="ac-layers-timeline-label" title={segments[0]?.name}>{segments[0]?.name}</span>
          <div className="ac-layers-timeline-track" onPointerDown={seekTrack}>
            <span className="ac-layers-timeline-playhead" style={{ left: `${currentTime / duration * 100}%` }} />
            {snapTime !== null && <span className="ac-layers-timeline-snap" style={{ left: `${snapTime / duration * 100}%` }} />}
            {segments.map((layer) => {
        const start = Math.max(0, layer.startTime)
        const end = Math.min(layerEndTime(layer, clipDuration), duration)
        const leftPct = (start / duration) * 100
        const widthPct = Math.max(0.5, ((end - start) / duration) * 100)
        return (
              <Btn
                key={layer.id}
                variant="text"
                aria-label={`Selecionar trecho ${layer.name}`}
                aria-pressed={layer.id === selectedLayerId}
                className={`ac-layers-timeline-bar${layer.id === selectedLayerId ? ' ac-layers-timeline-bar--selected' : ''}${!layer.visible ? ' ac-layers-timeline-bar--hidden' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                onPointerDown={(event) => startGesture(event, layer)}
                onClick={() => onSelect(layer.id)}
                title={`${layer.name}: ${start.toFixed(1)}s – ${end.toFixed(1)}s`}
              >
                <VideoFilmstrip source={layer.source} sourceStart={(layer.isMain ? mainSourceOffset : 0) + (layer.sourceStart || 0)} duration={end - start} />
                <span className="ac-layers-timeline-segment-name">{layer.name}</span>
                <span className="ac-layers-timeline-segment-time">{(end - start).toFixed(1)}s {layer.muted ? '· Mudo' : ''}</span>
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
              </Btn>
        )
      })}
          </div>
        </div>
      ))}
    </div>
  )
}

export default LayersTimeline
