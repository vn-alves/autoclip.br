import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Moveable, { type OnDrag, type OnResize } from 'react-moveable'
import { BackgroundConfig, CANVAS_DIMENSIONS, CanvasFormat, NormalizedTransform } from './types'

interface EditorCanvasProps {
  videoUrl: string
  format: CanvasFormat
  background: BackgroundConfig
  transform: NormalizedTransform
  onTransformChange: (t: NormalizedTransform) => void
  onLoadedMetadata: (videoWidth: number, videoHeight: number) => void
  videoRef: React.RefObject<HTMLVideoElement>
  onTimeUpdate: () => void
  onDurationChange: (d: number) => void
  onEnded: () => void
  onPlayStateChange: (playing: boolean) => void
}

/**
 * Canvas do Editor de Corte — Etapa 1.
 *
 * Mantém o vídeo como elemento <video> real (não canvas de pixels). A
 * posição/tamanho do vídeo são guardados normalizados (0..1) em
 * `transform`; este componente só converte isso para pixels do frame atual
 * (que muda com o tamanho da janela) e vice-versa quando o usuário
 * arrasta/redimensiona via react-moveable.
 */
const EditorCanvas: React.FC<EditorCanvasProps> = ({
  videoUrl, format, background, transform, onTransformChange,
  onLoadedMetadata, videoRef, onTimeUpdate, onDurationChange, onEnded, onPlayStateChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [selected, setSelected] = useState(false)
  // Precisa de um valor de estado (não só a ref) para o Moveable saber que o <video> já existe no DOM.
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null)

  const dims = CANVAS_DIMENSIONS[format]
  const canvasAspect = dims.width / dims.height

  // Tamanho do frame = o maior retângulo com a proporção do formato que cabe no container disponível.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return
    const compute = () => {
      const { width: cw, height: ch } = container.getBoundingClientRect()
      if (cw <= 0 || ch <= 0) return
      const containerAspect = cw / ch
      const size = containerAspect > canvasAspect
        ? { width: ch * canvasAspect, height: ch }
        : { width: cw, height: cw / canvasAspect }
      setFrameSize(size)
    }
    compute()
    const observer = new ResizeObserver(compute)
    observer.observe(container)
    return () => observer.disconnect()
  }, [canvasAspect])

  // Reflete o transform normalizado em pixels do frame atual sempre que ele muda
  // (troca de formato, redimensionamento da janela, ou commit de um drag/resize).
  useEffect(() => {
    const el = videoRef.current
    if (!el || frameSize.width === 0) return
    el.style.left = `${transform.x * frameSize.width}px`
    el.style.top = `${transform.y * frameSize.height}px`
    el.style.width = `${transform.width * frameSize.width}px`
    el.style.height = `${transform.height * frameSize.height}px`
    el.style.transform = transform.rotation ? `rotate(${transform.rotation}deg)` : ''
  }, [transform, frameSize, videoRef])

  // Fundo desfocado: um segundo <video>, mudo, espelhando play/pause/tempo do vídeo principal.
  // Só existe enquanto background.type === 'blur' — sem custo quando o fundo é cor sólida.
  useEffect(() => {
    if (background.type !== 'blur') return
    const main = videoRef.current
    const bg = bgVideoRef.current
    if (!main || !bg) return
    const syncTime = () => {
      if (Math.abs(bg.currentTime - main.currentTime) > 0.3) bg.currentTime = main.currentTime
    }
    const onPlay = () => { bg.play().catch(() => {}); syncTime() }
    const onPause = () => bg.pause()
    main.addEventListener('play', onPlay)
    main.addEventListener('pause', onPause)
    main.addEventListener('seeked', syncTime)
    main.addEventListener('timeupdate', syncTime)
    syncTime()
    if (!main.paused) onPlay()
    return () => {
      main.removeEventListener('play', onPlay)
      main.removeEventListener('pause', onPause)
      main.removeEventListener('seeked', syncTime)
      main.removeEventListener('timeupdate', syncTime)
    }
  }, [background.type, videoRef])

  const commitFromTarget = (target: HTMLElement | SVGElement) => {
    if (frameSize.width === 0 || frameSize.height === 0) return
    const el = target as HTMLElement
    const left = parseFloat(el.style.left || '0')
    const top = parseFloat(el.style.top || '0')
    const width = parseFloat(el.style.width || '0')
    const height = parseFloat(el.style.height || '0')
    onTransformChange({
      x: left / frameSize.width,
      y: top / frameSize.height,
      width: width / frameSize.width,
      height: height / frameSize.height,
      rotation: transform.rotation,
    })
  }

  const handleDrag = ({ target, left, top }: OnDrag) => {
    target.style.left = `${left}px`
    target.style.top = `${top}px`
  }

  const handleResize = ({ target, width, height, drag }: OnResize) => {
    target.style.width = `${width}px`
    target.style.height = `${height}px`
    target.style.left = `${drag.left}px`
    target.style.top = `${drag.top}px`
  }

  return (
    <div ref={containerRef} className="ac-editor-canvas-container">
      <div
        ref={frameRef}
        className="ac-editor-frame"
        style={{ width: frameSize.width, height: frameSize.height }}
        onMouseDown={(e) => { if (e.target === frameRef.current) setSelected(false) }}
      >
        {/* Fundo */}
        {background.type === 'color' ? (
          <div className="ac-editor-bg" style={{ background: background.color }} />
        ) : (
          <div className="ac-editor-bg ac-editor-bg--blur">
            <video
              ref={bgVideoRef}
              src={videoUrl}
              muted
              playsInline
              style={{ filter: `blur(${background.blurAmount}px)`, transform: 'scale(1.18)' }}
            />
          </div>
        )}

        {/* Vídeo principal */}
        <video
          ref={(el) => {
            (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
            setVideoEl(el)
          }}
          src={videoUrl}
          className="ac-editor-video"
          playsInline
          onClick={(e) => { e.stopPropagation(); setSelected(true) }}
          onLoadedMetadata={(e) => onLoadedMetadata(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onTimeUpdate={onTimeUpdate}
          onDurationChange={(e) => onDurationChange(e.currentTarget.duration || 0)}
          onEnded={onEnded}
          onPlay={() => onPlayStateChange(true)}
          onPause={() => onPlayStateChange(false)}
        />

        {videoEl && selected && frameSize.width > 0 && (
          <Moveable
            target={videoEl}
            container={frameRef.current}
            origin={false}
            draggable
            resizable
            keepRatio
            throttleDrag={0}
            throttleResize={0}
            snappable
            snapCenter
            snapThreshold={6}
            renderDirections={['nw', 'ne', 'sw', 'se']}
            verticalGuidelines={[0, frameSize.width / 2, frameSize.width]}
            horizontalGuidelines={[0, frameSize.height / 2, frameSize.height]}
            onDrag={handleDrag}
            onDragEnd={({ target }) => commitFromTarget(target)}
            onResize={handleResize}
            onResizeEnd={({ target }) => commitFromTarget(target)}
          />
        )}
      </div>
    </div>
  )
}

export default EditorCanvas
