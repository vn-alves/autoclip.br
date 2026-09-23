import React from 'react'
import { Spin } from 'antd'
import { Btn, Segmented } from '../../ui'
import SubtitleStyleCards from './SubtitleStyleCards'
import {
  SubtitleAnimation, SubtitlePosition, SubtitlePositionPreset, SubtitleStyle, SubtitleStylePreset,
  SubtitleSyncStatus, SubtitleWordsPerCaption, WORDS_PER_CAPTION_OPTIONS,
} from './types'

interface SubtitleControlsProps {
  loading: boolean
  error: string | null
  available: boolean
  hasSegments: boolean
  style: SubtitleStyle
  position: SubtitlePosition
  onApplyPreset: (preset: SubtitleStylePreset) => void
  onStyleChange: (patch: Partial<Omit<SubtitleStyle, 'id' | 'outline'>>) => void
  onOutlineChange: (patch: Partial<SubtitleStyle['outline']>) => void
  onPositionPreset: (preset: Exclude<SubtitlePositionPreset, 'custom'>) => void
  /** Sincronização precisa (Whisper + alinhamento) — ver subtitle_sync_service.py. */
  syncStatus: SubtitleSyncStatus
  syncMessage: string | null
  syncError: string | null
  syncedAt: string | null
  onStartSync: () => void
  wordsPerCaption: SubtitleWordsPerCaption
  onWordsPerCaptionChange: (value: SubtitleWordsPerCaption) => void
}

const FONT_OPTIONS = [
  { value: "Inter, 'Noto Sans SC', system-ui, sans-serif", label: 'Inter' },
  { value: "Arial, 'Noto Sans SC', sans-serif", label: 'Arial' },
  { value: "Georgia, 'Noto Sans SC', serif", label: 'Georgia' },
  { value: "Impact, 'Noto Sans SC', sans-serif", label: 'Impact' },
]

// Segmented só aceita valores string; o peso real (number) fica em SubtitleStyle.fontWeight.
const WEIGHT_OPTIONS: { value: string; label: string }[] = [
  { value: '400', label: 'Normal' },
  { value: '600', label: 'Médio' },
  { value: '700', label: 'Negrito' },
  { value: '800', label: 'Extra' },
]

const ANIMATION_OPTIONS: { value: SubtitleAnimation; label: string }[] = [
  { value: 'none', label: 'Nenhuma' },
  { value: 'karaoke', label: 'Karaokê' },
  { value: 'pop_in', label: 'Pop-in' },
]

const POSITION_OPTIONS: { value: Exclude<SubtitlePositionPreset, 'custom'>; label: string }[] = [
  { value: 'top', label: 'Topo' },
  { value: 'center', label: 'Centro' },
  { value: 'bottom', label: 'Inferior' },
]

