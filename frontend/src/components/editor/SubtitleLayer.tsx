import React, { useMemo, useState } from 'react'
import Moveable, { type OnDrag, type OnResize } from 'react-moveable'
import {
  SubtitlePosition, SubtitleSegment, SubtitleStyle,
  findActiveSegment, findActiveWord, subtitleOutlineShadow,
} from './types'

interface SubtitleLayerProps {
  segments: SubtitleSegment[]
  currentTime: number
  style: SubtitleStyle
  position: SubtitlePosition
  /** tamanho físico atual do frame (px) — mesma medição que o vídeo já usa, para os dois ficarem no mesmo sistema de coordenadas. */
  frameSize: { width: number; height: number }
  frameEl: HTMLElement | null
  /** largura lógica do canvas (ex.: 1080 para 9:16) — fontSize é definido nessa escala, não em px físicos do preview. */
  logicalWidth: number
  selected: boolean
  onSelect: () => void
  onPositionChange: (p: Partial<SubtitlePosition>) => void
}

/**
 * Camada de legenda do Editor de Corte — Etapa 2.
 *
 * Conceitualmente: Canvas → Background, Vídeo principal, Subtitle overlay
 * (esta camada). Continua DOM (não canvas de pixels), como o vídeo.
 * Só renderiza algo quando currentTime cai dentro de um segmento — fora
 * disso a legenda simplesmente não existe no DOM.
 */
const SubtitleLayer: React.FC<SubtitleLayerProps> = ({
  segments, currentTime, style, position, frameSize, frameEl, logicalWidth, selected, onSelect, onPositionChange,
}) => {
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null)

  const activeSegment = useMemo(() => findActiveSegment(segments, currentTime), [segments, currentTime])
  const activeWordId = useMemo(() => {
    if (style.animation !== 'karaoke' || !activeSegment) return null
    return findActiveWord(activeSegment, currentTime)?.id ?? null
  }, [style.animation, activeSegment, currentTime])

  const commit = (target: HTMLElement) => {
    if (frameSize.width === 0 || frameSize.height === 0) return
    const left = parseFloat(target.style.left || '0')
    const top = parseFloat(target.style.top || '0')
    const width = parseFloat(target.style.width || '0')
    onPositionChange({
      preset: 'custom',
      x: left / frameSize.width,
      y: top / frameSize.height,
      width: width / frameSize.width,
    })
  }

  const handleDrag = ({ target, left, top }: OnDrag) => {
    target.style.left = `${left}px`
    target.style.top = `${top}px`
  }

  // Só largura é redimensionável (w/e) — a altura é sempre automática, definida pelo texto.
  const handleResize = ({ target, width, drag }: OnResize) => {
    target.style.width = `${width}px`
    target.style.left = `${drag.left}px`
  }

  if (!activeSegment || frameSize.width === 0) return null

  const scale = logicalWidth > 0 ? frameSize.width / logicalWidth : 1
  const words = activeSegment.words.length > 0
    ? activeSegment.words
    : [{ id: activeSegment.id, text: activeSegment.text, startTime: activeSegment.startTime, endTime: activeSegment.endTime }]

  return (
    <>
      <div
        ref={setBoxEl}
        className={`ac-editor-subtitle-box${style.animation === 'pop_in' ? ' ac-editor-subtitle-box--pop' : ''}`}
        key={style.animation === 'pop_in' ? activeSegment.id : undefined}
        style={{
          left: position.x * frameSize.width,
          top: position.y * frameSize.height,
          width: position.width * frameSize.width,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize * scale,
          fontWeight: style.fontWeight,
          textShadow: subtitleOutlineShadow(style.outline),
        }}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {words.map((w) => (
          <span
            key={w.id}
            style={{ color: activeWordId === w.id ? style.highlightColor : style.color }}
          >
            {w.text}{' '}
          </span>
        ))}
      </div>

      {boxEl && selected && (
        <Moveable
          target={boxEl}
          container={frameEl}
          origin={false}
          draggable
          resizable
          keepRatio={false}
          throttleDrag={0}
          throttleResize={0}
          snappable
          snapCenter
          snapThreshold={6}
          renderDirections={['w', 'e']}
          verticalGuidelines={[0, frameSize.width / 2, frameSize.width]}
          horizontalGuidelines={[0, frameSize.height / 2, frameSize.height]}
          onDrag={handleDrag}
          onDragEnd={({ target }) => commit(target as HTMLElement)}
          onResize={handleResize}
          onResizeEnd={({ target }) => commit(target as HTMLElement)}
        />
      )}
    </>
  )
}

export default SubtitleLayer
