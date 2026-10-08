import React, { useEffect, useState } from 'react'
import { Icon } from '../../ui'
import { SubtitleSegment } from './types'

interface SubtitleTimelineProps {
  segments: SubtitleSegment[]
  duration: number
  selectedSegmentId: string | null
  onSelectSegment: (segment: SubtitleSegment) => void
  /** Etapa 5 — duplo clique num bloco abre edição inline (corrigir tradução / remover a
   * legenda), direto onde ela aparece embaixo do player — sem props, os blocos continuam só
   * selecionáveis (comportamento anterior, ex.: se algum outro uso da Timeline não precisar
   * de edição). `segmentIndex` é `segment.index` — a chave estável usada pelo backend. */
  onEditText?: (segmentIndex: number, text: string) => void
  onDelete?: (segmentIndex: number) => void
}

/** Caixa de edição flutuante, ancorada na posição do bloco — um bloco pode ser estreito demais
 * pra caber um textarea dentro dele, então a edição abre por cima da faixa em vez de dentro do
 * bloco. Fecha ao confirmar (Enter/blur) ou se o usuário clicar fora. */
function InlineEditor({ segment, left, onSave, onDelete, onClose }: {
  segment: SubtitleSegment
  left: number
  onSave: (text: string) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(segment.text)
  const boxRef = React.useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) commitAndClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [draft])

  const commitAndClose = () => {
    if (draft.trim() && draft.trim() !== segment.text.trim()) onSave(draft)
    onClose()
  }

  // Mantém a caixa dentro da faixa: perto da borda direita, ancora pela direita em vez da
  // esquerda (senão vazaria pra fora da Timeline em legendas no fim do vídeo).
  const anchorRight = left > 60
  const style: React.CSSProperties = anchorRight
    ? { right: `${100 - left}%`, left: 'auto' }
    : { left: `${left}%` }

  return (
    <div ref={boxRef} className="ac-editor-subtitle-inline-editor" style={style} onPointerDown={(e) => e.stopPropagation()}>
      <textarea
        className="ac-input"
        rows={3}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAndClose() }
          if (e.key === 'Escape') { e.preventDefault(); onClose() }
        }}
      />
      <div className="ac-editor-subtitle-inline-editor-actions">
        <button
          type="button"
          className="ac-editor-subtitle-row-delete"
          onClick={() => { onDelete(); onClose() }}
          title="Remover esta legenda do vídeo"
          aria-label="Remover esta legenda"
        >
          <Icon.Trash size={14} />
        </button>
      </div>
    </div>
  )
}

/**
 * Linha de blocos de legenda dentro da Timeline — Etapa 2.
 * Puramente posicional (percentuais sobre `duration`), sem medir nada em
 * pixel: reaproveita a mesma largura da faixa principal da Timeline.
 *
 * Etapa 5: duplo clique num bloco edita o texto (corrigir tradução ruim) ou remove a legenda
 * inteira — direto aqui, onde a legenda já aparece, em vez de uma lista separada no painel.
 */
const SubtitleTimeline: React.FC<SubtitleTimelineProps> = ({
  segments, duration, selectedSegmentId, onSelectSegment, onEditText, onDelete,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  if (!segments.length || duration <= 0) return null

  const editingSegment = editingIndex !== null ? segments.find((s) => s.index === editingIndex) : null

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
            title={onEditText ? `${seg.text} (clique duplo para editar)` : seg.text}
            onClick={(e) => { e.stopPropagation(); onSelectSegment(seg) }}
            onDoubleClick={(e) => { e.stopPropagation(); if (onEditText) setEditingIndex(seg.index) }}
          >
            {seg.text}
          </button>
        )
      })}
      {editingSegment && onEditText && onDelete && (
        <InlineEditor
          segment={editingSegment}
          left={(editingSegment.startTime / duration) * 100}
          onSave={(text) => onEditText(editingSegment.index, text)}
          onDelete={() => onDelete(editingSegment.index)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </div>
  )
}

export default SubtitleTimeline
