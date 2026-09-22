import React from 'react'
import { SUBTITLE_STYLE_PRESETS, SubtitleStylePreset, subtitleOutlineShadow } from './types'

interface SubtitleStyleCardsProps {
  activePresetId: string
  onApply: (preset: SubtitleStylePreset) => void
}

/**
 * Cards de preview dos estilos de legenda — Etapa 2.
 * Base pequena (ver SUBTITLE_STYLE_PRESETS em types.ts); adicionar um estilo novo
 * é só acrescentar um objeto na lista, não mexe neste componente.
 */
const SubtitleStyleCards: React.FC<SubtitleStyleCardsProps> = ({ activePresetId, onApply }) => (
  <div className="ac-editor-style-cards">
    {SUBTITLE_STYLE_PRESETS.map((preset) => {
      const outline = preset.style.outline ?? { enabled: false, color: '#000000', width: 0 }
      return (
        <button
          key={preset.id}
          type="button"
          className={`ac-editor-style-card${preset.id === activePresetId ? ' ac-editor-style-card--active' : ''}`}
          onClick={() => onApply(preset)}
        >
          <span
            className="ac-editor-style-card-preview"
            style={{
              color: preset.style.color || '#FFFFFF',
              fontWeight: preset.style.fontWeight || 700,
              textShadow: subtitleOutlineShadow(outline),
            }}
          >
            Aa
          </span>
          <span className="ac-editor-style-card-label">{preset.label}</span>
        </button>
      )
    })}
  </div>
)

export default SubtitleStyleCards
