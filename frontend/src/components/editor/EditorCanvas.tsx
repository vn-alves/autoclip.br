import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Moveable, { type OnDrag, type OnResize, type OnResizeStart } from 'react-moveable'
import { BackgroundConfig, CANVAS_DIMENSIONS, CanvasFormat, NormalizedTransform, SubtitlePosition, SubtitleSegment, SubtitleStyle, SubtitleTransition, WordHighlight, VideoLayer, findActiveLayers } from './types'
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
  /** Etapa 4.2 — transição de entrada e destaque da palavra ativa. */
  subtitleTransition: SubtitleTransition
  wordHighlight: WordHighlight
  /** Oculta a legenda do preview inteiro (mesma flag usada no render — ver types.ts). */
  subtitleVisible: boolean
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
  subtitleSegments, subtitleStyle, subtitlePosition, subtitleTransition, wordHighlight, subtitleVisible, onSubtitlePositionChange,
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
      const left = layer.transform.x * frameSize.width
      const top = layer.transform.y * frameSize.height
      const width = layer.transform.width * frameSize.width
      const height = layer.transform.height * frameSize.height
      el.style.left = `${left}px`
      el.style.top = `${top}px`
      el.style.width = `${width}px`
      el.style.height = `${height}px`
      el.style.transform = layer.transform.rotation ? `rotate(${layer.transform.rotation}deg)` : ''
      // Bug real: um <video> bem maior que o frame (modo "cover" pode passar de 300%,
      // ex.: vídeo 16:9 cobrindo um canvas 9:16) e majoritariamente recortado pelo
      // overflow:hidden do frame às vezes nunca chega a pintar NENHUM frame no Chromium — o
      // elemento existe no tamanho/posição certos, mas fica 100% transparente (confirmado
      // isolando: o mesmo vídeo pinta normalmente com overflow:visible no frame). clip-path
      // no PRÓPRIO vídeo, recortando-o pra exatamente a região visível, evita o overflow:hidden
      // do ancestral precisar recortar esse elemento e o Chromium volta a pintar normalmente.
      const insetLeft = Math.max(0, -left)
      const insetTop = Math.max(0, -top)
      const insetRight = Math.max(0, left + width - frameSize.width)
      const insetBottom = Math.max(0, top + height - frameSize.height)
      el.style.clipPath = (insetLeft || insetTop || insetRight || insetBottom)
        ? `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px)`
        : ''
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

  // Dois comportamentos de resize, escolhidos pelo fitMode da layer selecionada (item pedido:
  // "Normal" continua exatamente como estava; "Preencher proporcionalmente" nunca estica):
  //
  // fitMode 'contain' (Normal): só os handles de CANTO preservam proporção (ancorado no canto
  // OPOSTO); os de BORDA (n/s/e/w) esticam livremente — comportamento antigo, intacto.
  //
  // fitMode 'cover': TODOS os handles redimensionam livremente (largura e altura
  // independentes, como as bordas do modo Normal) — quem impede a deformação do CONTEÚDO não
  // é travar o formato da caixa, é o object-fit:cover no <video> (ver JSX). É exatamente o
  // padrão do vídeo de referência: só a altura muda ao arrastar os handles de cima/baixo, a
  // largura fica onde estava, e o vídeo nunca parece "esticar" porque quem está sempre
  // recortando/cobrindo a caixa é o navegador, não uma trava de proporção no drag.
  const resizeStartRef = useRef({ left: 0, top: 0, width: 0, height: 0, ratio: 1 })

  const handleResizeStart = ({ target }: OnResizeStart) => {
    const el = target as HTMLElement
    const left = parseFloat(el.style.left || '0')
    const top = parseFloat(el.style.top || '0')
    const width = parseFloat(el.style.width || '0')
    const height = parseFloat(el.style.height || '0')
    resizeStartRef.current = { left, top, width, height, ratio: height > 0 ? width / height : 1 }
  }

  const handleResize = ({ target, width, height, drag, direction }: OnResize) => {
    const [dx, dy] = direction
    const isCorner = dx !== 0 && dy !== 0
    const s = resizeStartRef.current
    let newLeft = drag.left
    let newTop = drag.top

    if (selectedLayer?.fitMode !== 'cover' && isCorner) {
      height = width / s.ratio
      // dx/dy === 1 -> a borda direita/inferior é a que está sendo arrastada, então a
      // esquerda/topo fica ancorada (e vice-versa) — mesma convenção de direção do Moveable.
      const anchorX = dx === 1 ? s.left : s.left + s.width
      const anchorY = dy === 1 ? s.top : s.top + s.height
      newLeft = dx === 1 ? anchorX : anchorX - width
      newTop = dy === 1 ? anchorY : anchorY - height
    }
    target.style.width = `${width}px`
    target.style.height = `${height}px`
    target.style.left = `${newLeft}px`
    target.style.top = `${newTop}px`
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
              // 'cover': o conteúdo NUNCA deforma não importa o formato da caixa (o usuário
              // pode redimensionar livremente pra escolher o crop) — quem garante isso é o
              // object-fit, não uma trava no resize. 'contain'/Normal continua 'fill' (a caixa
              // já É o retângulo final calculado por fitTransform ou por um resize manual
              // travado em proporção nos cantos, ver handleResize).
              style={{ zIndex: layer.zIndex, display: isActive ? undefined : 'none', objectFit: layer.fitMode === 'cover' ? 'cover' : 'fill' }}
              onClick={(e) => { e.stopPropagation(); setSubtitleSelected(false); onSelectLayer(layer.id) }}
              onLoadedMetadata={(e) => {
                onLayerLoadedMetadata(layer.id, e.currentTarget.videoWidth, e.currentTarget.videoHeight)
                // Bug real: um vídeo "cover" pode nascer com até ~300%+ do tamanho do frame e a
                // maior parte fora da área visível (recortada pelo overflow:hidden do frame) —
                // nesse caso o Chromium às vezes nunca decodifica/pinta nenhum frame sozinho
                // (elemento correto em tamanho/posição, porém completamente em branco) até um
                // seek ou play explícito acontecer. Mesmo motivo do ClipCard.tsx forçar
                // `video.currentTime` pra gerar a miniatura: um nudge mínimo força a decodificação
                // do frame atual. Sem custo perceptível (não altera o tempo de reprodução real).
                if (e.currentTarget.currentTime === 0) e.currentTarget.currentTime = 0.01
              }}
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
            throttleDrag={0}
            throttleResize={0}
            snappable
            snapCenter
            snapThreshold={6}
            // 8 handles (cantos + centros de cada borda). Cantos preservam o aspect ratio do
            // vídeo (zoom); bordas (n/s/e/w) esticam livremente — ver handleResize. O Canvas
            // tem overflow:hidden (ac.editor-frame), então ampliar o vídeo além do frame e
            // arrastar funciona como janela de recorte, sem precisar de uma segunda lógica de
            // transformação. Vale pra qualquer layer selecionada.
            renderDirections={['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se']}
            verticalGuidelines={[0, frameSize.width / 2, frameSize.width]}
            horizontalGuidelines={[0, frameSize.height / 2, frameSize.height]}
            onDrag={handleDrag}
            onDragEnd={({ target }) => commitFromTarget(selectedLayer.id, target)}
            onResizeStart={handleResizeStart}
            onResize={handleResize}
            onResizeEnd={({ target }) => commitFromTarget(selectedLayer.id, target)}
          />
        )}

        {subtitleVisible && (
          <SubtitleLayer
            segments={subtitleSegments}
            currentTime={currentTime}
            style={subtitleStyle}
            position={subtitlePosition}
            transition={subtitleTransition}
            wordHighlight={wordHighlight}
            frameSize={frameSize}
            frameEl={frameRef.current}
            logicalWidth={dims.width}
            selected={subtitleSelected}
            onSelect={() => { onSelectLayer(null); setSubtitleSelected(true) }}
            onPositionChange={onSubtitlePositionChange}
          />
        )}
      </div>
    </div>
  )
}

export default EditorCanvas
