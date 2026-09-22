import React, { useCallback, useRef, useState } from 'react'

interface EditorTimelineProps {
  currentTime: number
  duration: number
  onSeek: (t: number) => void
}

const fmt = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Timeline básica do Editor de Corte — Etapa 1.
 * Representa só o clip principal (0 = início do corte). Camadas na
 * timeline ficam para uma etapa futura.
 */
const EditorTimeline: React.FC<EditorTimelineProps> = ({ currentTime, duration, onSeek }) => {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const timeFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current
    if (!track || duration <= 0) return 0
    const rect = track.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    return ratio * duration
  }, [duration])

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true)
    onSeek(timeFromClientX(e.clientX))
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return
    onSeek(timeFromClientX(e.clientX))
  }
  const handlePointerUp = (e: React.PointerEvent) => {
    setDragging(false)
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  const percent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0

  return (
    <div className="ac-editor-timeline">
      <div className="ac-editor-timeline-times">
        <span>{fmt(currentTime)}</span>
        <span>{fmt(duration)}</span>
      </div>
      <div
        ref={trackRef}
        className="ac-editor-timeline-track"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="ac-editor-timeline-clip" />
        <div className="ac-editor-timeline-progress" style={{ width: `${percent}%` }} />
        <div className="ac-editor-timeline-playhead" style={{ left: `${percent}%` }} />
      </div>
    </div>
  )
}

export default EditorTimeline
