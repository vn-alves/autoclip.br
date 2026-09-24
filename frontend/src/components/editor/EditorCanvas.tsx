import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Moveable, { type OnDrag, type OnResize } from 'react-moveable'
import { BackgroundConfig, CANVAS_DIMENSIONS, CanvasFormat, NormalizedTransform, SubtitlePosition, SubtitleSegment, SubtitleStyle, VideoLayer, findActiveLayers } from './types'
import SubtitleLayer from './SubtitleLayer'

interface EditorCanvasProps {
  format: CanvasFormat
  background: BackgroundConfig
  /** layers[0] é sempre a principal (ver types.ts createMainVideoLayer). */
  layers: VideoLayer[]
  selectedLayerId: string | null
  onSelectLayer: (id: string | null) => void
  onLayerTransformChange: (id: string, t: NormalizedTransform) => void
  /** Metadados de vídeo (largura/altura reais) — usado pra enquadrar cada layer no primeiro load. */
  onLayerLoadedMetadata: (id: string, videoWidth: number, videoHeight: number) => void
  /** A layer principal também dirige o relógio global do Editor (currentTime/duration/play) —
   * ver ClipEditorPage: um único player "de verdade", os demais só seguem o tempo dele. */
  mainVideoRef: React.RefObject<HTMLVideoElement>
  onMainTimeUpdate: () => void
  onMainDurationChange: (d: number) => void
  onMainEnded: () => void
  onMainPlayStateChange: (playing: boolean) => void
  currentTime: number
  isPlaying: boolean
  /** Etapa 2 — legenda. */
  subtitleSegments: SubtitleSegment[]
  subtitleStyle: SubtitleStyle
  subtitlePosition: SubtitlePosition
  onSubtitlePositionChange: (p: Partial<SubtitlePosition>) => void
}

/**
 * Canvas do Editor de Corte.
 *
 * Cada layer de vídeo é um elemento <video> real (não canvas de pixels), posicionado via
 * `transform` normalizado (0..1), como desde a Etapa 1. Layers secundárias permanecem sempre
 * montadas no DOM (nunca desmontadas ao ocultar/sair da janela de tempo) pra não perder o
 * estado de reprodução — só ficam com display:none + pausadas quando inativas (item 9/24).
 * Só a layer selecionada tem Moveable ativo.
 */