const formatSyncedAt = (iso: string): string => {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/** Painel de propriedades da legenda — Etapa 2. Some sozinho quando o corte não tem legenda. */
const SubtitleControls: React.FC<SubtitleControlsProps> = ({
  loading, error, available, hasSegments, style, position,
  onApplyPreset, onStyleChange, onOutlineChange, onPositionPreset,
  syncStatus, syncMessage, syncError, syncedAt, onStartSync,
  wordsPerCaption, onWordsPerCaptionChange,
}) => {
  if (loading) {
    return (
      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Legenda</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ac-sub)', fontSize: 13 }}>
          <Spin size="small" /> Carregando legendas…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Legenda</div>
        <p style={{ color: 'var(--ac-error)', fontSize: 13, margin: 0 }}>{error}</p>
      </div>
    )
  }

  if (!available || !hasSegments) {
    return (
      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Legenda</div>
        <p style={{ color: 'var(--ac-sub)', fontSize: 13, margin: 0 }}>
          Este corte não possui legendas disponíveis.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Sincronização</div>
        {syncStatus === 'syncing' ? (
          <Btn size="sm" loading disabled>{syncMessage || 'Sincronizando…'}</Btn>
        ) : syncStatus === 'synced' ? (
          <>
            <p className="ac-editor-hint" style={{ color: 'var(--ac-accent)', marginTop: 0 }}>
              ✓ Sincronizado{syncedAt ? ` · ${formatSyncedAt(syncedAt)}` : ''}
            </p>
            <Btn size="sm" onClick={onStartSync}>Sincronizar novamente</Btn>
          </>
        ) : (
          <>
            <Btn size="sm" onClick={onStartSync}>Sincronizar com IA</Btn>
            <p className="ac-editor-hint">
              Alinha a legenda ao áudio real do corte (timing preciso por palavra, karaokê correto).
            </p>
          </>
        )}
        {syncStatus === 'error' && syncError && (
          <p style={{ color: 'var(--ac-error)', fontSize: 12, marginTop: 8 }}>{syncError}</p>
        )}
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Palavras por legenda</div>
        <select
          className="ac-input"
          value={String(wordsPerCaption)}
          disabled={syncStatus !== 'synced'}
          onChange={(e) => onWordsPerCaptionChange((e.target.value === 'auto' ? 'auto' : Number(e.target.value)) as SubtitleWordsPerCaption)}
        >
          {WORDS_PER_CAPTION_OPTIONS.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
        {syncStatus !== 'synced' && (
          <p className="ac-editor-hint">Sincronize com IA para poder ajustar o agrupamento de palavras.</p>
        )}
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Estilo</div>
        <SubtitleStyleCards activePresetId={style.id} onApply={onApplyPreset} />
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Fonte</div>
        <select
          className="ac-input"
          value={style.fontFamily}
          onChange={(e) => onStyleChange({ fontFamily: e.target.value })}
          style={{ marginBottom: 10 }}
        >
          {FONT_OPTIONS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <Segmented
          size="sm"
          value={String(style.fontWeight)}
          onChange={(v) => onStyleChange({ fontWeight: Number(v) as SubtitleStyle['fontWeight'] })}
          options={WEIGHT_OPTIONS}
          ariaLabel="Peso da fonte"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input
            type="range"
            min={20}
            max={100}
            value={style.fontSize}
            onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
            style={{ flex: 1 }}
          />
          <span className="ac-editor-value-label">{style.fontSize}px</span>
        </div>
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Cor</div>
        <div className="ac-editor-color-row">
          <label>
            <span>Texto</span>
            <input type="color" className="ac-editor-color-input" value={style.color} onChange={(e) => onStyleChange({ color: e.target.value })} />
          </label>
          <label>
            <span>Destaque</span>
            <input type="color" className="ac-editor-color-input" value={style.highlightColor} onChange={(e) => onStyleChange({ highlightColor: e.target.value })} />
          </label>
        </div>
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Contorno</div>
        <Segmented
          size="sm"
          ariaLabel="Contorno"
          value={style.outline.enabled ? 'on' : 'off'}
          onChange={(v) => onOutlineChange({ enabled: v === 'on' })}
          options={[{ value: 'on', label: 'Ativo' }, { value: 'off', label: 'Desativado' }]}
        />
        {style.outline.enabled && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <input type="color" className="ac-editor-color-input" style={{ width: 44 }} value={style.outline.color} onChange={(e) => onOutlineChange({ color: e.target.value })} />
            <input
              type="range"
              min={1}
              max={6}
              value={style.outline.width}
              onChange={(e) => onOutlineChange({ width: Number(e.target.value) })}
              style={{ flex: 1 }}
            />
            <span className="ac-editor-value-label">{style.outline.width}px</span>
          </div>
        )}
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Posição</div>
        <Segmented
          size="sm"
          ariaLabel="Posição da legenda"
          value={position.preset as Exclude<SubtitlePositionPreset, 'custom'>}
          onChange={onPositionPreset}
          options={POSITION_OPTIONS}
        />
        <p className="ac-editor-hint">Ou arraste a legenda diretamente no canvas para uma posição personalizada.</p>
      </div>

      <div className="ac-editor-panel-section">
        <div className="ac-editor-panel-label">Animação</div>
        <Segmented size="sm" ariaLabel="Animação da legenda" value={style.animation} onChange={(v) => onStyleChange({ animation: v })} options={ANIMATION_OPTIONS} />
      </div>
    </>
  )
}

export default SubtitleControls
