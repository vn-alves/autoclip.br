import React, { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { projectApi, ClipDetail, SubtitleSegment } from '../services/api'
import { Btn, Icon, Segmented } from '../ui'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorTimeline from '../components/editor/EditorTimeline'
import SubtitleControls from '../components/editor/SubtitleControls'
import {
  BackgroundType, CanvasFormat, EditorState, NormalizedTransform,
  SubtitlePosition, SubtitlePositionPreset, SubtitleStyle, SubtitleStylePreset,
  createDefaultEditorState, fitTransform, resizeTransformForFormat, SUBTITLE_POSITION_PRESETS,
} from '../components/editor/types'
import './ClipEditorPage.css'

const FORMAT_OPTIONS: { value: CanvasFormat; label: string }[] = [
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
]

const BACKGROUND_OPTIONS: { value: BackgroundType; label: string }[] = [
  { value: 'blur', label: 'Desfoque' },
  { value: 'color', label: 'Cor sólida' },
]

const fmtTime = (sec: number): string => {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Editor de Corte — ETAPA 1 (fundação).
 *
 * Estado só em memória nesta etapa (sem persistência — chega na Etapa 4).
 * Não toca no fluxo/exportação existentes; é uma tela nova, independente.
 */
const ClipEditorPage: React.FC = () => {
  const { id: projectId, clipId } = useParams<{ id: string; clipId: string }>()
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)

  const [clip, setClip] = useState<ClipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editorState, setEditorState] = useState<EditorState>(createDefaultEditorState())
  const [videoRatio, setVideoRatio] = useState<number | null>(null)
  const [hasCustomTransform, setHasCustomTransform] = useState(false)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)

  const [subtitleSegments, setSubtitleSegments] = useState<SubtitleSegment[]>([])
  const [subtitleLoading, setSubtitleLoading] = useState(true)
  const [subtitleError, setSubtitleError] = useState<string | null>(null)
  // false = corte sem SRT/legenda disponível (404 do backend) — nunca tratado como erro fatal.
  const [subtitleAvailable, setSubtitleAvailable] = useState(true)

  useEffect(() => {
    if (!clipId) return
    let alive = true
    setLoading(true)
    setLoadError(null)
    projectApi.getClipDetail(clipId)
      .then((c) => { if (alive) { setClip(c); setDuration(c.duration || 0) } })
      .catch((err: any) => {
        if (alive) setLoadError(err?.response?.data?.detail || err?.message || 'Não foi possível carregar o corte')
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [clipId])

  // Legendas: busca separada da do clip — uma falha aqui nunca deve travar o resto do editor.
  useEffect(() => {
    if (!projectId || !clipId) return
    let alive = true
    setSubtitleLoading(true)
    setSubtitleError(null)
    setSubtitleAvailable(true)
    projectApi.getClipSubtitles(projectId, clipId)
      .then((data) => { if (alive) setSubtitleSegments(data.segments || []) })
      .catch((err: any) => {
        if (!alive) return
        if (err?.response?.status === 404) {
          setSubtitleAvailable(false)
        } else {
          setSubtitleError(err?.response?.data?.detail || err?.message || 'Não foi possível carregar as legendas')
        }
      })
      .finally(() => { if (alive) setSubtitleLoading(false) })
    return () => { alive = false }
  }, [projectId, clipId])

  const videoUrl = projectId && clipId ? projectApi.getClipVideoUrl(projectId, clipId) : ''

  const handleLoadedMetadata = (videoWidth: number, videoHeight: number) => {
    if (!videoWidth || !videoHeight) return
    const ratio = videoWidth / videoHeight
    setVideoRatio(ratio)
    if (!hasCustomTransform) {
      setEditorState((s) => ({ ...s, videoLayer: { ...s.videoLayer, transform: fitTransform(s.canvas.format, ratio) } }))
    }
  }

  const handleFormatChange = (format: CanvasFormat) => {
    setEditorState((s) => {
      if (!videoRatio) return { ...s, canvas: { ...s.canvas, format } }
      const nextTransform = hasCustomTransform
        ? resizeTransformForFormat(s.videoLayer.transform, s.canvas.format, format, videoRatio)
        : fitTransform(format, videoRatio)
      return { ...s, canvas: { ...s.canvas, format }, videoLayer: { ...s.videoLayer, transform: nextTransform } }
    })
  }

  const handleTransformChange = (t: NormalizedTransform) => {
    setHasCustomTransform(true)
    setEditorState((s) => ({ ...s, videoLayer: { ...s.videoLayer, transform: t } }))
  }

  const handleBackgroundType = (type: BackgroundType) => {
    setEditorState((s) => ({ ...s, canvas: { ...s.canvas, background: { ...s.canvas.background, type } } }))
  }

  const handleBackgroundColor = (color: string) => {
    setEditorState((s) => ({ ...s, canvas: { ...s.canvas, background: { ...s.canvas.background, color } } }))
  }

  const handleApplySubtitlePreset = (preset: SubtitleStylePreset) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, style: { ...s.subtitle.style, ...preset.style, id: preset.id } },
    }))
  }

  const handleSubtitleStyleChange = (patch: Partial<Omit<SubtitleStyle, 'id' | 'outline'>>) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, style: { ...s.subtitle.style, ...patch, id: 'custom' } },
    }))
  }

  const handleSubtitleOutlineChange = (patch: Partial<SubtitleStyle['outline']>) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, style: { ...s.subtitle.style, outline: { ...s.subtitle.style.outline, ...patch }, id: 'custom' } },
    }))
  }

  const handleSubtitlePositionPreset = (preset: Exclude<SubtitlePositionPreset, 'custom'>) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, position: { preset, ...SUBTITLE_POSITION_PRESETS[preset] } },
    }))
  }

  const handleSubtitlePositionChange = (patch: Partial<SubtitlePosition>) => {
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, position: { ...s.subtitle.position, ...patch } } }))
  }

  // Clicar num bloco da timeline de legendas: seleciona (destaque visual) e move o playhead
  // para o início do segmento, como pedido no item 2 da Etapa 2.
  const handleSelectSubtitleSegment = (segment: SubtitleSegment) => {
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, selectedSegmentId: segment.id } }))
    handleSeek(segment.startTime)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const handleSeek = (t: number) => {
    const v = videoRef.current
    setCurrentTime(t)
    if (v) v.currentTime = Math.min(Math.max(0, t), v.duration || t)
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (v) setCurrentTime(v.currentTime)
  }

  if (loading) {
    return (
      <div className="ac-editor-page" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Spin />
      </div>
    )
  }

  if (loadError || !clip || !projectId || !clipId) {
    return (
      <div className="ac-editor-page" style={{ alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <p style={{ color: 'var(--ac-sub)', fontSize: 14 }}>{loadError || 'Corte não encontrado'}</p>
        <Btn onClick={() => navigate(projectId ? `/project/${projectId}` : '/')}>Voltar</Btn>
      </div>
    )
  }

  return (
    <div className="ac-editor-page">
      <header className="ac-editor-header">
        <div className="ac-editor-header-title">
          <Btn variant="text" onClick={() => navigate(`/project/${projectId}`)}>
            <Icon.Back size={13} /> Voltar
          </Btn>
          <h1>{clip.title || 'Editar corte'}</h1>
        </div>
        <span className="ac-editor-badge">Edição local · ainda não é salva</span>
      </header>

      <div className="ac-editor-body">
        <aside className="ac-editor-panel">
          <div className="ac-editor-panel-section">
            <div className="ac-editor-panel-label">Formato</div>
            <Segmented value={editorState.canvas.format} onChange={handleFormatChange} options={FORMAT_OPTIONS} />
          </div>
          <div className="ac-editor-panel-section">
            <div className="ac-editor-panel-label">Fundo</div>
            <Segmented value={editorState.canvas.background.type} onChange={handleBackgroundType} options={BACKGROUND_OPTIONS} />
            {editorState.canvas.background.type === 'color' && (
              <input
                type="color"
                className="ac-editor-color-input"
                style={{ marginTop: 10 }}
                value={editorState.canvas.background.color}
                onChange={(e) => handleBackgroundColor(e.target.value)}
              />
            )}
          </div>

          <SubtitleControls
            loading={subtitleLoading}
            error={subtitleError}
            available={subtitleAvailable}
            hasSegments={subtitleSegments.length > 0}
            style={editorState.subtitle.style}
            position={editorState.subtitle.position}
            onApplyPreset={handleApplySubtitlePreset}
            onStyleChange={handleSubtitleStyleChange}
            onOutlineChange={handleSubtitleOutlineChange}
            onPositionPreset={handleSubtitlePositionPreset}
          />
        </aside>

        <main className="ac-editor-main">
          <EditorCanvas
            videoUrl={videoUrl}
            format={editorState.canvas.format}
            background={editorState.canvas.background}
            transform={editorState.videoLayer.transform}
            currentTime={currentTime}
            subtitleSegments={subtitleSegments}
            subtitleStyle={editorState.subtitle.style}
            subtitlePosition={editorState.subtitle.position}
            onSubtitlePositionChange={handleSubtitlePositionChange}
            onTransformChange={handleTransformChange}
            onLoadedMetadata={handleLoadedMetadata}
            videoRef={videoRef}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={setDuration}
            onEnded={() => setIsPlaying(false)}
            onPlayStateChange={setIsPlaying}
          />

          <div className="ac-editor-controls">
            <button className="ac-editor-controls-play" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproduzir'}>
              {isPlaying ? <Icon.Pause size={14} /> : <Icon.Play size={14} />}
            </button>
            <span className="ac-editor-controls-time">{fmtTime(currentTime)} / {fmtTime(duration)}</span>
          </div>

          <EditorTimeline
            currentTime={currentTime}
            duration={duration}
            onSeek={handleSeek}
            subtitleSegments={subtitleSegments}
            selectedSubtitleId={editorState.subtitle.selectedSegmentId}
            onSelectSubtitle={handleSelectSubtitleSegment}
          />
        </main>

        <aside className="ac-editor-panel ac-editor-panel--right">
          <div className="ac-editor-panel-section">
            <div className="ac-editor-panel-label">Camadas</div>
            <div className="ac-editor-layer-item">🎥 Vídeo original</div>
            {subtitleSegments.length > 0 && <div className="ac-editor-layer-item">💬 Legenda</div>}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ClipEditorPage