const EditorCanvas: React.FC<EditorCanvasProps> = ({
  format, background, layers, selectedLayerId, onSelectLayer, onLayerTransformChange, onLayerLoadedMetadata,
  mainVideoRef, onMainTimeUpdate, onMainDurationChange, onMainEnded, onMainPlayStateChange,
  currentTime, isPlaying,
  subtitleSegments, subtitleStyle, subtitlePosition, onSubtitlePositionChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const bgVideoRef = useRef<HTMLVideoElement>(null)
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 })
  const [subtitleSelected, setSubtitleSelected] = useState(false)
  // Registro dos elementos <video> de cada layer — precisa ser estado (não só ref) pra o
  // Moveable perceber quando o elemento da layer selecionada já existe no DOM.
  const [videoEls, setVideoEls] = useState<Record<string, HTMLVideoElement | null>>({})
  // Um callback de ref ESTÁVEL por layer (memoizado aqui, não recriado a cada render) — um
  // `ref={(el) => ...}` inline faz o React desanexar+reanexar a ref (null, depois o elemento
  // de novo) a cada commit, porque a identidade da função muda a cada render; cada uma dessas
  // chamadas disparava setVideoEls, gerando outro render, recriando a função de novo — um loop
  // infinito ("Maximum update depth exceeded"). Com a mesma função reutilizada por layer.id,
  // o React só desanexa/reanexa quando o elemento de verdade muda (montar/desmontar).
  const refCallbacksRef = useRef<Map<string, (el: HTMLVideoElement | null) => void>>(new Map())
  const getVideoRefCallback = (layerId: string, isMain: boolean) => {
    let cb = refCallbacksRef.current.get(layerId)
    if (!cb) {
      cb = (el: HTMLVideoElement | null) => {
        if (isMain) (mainVideoRef as React.MutableRefObject<HTMLVideoElement | null>).current = el
        setVideoEls((prev) => (prev[layerId] === el ? prev : { ...prev, [layerId]: el }))
      }
      refCallbacksRef.current.set(layerId, cb)
    }
    return cb
  }

  const dims = CANVAS_DIMENSIONS[format]
  const canvasAspect = dims.width / dims.height
  const mainLayer = layers.find((l) => l.isMain) ?? layers[0]
  const activeIds = new Set(findActiveLayers(layers, currentTime).map((l) => l.id))
  const selectedLayer = layers.find((l) => l.id === selectedLayerId) ?? null
  const selectedVideoEl = selectedLayerId ? videoEls[selectedLayerId] : null

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

  // Reflete o transform normalizado de CADA layer em pixels do frame atual — troca de formato,
  // resize da janela, ou commit de um drag/resize (qualquer uma delas, não só a selecionada).
  useEffect(() => {
    if (frameSize.width === 0) return
    for (const layer of layers) {
      const el = videoEls[layer.id]
      if (!el) continue
      el.style.left = `${layer.transform.x * frameSize.width}px`
      el.style.top = `${layer.transform.y * frameSize.height}px`
      el.style.width = `${layer.transform.width * frameSize.width}px`
      el.style.height = `${layer.transform.height * frameSize.height}px`
      el.style.transform = layer.transform.rotation ? `rotate(${layer.transform.rotation}deg)` : ''
    }
  }, [layers, frameSize, videoEls])

  // Fundo desfocado: um segundo <video>, mudo, espelhando play/pause/tempo do vídeo PRINCIPAL
  // (não das layers secundárias — o fundo sempre reflete o corte original).
  useEffect(() => {
    if (background.type !== 'blur') return
    const main = mainVideoRef.current
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
  }, [background.type, mainVideoRef])

  // Sincroniza as layers SECUNDÁRIAS com o relógio global do Editor (item 13/14/15): usa o
  // mesmo currentTime/isPlaying que já dirige a layer principal — nenhum timer novo por vídeo.
  // tempo relativo do arquivo = currentTime - layer.startTime (item 14).
  useEffect(() => {
    for (const layer of layers) {
      if (layer.isMain) continue
      const el = videoEls[layer.id]
      if (!el) continue
      const active = layer.visible && currentTime >= layer.startTime && currentTime <= layer.endTime
      if (!active) {
        if (!el.paused) el.pause()
        continue
      }
      const relativeTime = currentTime - layer.startTime
      if (Math.abs(el.currentTime - relativeTime) > 0.3) el.currentTime = relativeTime
      if (isPlaying && el.paused) el.play().catch(() => {})
      if (!isPlaying && !el.paused) el.pause()
    }
  }, [layers, videoEls, currentTime, isPlaying])

  const commitFromTarget = (layerId: string, target: HTMLElement | SVGElement) => {
    if (frameSize.width === 0 || frameSize.height === 0) return
    const layer = layers.find((l) => l.id === layerId)
    if (!layer) return
    const el = target as HTMLElement
    const left = parseFloat(el.style.left || '0')
    const top = parseFloat(el.style.top || '0')
    const width = parseFloat(el.style.width || '0')
    const height = parseFloat(el.style.height || '0')
    onLayerTransformChange(layerId, {
      x: left / frameSize.width,
      y: top / frameSize.height,
      width: width / frameSize.width,
      height: height / frameSize.height,
      rotation: layer.transform.rotation,
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

  // Layers renderizadas em ordem de zIndex crescente (a última no DOM fica visualmente acima
  // por padrão), mas o empilhamento real é controlado por style.zIndex explícito — assim
  // reordenar (mudar zIndex) nunca precisa remontar o elemento <video> (perderia o playback).
  const orderedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex)

  return (
    <div ref={containerRef} className="ac-editor-canvas-container">
      <div
        ref={frameRef}
        className="ac-editor-frame"
        style={{ width: frameSize.width, height: frameSize.height }}
        onMouseDown={(e) => { if (e.target === frameRef.current) { onSelectLayer(null); setSubtitleSelected(false) } }}
      >
        {/* Fundo */}
        {background.type === 'color' ? (
          <div className="ac-editor-bg" style={{ background: background.color }} />
        ) : (
          <div className="ac-editor-bg ac-editor-bg--blur">
            <video
              ref={bgVideoRef}
              src={mainLayer?.source}
              muted
              playsInline
              style={{ filter: `blur(${background.blurAmount}px)`, transform: 'scale(1.18)' }}
            />
          </div>
        )}

        {orderedLayers.map((layer) => {
          const isActive = activeIds.has(layer.id)
          return (
            <video
              key={layer.id}
              ref={getVideoRefCallback(layer.id, layer.isMain)}
              src={layer.source}
              className="ac-editor-video"
              playsInline
              muted={!layer.isMain}
              style={{ zIndex: layer.zIndex, display: isActive ? undefined : 'none' }}
              onClick={(e) => { e.stopPropagation(); setSubtitleSelected(false); onSelectLayer(layer.id) }}
              onLoadedMetadata={(e) => onLayerLoadedMetadata(layer.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              onTimeUpdate={layer.isMain ? onMainTimeUpdate : undefined}
              onDurationChange={layer.isMain ? (e) => onMainDurationChange(e.currentTarget.duration || 0) : undefined}
              onEnded={layer.isMain ? onMainEnded : undefined}
              onPlay={layer.isMain ? () => onMainPlayStateChange(true) : undefined}
              onPause={layer.isMain ? () => onMainPlayStateChange(false) : undefined}
            />
          )
        })}

        {selectedLayer && selectedVideoEl && frameSize.width > 0 && (
          <Moveable
            target={selectedVideoEl}
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
            // 8 handles (cantos + centros de cada borda). keepRatio preserva o aspect ratio do
            // vídeo em qualquer um deles — o Canvas tem overflow:hidden (ac.editor-frame), então
            // ampliar o vídeo além do frame e arrastar funciona como janela de recorte, sem
            // precisar de uma segunda lógica de transformação. Vale pra qualquer layer selecionada.
            renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
            verticalGuidelines={[0, frameSize.width / 2, frameSize.width]}
            horizontalGuidelines={[0, frameSize.height / 2, frameSize.height]}
            onDrag={handleDrag}
            onDragEnd={({ target }) => commitFromTarget(selectedLayer.id, target)}
            onResize={handleResize}
            onResizeEnd={({ target }) => commitFromTarget(selectedLayer.id, target)}
          />
        )}

        <SubtitleLayer
          segments={subtitleSegments}
          currentTime={currentTime}
          style={subtitleStyle}
          position={subtitlePosition}
          frameSize={frameSize}
          frameEl={frameRef.current}
          logicalWidth={dims.width}
          selected={subtitleSelected}
          onSelect={() => { onSelectLayer(null); setSubtitleSelected(true) }}
          onPositionChange={onSubtitlePositionChange}
        />
      </div>
    </div>
  )
}

export default EditorCanvas
