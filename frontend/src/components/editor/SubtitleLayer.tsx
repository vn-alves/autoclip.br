import React, { useMemo, useState } from 'react'
import Moveable, { type OnDrag, type OnResize } from 'react-moveable'
import {
  SubtitlePosition, SubtitleSegment, SubtitleStyle, SubtitleTransition, SubtitleWord, WordHighlight,
  findActiveSegment, getWordAnimationProgress, subtitleOutlineShadow,
} from './types'

interface SubtitleLayerProps {
  segments: SubtitleSegment[]
  currentTime: number
  style: SubtitleStyle
  position: SubtitlePosition
  transition: SubtitleTransition
  wordHighlight: WordHighlight
  /** tamanho físico atual do frame (px) — mesma medição que o vídeo já usa, para os dois ficarem no mesmo sistema de coordenadas. */
  frameSize: { width: number; height: number }
  frameEl: HTMLElement | null
  /** largura lógica do canvas (ex.: 1080 para 9:16) — fontSize é definido nessa escala, não em px físicos do preview. */
  logicalWidth: number
  selected: boolean
  onSelect: () => void
  onPositionChange: (p: Partial<SubtitlePosition>) => void
}

const hexToRgba = (hex: string, alpha: number): string => {
  const h = (hex || '#000000').replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r},${g},${b},${alpha})`
}

/** Estilo do destaque quando a palavra está ativa (item 5 da Etapa 4.2) — uma única função,
 * usada por TODA palavra, nunca lógica duplicada por tipo espalhada pelo JSX. */
function activeWordStyle(highlight: WordHighlight, scale: number): React.CSSProperties {
  switch (highlight.type) {
    case 'color':
      return { color: highlight.color }
    case 'background':
      return { color: highlight.color, backgroundColor: highlight.backgroundColor, borderRadius: 4 * scale, padding: `0 ${3 * scale}px` }
    case 'bold':
      return { fontWeight: 800 }
    case 'scale':
      return { transform: `scale(${highlight.scale})` }
    case 'color_background':
      return { color: highlight.color, backgroundColor: highlight.backgroundColor, borderRadius: 4 * scale, padding: `0 ${3 * scale}px` }
    case 'pop':
      return { color: highlight.color, transform: `scale(${highlight.scale})` }
    case 'karaoke':
      return { color: highlight.color }
    case 'none':
    default:
      return {}
  }
}

/** Estilo de ENTRADA por palavra — só usado quando transition.type gateia por palavra
 * ('word_by_word'/'word_follow'); nos demais modos a entrada é do bloco inteiro (ver
 * className animada no container, item 4: nunca aplicar a animação de bloco quando o modo é
 * por palavra). */
function wordEntranceStyle(transition: SubtitleTransition, enterProgress: number, scale: number): React.CSSProperties {
  if (transition.type === 'word_by_word') {
    const dy = (1 - enterProgress) * 12 * scale
    return { opacity: enterProgress, transform: `translateY(${dy}px)` }
  }
  if (transition.type === 'word_follow') {
    return { opacity: enterProgress }
  }
  return {}
}

/**
 * Camada de legenda do Editor de Corte.
 *
 * Conceitualmente: Canvas → Background, Vídeo principal, Subtitle overlay (esta camada).
 * Continua DOM (não canvas de pixels), como o vídeo. Só renderiza algo quando currentTime cai
 * dentro de um segmento — fora disso a legenda simplesmente não existe no DOM.
 *
 * Etapa 4.2: toda a lógica de progresso de animação passa por getWordAnimationProgress
 * (types.ts) — item 7 do pedido ("não espalhar cálculos diferentes pelos componentes").
 */
const SubtitleLayer: React.FC<SubtitleLayerProps> = ({
  segments, currentTime, style, position, transition, wordHighlight,
  frameSize, frameEl, logicalWidth, selected, onSelect, onPositionChange,
}) => {
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null)

  const activeSegment = useMemo(() => findActiveSegment(segments, currentTime), [segments, currentTime])

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
  const words: SubtitleWord[] = activeSegment.words.length > 0
    ? activeSegment.words
    : [{ id: activeSegment.id, text: activeSegment.text, startTime: activeSegment.startTime, endTime: activeSegment.endTime }]

  // Modos que gateiam a visibilidade de cada palavra pelo timestamp dela (item 4) nunca
  // animam o bloco inteiro — só os demais tipos usam a animação de entrada do CONTAINER.
  const gatesByWord = transition.type === 'word_by_word' || transition.type === 'word_follow'
  const blockAnimClass = !gatesByWord && transition.type !== 'none' ? `ac-editor-subtitle-box--anim ac-editor-subtitle-box--anim-${transition.type}` : ''

  const hasBox = style.backgroundOpacity > 0

  return (
    <>
      <div
        ref={setBoxEl}
        className={`ac-editor-subtitle-box${blockAnimClass ? ` ${blockAnimClass}` : ''}`}
        // Remonta (replay da animação CSS) toda vez que o bloco ativo muda — mesmo padrão que
        // já existia pro pop_in, agora genérico pra qualquer transição de bloco.
        key={blockAnimClass ? activeSegment.id : undefined}
        style={{
          left: position.x * frameSize.width,
          top: position.y * frameSize.height,
          width: position.width * frameSize.width,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize * scale,
          fontWeight: style.fontWeight,
          textShadow: subtitleOutlineShadow(style.outline),
          backgroundColor: hasBox ? hexToRgba(style.backgroundColor, style.backgroundOpacity) : 'transparent',
          borderRadius: hasBox ? style.borderRadius * scale : 0,
          boxShadow: style.shadow ? '0 6px 18px rgba(0,0,0,0.35)' : 'none',
          padding: hasBox ? `${6 * scale}px ${12 * scale}px` : `${4 * scale}px ${8 * scale}px`,
          animationDuration: blockAnimClass ? `${transition.duration}s` : undefined,
          animationTimingFunction: blockAnimClass ? transition.easing : undefined,
        }}
        onClick={(e) => { e.stopPropagation(); onSelect() }}
      >
        {words.map((w) => {
          const anim = getWordAnimationProgress(currentTime, w, transition)
          if (gatesByWord && !anim.visible) return null

          const highlightStyle = anim.isActive ? activeWordStyle(wordHighlight, scale) : {}
          const entranceStyle = gatesByWord ? wordEntranceStyle(transition, anim.enterProgress, scale) : {}
          const showExtraPop = anim.isActive && wordHighlight.type !== 'pop' && wordHighlight.animation === 'pop'

          return (
            // O espaço fica FORA do <span> (irmão, não filho) — o span é inline-block (pra
            // transform funcionar em scale/pop/entrada, ver word_entranceStyle), e um espaço
            // final DENTRO de um inline-block é cortado pelo navegador (regra de whitespace
            // na borda da caixa), grudando as palavras. Como texto solto fora do span, o
            // espaço nunca é aparado.
            <React.Fragment key={`${w.id}${anim.isActive ? '-active' : ''}`}>
              <span
                className={showExtraPop ? 'ac-editor-subtitle-word--pop' : undefined}
                style={{
                  color: style.color,
                  ...highlightStyle,
                  ...entranceStyle,
                  ['--ac-word-pop-scale' as string]: wordHighlight.scale,
                }}
              >
                {w.text}
              </span>
              {' '}
            </React.Fragment>
          )
        })}
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
