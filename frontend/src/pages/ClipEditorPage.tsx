import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { projectApi, ClipDetail, SubtitleSegment, SubtitleWord, SubtitleSyncStatus } from '../services/api'
import { Btn, Icon, Segmented } from '../ui'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorTimeline from '../components/editor/EditorTimeline'
import SubtitleControls from '../components/editor/SubtitleControls'
import {
  BackgroundType, CanvasFormat, EditorState, NormalizedTransform,
  SubtitlePosition, SubtitlePositionPreset, SubtitleStyle, SubtitleStylePreset, SubtitleWordsPerCaption,
  createDefaultEditorState, fitTransform, resizeTransformForFormat, SUBTITLE_POSITION_PRESETS,
  groupWordsIntoSegments,
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

// Persistência local da preferência "palavras por legenda" — por clip, só no navegador (não
// existe persistência de servidor pro Editor ainda, isso fica pra Etapa 4). Suficiente pra
// reabrir o Editor do mesmo corte, na mesma máquina, e manter a config escolhida.
const wordsPerCaptionStorageKey = (clipId: string) => `autoclip:editor:wordsPerCaption:${clipId}`

const loadWordsPerCaption = (clipId: string): SubtitleWordsPerCaption | null => {
  try {
    const raw = localStorage.getItem(wordsPerCaptionStorageKey(clipId))
    if (!raw) return null
    if (raw === 'auto') return 'auto'
    const n = Number(raw)
    return ([5, 10, 15, 20, 25, 30] as const).includes(n as 5 | 10 | 15 | 20 | 25 | 30) ? (n as SubtitleWordsPerCaption) : null
  } catch {
    return null
  }
}

const saveWordsPerCaption = (clipId: string, value: SubtitleWordsPerCaption): void => {
  try {
    localStorage.setItem(wordsPerCaptionStorageKey(clipId), String(value))
  } catch {
    // Sem storage disponível (ex.: navegação privada) — não é crítico, só perde a persistência.
  }
}

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

  // Sincronização precisa (Whisper + alinhamento) — ver subtitle_sync_service.py.
  // subtitleWords só é preenchido quando syncStatus === 'synced' (lista achatada, com
  // timestamps reais); o reagrupamento em blocos de legenda é 100% local (useMemo abaixo),
  // nunca chama IA de novo ao mudar wordsPerCaption.
  const [subtitleWords, setSubtitleWords] = useState<SubtitleWord[]>([])
  const [syncStatus, setSyncStatus] = useState<SubtitleSyncStatus>('not_synced')
  const [syncedAt, setSyncedAt] = useState<string | null>(null)
  const [syncJobId, setSyncJobId] = useState<string | null>(null)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)

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
      .then((data) => {
        if (!alive) return
        setSubtitleSegments(data.segments || [])
        setSubtitleWords(data.words || [])
        setSyncStatus(data.sync_status)
        setSyncedAt(data.synced_at)
      })
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

  // Carrega a preferência de "palavras por legenda" salva pra este corte (se houver),
  // sempre que o clip muda — cobre tanto a primeira montagem quanto trocar de corte sem sair
  // da página. Não sobrescreve se não houver nada salvo (mantém o default 'auto').
  useEffect(() => {
    if (!clipId) return
    const saved = loadWordsPerCaption(clipId)
    if (saved === null) return
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, wordsPerCaption: saved } }))
  }, [clipId])

  // Blocos de legenda exibidos no Editor: se já houver sincronização precisa, reagrupa a
  // lista de palavras (timestamps reais) conforme a config de "palavras por legenda" —
  // operação local, instantânea, sem chamar IA. Sem sincronização, usa a estimativa linear
  // que já vem pronta do backend (comportamento da Etapa 2 original).
  const displaySegments = useMemo(() => {
    if (syncStatus === 'synced' && subtitleWords.length > 0) {
      return groupWordsIntoSegments(subtitleWords, editorState.subtitle.wordsPerCaption)
    }
    return subtitleSegments
  }, [syncStatus, subtitleWords, subtitleSegments, editorState.subtitle.wordsPerCaption])

  const handleWordsPerCaptionChange = (value: SubtitleWordsPerCaption) => {
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, wordsPerCaption: value } }))
    if (clipId) saveWordsPerCaption(clipId, value)
  }

  const handleStartSync = () => {
    if (!projectId || !clipId || syncStatus === 'syncing') return
    setSyncStatus('syncing')
    setSyncError(null)
    setSyncMessage('Analisando áudio...')
    projectApi.startClipSubtitleSync(projectId, clipId)
      .then((res) => setSyncJobId(res.job_id))
      .catch((err: any) => {
        setSyncStatus('error')
        setSyncMessage(null)
        setSyncError(err?.response?.data?.detail || err?.message || 'Não foi possível iniciar a sincronização')
      })
  }

  // Polling do job de sincronização — só existe enquanto syncJobId estiver setado (ou seja,
  // só depois de um clique explícito em "Sincronizar com IA"; nunca automático).
  useEffect(() => {
    if (!syncJobId || !projectId || !clipId) return
    let alive = true
    let timeoutId: number | undefined

    const poll = () => {
      projectApi.getClipSubtitleSyncStatus(projectId, clipId, syncJobId)
        .then((job) => {
          if (!alive) return
          if (job.status === 'error') {
            setSyncStatus('error')
            setSyncMessage(null)
            setSyncError(job.error || 'Falha na sincronização')
            setSyncJobId(null)
            return
          }
          if (job.status === 'synced') {
            setSyncMessage('Sincronização concluída')
            setSyncJobId(null)
            // Recarrega as legendas já com os timestamps reais persistidos — nenhuma IA
            // roda de novo aqui, é só ler o que acabou de ser salvo.
            projectApi.getClipSubtitles(projectId, clipId).then((data) => {
              if (!alive) return
              setSubtitleSegments(data.segments || [])
              setSubtitleWords(data.words || [])
              setSyncStatus(data.sync_status)
              setSyncedAt(data.synced_at)
            }).catch(() => { if (alive) setSyncStatus('synced') })
            return
          }
          if (job.status === 'aligning_words' && job.segments_total) {
            setSyncMessage(`Sincronizando... ${job.segments_done ?? 0}/${job.segments_total} trechos`)
          } else {
            setSyncMessage(job.status === 'aligning_words' ? 'Sincronizando palavras...' : 'Analisando áudio...')
          }
          timeoutId = window.setTimeout(poll, 1500)
        })
        .catch((err: any) => {
          if (!alive) return
          setSyncStatus('error')
          setSyncMessage(null)
          setSyncError(err?.response?.data?.detail || err?.message || 'Falha ao consultar sincronização')
          setSyncJobId(null)
        })
    }
    timeoutId = window.setTimeout(poll, 800)
    return () => { alive = false; if (timeoutId) window.clearTimeout(timeoutId) }
  }, [syncJobId, projectId, clipId])

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

  // O evento nativo "timeupdate" do <video> dispara em intervalos grosseiros (~250ms,
  // varia por navegador) — granularidade insuficiente pra o destaque de palavra do karaokê,
  // que pode ficar visivelmente atrasado/adiantado em relação à fala mesmo com os
  // timestamps do backend corretos. Enquanto o vídeo está tocando, faz o polling de
  // currentTime a cada frame (rAF, ~60fps) em vez de depender só do timeupdate.
  useEffect(() => {
    if (!isPlaying) return
    let rafId: number
    const tick = () => {
      const v = videoRef.current
      if (v) setCurrentTime(v.currentTime)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

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
            hasSegments={displaySegments.length > 0}
            style={editorState.subtitle.style}
            position={editorState.subtitle.position}
            onApplyPreset={handleApplySubtitlePreset}
            onStyleChange={handleSubtitleStyleChange}
            onOutlineChange={handleSubtitleOutlineChange}
            onPositionPreset={handleSubtitlePositionPreset}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            syncError={syncError}
            syncedAt={syncedAt}
            onStartSync={handleStartSync}
            wordsPerCaption={editorState.subtitle.wordsPerCaption}
            onWordsPerCaptionChange={handleWordsPerCaptionChange}
          />
        </aside>

        <main className="ac-editor-main">
          <EditorCanvas
            videoUrl={videoUrl}
            format={editorState.canvas.format}
            background={editorState.canvas.background}
            transform={editorState.videoLayer.transform}
            currentTime={currentTime}
            subtitleSegments={displaySegments}
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
            subtitleSegments={displaySegments}
            selectedSubtitleId={editorState.subtitle.selectedSegmentId}
            onSelectSubtitle={handleSelectSubtitleSegment}
          />
        </main>

        <aside className="ac-editor-panel ac-editor-panel--right">
          <div className="ac-editor-panel-section">
            <div className="ac-editor-panel-label">Camadas</div>
            <div className="ac-editor-layer-item">🎥 Vídeo original</div>
            {displaySegments.length > 0 && <div className="ac-editor-layer-item">💬 Legenda</div>}
          </div>
        </aside>
      </div>
    </div>
  )
}

export default ClipEditorPage
