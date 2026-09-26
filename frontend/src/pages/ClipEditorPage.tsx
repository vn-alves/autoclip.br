import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { projectApi, ClipDetail, SubtitleSegment, SubtitleWord, SubtitleSyncStatus } from '../services/api'
import { Btn, Icon, Segmented } from '../ui'
import EditorCanvas from '../components/editor/EditorCanvas'
import EditorTimeline from '../components/editor/EditorTimeline'
import SubtitleControls from '../components/editor/SubtitleControls'
import LayerPanel from '../components/editor/LayerPanel'
import LayersTimeline from '../components/editor/LayersTimeline'
import {
  BackgroundType, CanvasFormat, EditorState, NormalizedTransform,
  SubtitlePosition, SubtitlePositionPreset, SubtitleStyle, SubtitleStylePreset, SubtitleWordsPerCaption,
  SubtitleTransition, WordHighlight,
  createDefaultEditorState, createVideoLayerFromFile, fitTransform, resizeTransformForFormat, SUBTITLE_POSITION_PRESETS,
  groupWordsIntoSegments, toEditConfig, applyEditConfig, hasUnuploadedLayers, isDegenerateTransform,
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
  // A layer principal também é o "relógio" global do Editor (currentTime/duration/play) — as
  // demais layers só seguem esse tempo, nunca têm player próprio (item 15).
  const mainVideoRef = useRef<HTMLVideoElement>(null)

  const [clip, setClip] = useState<ClipDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const mainVideoUrl = projectId && clipId ? projectApi.getClipVideoUrl(projectId, clipId) : ''
  const [editorState, setEditorState] = useState<EditorState>(() => createDefaultEditorState(mainVideoUrl))
  // Aspect ratio real de cada layer (só disponível depois do onLoadedMetadata) e quais delas já
  // tiveram o enquadramento ajustado manualmente pelo usuário — trocar o formato do Canvas só
  // recalcula automaticamente o fit das layers que o usuário ainda não mexeu (mesmo espírito do
  // hasCustomTransform da Etapa 1, agora por layer).
  const videoRatiosRef = useRef<Record<string, number>>({})
  // "Customizada" (usuário arrastou/redimensionou manualmente) agora é um campo PERSISTIDO em
  // VideoLayer.customized, não um Set em memória à parte — era exatamente essa separação que
  // causava o bug de "reabrir a edição salva trava pra sempre no enquadramento antigo": o
  // efeito de carregar do backend marcava TODA layer restaurada como customizada, então o
  // fitMode='cover' novo nunca tinha chance de recalcular o transform salvo (contain antigo,
  // com borda preta). Ver types.ts VideoLayer.customized/applyEditConfig.
  // Arquivo original de cada layer secundária (item 8 da Stage 4) — só existe em memória
  // nesta aba/sessão; é o que handleSaveEditorConfig envia ao backend no upload real. Se a
  // página for recarregada antes de salvar, a layer perde o arquivo e precisa ser re-adicionada
  // (o object URL sozinho não é suficiente para o backend renderizar).
  const pendingFilesRef = useRef<Record<string, File>>({})

  // Persistência real da edição (Stage 4) — separada do rascunho "palavras por legenda" em
  // localStorage (que continua existindo só como fallback antes da primeira config salva).
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [exportState, setExportState] = useState<'idle' | 'saving' | 'queued' | 'processing' | 'completed' | 'failed'>('idle')
  const [exportError, setExportError] = useState<string | null>(null)
  const [exportProgress, setExportProgress] = useState(0)
  const [exportJobId, setExportJobId] = useState<string | null>(null)
  const [exportResult, setExportResult] = useState<{ width?: number; height?: number; duration_sec?: number } | null>(null)

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  // Erro visível do upload de vídeo secundário (item 5/6 da estabilização) — antes uma falha
  // aqui (arquivo inválido, createObjectURL indisponível etc.) não tinha nenhum retorno pro
  // usuário, parecendo que o botão simplesmente não fazia nada.
  const [layerUploadError, setLayerUploadError] = useState<string | null>(null)

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

  // Carrega a edição salva no backend (Stage 4), se houver — sobrescreve o default local E a
  // preferência de localStorage acima (o backend é a fonte de verdade a partir de agora; o
  // localStorage só existia como rascunho antes de existir persistência real). Layers
  // secundárias restauradas apontam para o endpoint que serve o asset já enviado (o object URL
  // da sessão de upload original não sobrevive a um reload). `customized` de cada layer vem do
  // que foi de fato persistido (applyEditConfig) — NÃO forçamos mais todo mundo pra `true` aqui
  // (isso travava pra sempre o enquadramento salvo, ignorando fitMode/cover daí em diante).
  useEffect(() => {
    if (!clipId || !mainVideoUrl) return
    let alive = true
    projectApi.getClipEditorConfig(clipId)
      .then(({ edit_config }) => {
        if (!alive || !edit_config) return
        const restored = applyEditConfig(edit_config, mainVideoUrl, (assetId) => projectApi.getEditorAssetUrl(clipId, assetId))
        // Bug real: transform salvo antes do sistema fitMode existir podia ficar totalmente fora
        // do canvas (ex.: vídeo principal invisível em 9:16 até o usuário mexer manualmente no
        // enquadramento) — customized:true travava esse valor ruim pra sempre, já que só um
        // toggle manual de fitMode (handleSetFitMode) recalcula sem checar customized. Aqui
        // saneia qualquer layer com transform degenerado, ignorando customized: nunca é uma
        // customização real (o usuário via o preview enquanto ajustava), só dado corrompido.
        const state = {
          ...restored,
          layers: restored.layers.map((l) => {
            if (!isDegenerateTransform(l.transform)) return l
            const ratio = videoRatiosRef.current[l.id]
            return ratio
              ? { ...l, customized: false, transform: fitLayerTransform(restored.canvas.format, ratio, l.isMain, l.fitMode) }
              : { ...l, customized: false }
          }),
        }
        setEditorState(state)
        setSaveState('saved')
      })
      .catch(() => {
        // Sem edição salva ainda (404/erro) — não é fatal, segue com o estado local padrão.
      })
    return () => { alive = false }
  }, [clipId, mainVideoUrl])

  // Blocos de legenda exibidos no Editor: reagrupa a lista de palavras — real (pós-sincronização
  // com IA) ou a estimativa linear que já vem pronta do backend quando ainda não sincronizado —
  // conforme a config de "palavras por legenda". Operação 100% local, sem chamar IA e sem tocar
  // nos timestamps de cada palavra. Antes disso só funcionava com o clip já sincronizado; agora
  // funciona sempre que houver QUALQUER dado em granularidade de palavra, sincronizado ou não —
  // sem isso "palavras por legenda" parecia não fazer nada em cortes ainda não sincronizados.
  const flatSubtitleWords = useMemo(() => {
    if (syncStatus === 'synced' && subtitleWords.length > 0) return subtitleWords
    return subtitleSegments.flatMap((seg) => seg.words)
  }, [syncStatus, subtitleWords, subtitleSegments])

  const displaySegments = useMemo(() => {
    if (flatSubtitleWords.length === 0) return subtitleSegments
    return groupWordsIntoSegments(flatSubtitleWords, editorState.subtitle.wordsPerCaption)
  }, [flatSubtitleWords, subtitleSegments, editorState.subtitle.wordsPerCaption])

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

  // Enquadra a layer no formato atual do Canvas, preservando a proporção real do vídeo dela
  // (nunca deforma — ver fitTransform) segundo o fitMode da própria layer ('cover' por
  // padrão, nunca deixa borda preta). Layers secundárias começam num box menor (50%)
  // centralizado, pra não cobrir o vídeo principal inteiro por padrão quando adicionadas — o
  // corte de "cover" acontece DENTRO desse box menor, não no Canvas inteiro.
  const fitLayerTransform = (format: CanvasFormat, ratio: number, isMain: boolean, fitMode: 'contain' | 'cover'): NormalizedTransform => {
    const full = fitTransform(format, ratio, fitMode)
    if (isMain) return full
    const scale = 0.5
    const width = full.width * scale
    const height = full.height * scale
    return { x: (1 - width) / 2, y: (1 - height) / 2, width, height, rotation: 0 }
  }

  const handleLayerLoadedMetadata = (layerId: string, videoWidth: number, videoHeight: number) => {
    if (!videoWidth || !videoHeight) return
    const ratio = videoWidth / videoHeight
    videoRatiosRef.current[layerId] = ratio
    setEditorState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layerId && !l.customized
        ? { ...l, transform: fitLayerTransform(s.canvas.format, ratio, l.isMain, l.fitMode) }
        : l)),
    }))
  }

  const handleFormatChange = (format: CanvasFormat) => {
    setEditorState((s) => ({
      ...s,
      canvas: { ...s.canvas, format },
      layers: s.layers.map((l) => {
        const ratio = videoRatiosRef.current[l.id]
        if (!ratio) return l
        const nextTransform = l.customized
          ? resizeTransformForFormat(l.transform, s.canvas.format, format, ratio)
          : fitLayerTransform(format, ratio, l.isMain, l.fitMode)
        return { ...l, transform: nextTransform }
      }),
    }))
  }

  const handleLayerTransformChange = (layerId: string, t: NormalizedTransform) => {
    setEditorState((s) => ({ ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, transform: t, customized: true } : l)) }))
  }

  // Alterna Cover/Contain (item 2) — recalcula o transform NA HORA a partir da proporção real
  // do vídeo (nunca estica: ver fitTransform). Deliberadamente NÃO marca como customizada:
  // trocar o modo é uma preferência persistente da layer, não um ajuste manual pontual — trocar
  // o formato do Canvas depois continua respeitando o modo escolhido (ver handleFormatChange).
  // Um drag/resize manual posterior (handleLayerTransformChange) continua marcando customizada
  // normalmente, sem relação com isto.
  const handleSetFitMode = (layerId: string, fitMode: 'contain' | 'cover') => {
    setEditorState((s) => ({
      ...s,
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l
        const ratio = videoRatiosRef.current[l.id]
        const transform = ratio ? fitLayerTransform(s.canvas.format, ratio, l.isMain, fitMode) : l.transform
        return { ...l, fitMode, transform }
      }),
    }))
  }

  const handleSelectLayer = (layerId: string | null) => {
    setEditorState((s) => ({ ...s, selectedLayerId: layerId }))
  }

  const handleToggleLayerVisible = (layerId: string) => {
    setEditorState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l)),
    }))
  }

  const handleRenameLayer = (layerId: string, name: string) => {
    setEditorState((s) => ({ ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, name } : l)) }))
  }

  // Troca o zIndex com o vizinho imediatamente acima/abaixo (ordenados por zIndex) — reordenar
  // nunca remonta os elementos <video>, só muda um número (ver EditorCanvas).
  const swapZIndexWithNeighbor = (layerId: string, direction: 'up' | 'down') => {
    setEditorState((s) => {
      const ordered = [...s.layers].sort((a, b) => b.zIndex - a.zIndex) // topo primeiro
      const idx = ordered.findIndex((l) => l.id === layerId)
      const neighborIdx = direction === 'up' ? idx - 1 : idx + 1
      if (idx < 0 || neighborIdx < 0 || neighborIdx >= ordered.length) return s
      const a = ordered[idx]
      const b = ordered[neighborIdx]
      const zA = a.zIndex
      const zB = b.zIndex
      return {
        ...s,
        layers: s.layers.map((l) => {
          if (l.id === a.id) return { ...l, zIndex: zB }
          if (l.id === b.id) return { ...l, zIndex: zA }
          return l
        }),
      }
    })
  }
  const handleMoveLayerUp = (layerId: string) => swapZIndexWithNeighbor(layerId, 'up')
  const handleMoveLayerDown = (layerId: string) => swapZIndexWithNeighbor(layerId, 'down')

  const handleRemoveLayer = (layerId: string) => {
    setEditorState((s) => {
      const layer = s.layers.find((l) => l.id === layerId)
      if (!layer || layer.isMain) return s
      URL.revokeObjectURL(layer.source)
      return {
        ...s,
        layers: s.layers.filter((l) => l.id !== layerId),
        selectedLayerId: s.selectedLayerId === layerId ? null : s.selectedLayerId,
      }
    })
    delete videoRatiosRef.current[layerId]
    delete pendingFilesRef.current[layerId]
  }

  const handleLayerTimeRangeChange = (layerId: string, startTime: number, endTime: number) => {
    setEditorState((s) => ({
      ...s,
      layers: s.layers.map((l) => (l.id === layerId ? { ...l, startTime, endTime: Math.max(endTime, startTime + 0.1) } : l)),
    }))
  }

  // "+ Adicionar vídeo" (item 4) — upload puramente local (object URL), sem tocar o backend;
  // a layer entra ativa no intervalo inteiro do corte por padrão, ajustável depois no painel.
  // Qualquer falha (arquivo não é vídeo, createObjectURL indisponível etc.) fica visível em
  // layerUploadError em vez de silenciosamente não fazer nada.
  const handleAddVideoFiles = (files: FileList) => {
    setLayerUploadError(null)
    const accepted: File[] = []
    const rejected: string[] = []
    for (const file of Array.from(files)) {
      if (file.type && !file.type.startsWith('video/')) {
        rejected.push(file.name)
      } else {
        accepted.push(file)
      }
    }
    if (rejected.length > 0) {
      setLayerUploadError(`Arquivo não é um vídeo suportado (mp4/webm/mov): ${rejected.join(', ')}`)
    }
    if (accepted.length === 0) return

    try {
      setEditorState((s) => {
        let nextLayers = s.layers
        let lastId: string | null = null
        for (const file of accepted) {
          const layer = createVideoLayerFromFile(file, nextLayers, duration)
          pendingFilesRef.current[layer.id] = file
          nextLayers = [...nextLayers, layer]
          lastId = layer.id
        }
        setSaveState('idle')
        return { ...s, layers: nextLayers, selectedLayerId: lastId ?? s.selectedLayerId }
      })
    } catch (err: any) {
      console.error('Falha ao adicionar vídeo à layer:', err)
      setLayerUploadError(err?.message || 'Não foi possível carregar esse vídeo.')
    }
  }

  const handleBackgroundType = (type: BackgroundType) => {
    setEditorState((s) => ({ ...s, canvas: { ...s.canvas, background: { ...s.canvas.background, type } } }))
  }

  const handleBackgroundColor = (color: string) => {
    setEditorState((s) => ({ ...s, canvas: { ...s.canvas, background: { ...s.canvas.background, color } } }))
  }

  // Etapa 4.2: cada preset é um COMBO (estilo + transição + destaque, item 3/12) — aplica os
  // três de uma vez. `id: preset.id` marca o preset como "aplicado"; qualquer edição manual
  // depois disso (handleSubtitleStyleChange etc.) marca como 'custom' sem desfazer o resto.
  const handleApplySubtitlePreset = (preset: SubtitleStylePreset) => {
    setEditorState((s) => ({
      ...s,
      subtitle: {
        ...s.subtitle,
        style: { ...s.subtitle.style, ...preset.style, id: preset.id },
        transition: { ...s.subtitle.transition, ...preset.transition },
        wordHighlight: { ...s.subtitle.wordHighlight, ...preset.wordHighlight },
      },
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

  const handleSubtitleTransitionChange = (patch: Partial<SubtitleTransition>) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, transition: { ...s.subtitle.transition, ...patch }, style: { ...s.subtitle.style, id: 'custom' } },
    }))
  }

  const handleWordHighlightChange = (patch: Partial<WordHighlight>) => {
    setEditorState((s) => ({
      ...s,
      subtitle: { ...s.subtitle, wordHighlight: { ...s.subtitle.wordHighlight, ...patch }, style: { ...s.subtitle.style, id: 'custom' } },
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

  const handleToggleSubtitleVisible = () => {
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, visible: !s.subtitle.visible } }))
  }

  // Clicar num bloco da timeline de legendas: seleciona (destaque visual) e move o playhead
  // para o início do segmento, como pedido no item 2 da Etapa 2.
  const handleSelectSubtitleSegment = (segment: SubtitleSegment) => {
    setEditorState((s) => ({ ...s, subtitle: { ...s.subtitle, selectedSegmentId: segment.id } }))
    handleSeek(segment.startTime)
  }

  // Único player "de verdade" é a layer principal (item 15) — play/pause/seek/currentTime
  // sempre agem nela; as layers secundárias só seguem esse relógio (ver useEffect em
  // EditorCanvas que sincroniza currentTime/isPlaying com cada <video> secundário).
  const togglePlay = () => {
    const v = mainVideoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
  }

  const handleSeek = (t: number) => {
    const v = mainVideoRef.current
    setCurrentTime(t)
    if (v) v.currentTime = Math.min(Math.max(0, t), v.duration || t)
  }

  const handleTimeUpdate = () => {
    const v = mainVideoRef.current
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
      const v = mainVideoRef.current
      if (v) setCurrentTime(v.currentTime)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [isPlaying])

  // Salva a edição no backend (seção 7): faz upload de qualquer layer secundária ainda sem
  // assetId (item 8) antes de gravar o edit_config — nunca salva um assetId inexistente.
  // Retorna false em caso de erro (uso interno de handleExport, que precisa saber se pode
  // seguir para o render ou deve parar ali).
  const handleSaveEditorConfig = async (): Promise<boolean> => {
    if (!clipId) return false
    setSaveState('saving')
    setSaveError(null)
    try {
      let state = editorState
      for (const layer of state.layers) {
        if (layer.isMain || layer.assetId) continue
        const file = pendingFilesRef.current[layer.id]
        if (!file) {
          throw new Error(`O vídeo "${layer.name}" não pode ser salvo: o arquivo original não está mais disponível nesta sessão (recarregou a página?). Remova essa layer e adicione o vídeo de novo.`)
        }
        const { asset_id } = await projectApi.uploadEditorAsset(clipId, file)
        state = { ...state, layers: state.layers.map((l) => (l.id === layer.id ? { ...l, assetId: asset_id } : l)) }
      }
      if (state !== editorState) setEditorState(state)
      await projectApi.saveClipEditorConfig(clipId, toEditConfig(state))
      setSaveState('saved')
      return true
    } catch (err: any) {
      setSaveState('error')
      setSaveError(err?.response?.data?.detail || err?.message || 'Não foi possível salvar a edição')
      return false
    }
  }

  // "Exportar vídeo" (seção 25): 1) valida, 2) salva a edição, 3) inicia o render, 4) mostra
  // o estado de processamento — o polling do job abaixo assume o resto.
  const handleExport = async () => {
    if (!clipId) return
    if (exportState === 'saving' || exportState === 'queued' || exportState === 'processing') return
    setExportError(null)
    setExportResult(null)
    setExportProgress(0)
    setExportState('saving')
    const saved = await handleSaveEditorConfig()
    if (!saved) {
      setExportState('failed')
      setExportError(saveError || 'Não foi possível salvar a edição antes de exportar')
      return
    }
    setExportState('queued')
    try {
      const res = await projectApi.startClipEditorRender(clipId)
      setExportJobId(res.job_id)
    } catch (err: any) {
      setExportState('failed')
      setExportError(err?.response?.data?.detail || err?.message || 'Não foi possível iniciar a exportação')
    }
  }

  const handleDownloadExport = () => {
    if (!clipId || !exportJobId) return
    projectApi.downloadClipEditorRender(clipId, exportJobId).catch((err: any) => {
      setExportError(err?.response?.data?.detail || err?.message || 'Falha ao baixar o vídeo exportado')
    })
  }

  // Polling do job de render — só existe enquanto exportJobId estiver setado (disparado só
  // por handleExport, nunca automático). Não zera exportJobId ao concluir/falhar: é o que
  // handleDownloadExport usa para montar a URL de download.
  useEffect(() => {
    if (!exportJobId || !clipId) return
    let alive = true
    let timeoutId: number | undefined

    const poll = () => {
      projectApi.getClipEditorRenderJob(clipId, exportJobId)
        .then((job) => {
          if (!alive) return
          setExportProgress(job.progress ?? 0)
          if (job.status === 'failed') {
            setExportState('failed')
            setExportError(job.error || 'Falha ao exportar o vídeo')
            return
          }
          if (job.status === 'completed') {
            setExportState('completed')
            setExportResult(job.result || null)
            return
          }
          setExportState(job.status)
          timeoutId = window.setTimeout(poll, 1500)
        })
        .catch((err: any) => {
          if (!alive) return
          setExportState('failed')
          setExportError(err?.response?.data?.detail || err?.message || 'Falha ao consultar a exportação')
        })
    }
    timeoutId = window.setTimeout(poll, 800)
    return () => { alive = false; if (timeoutId) window.clearTimeout(timeoutId) }
  }, [exportJobId, clipId])

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
        <div className="ac-editor-header-actions">
          {hasUnuploadedLayers(editorState.layers) && (
            <span className="ac-editor-save-error">Há vídeo(s) ainda não enviado(s) — será enviado ao salvar/exportar.</span>
          )}
          {saveError && exportState === 'idle' && <span className="ac-editor-save-error">{saveError}</span>}
          <span className="ac-editor-badge">
            {saveState === 'saving' && 'Salvando...'}
            {saveState === 'saved' && 'Edição salva'}
            {saveState === 'error' && 'Erro ao salvar'}
            {saveState === 'idle' && 'Alterações não salvas'}
          </span>
          <Btn variant="text" onClick={handleSaveEditorConfig} disabled={saveState === 'saving'}>
            Salvar
          </Btn>
          {exportState === 'idle' || exportState === 'failed' ? (
            <Btn onClick={handleExport}>Exportar vídeo</Btn>
          ) : exportState === 'completed' ? (
            <>
              <span className="ac-editor-export-progress">
                Exportação concluída{exportResult ? ` · ${exportResult.width}x${exportResult.height}` : ''}
              </span>
              <Btn onClick={handleDownloadExport}>Baixar vídeo</Btn>
              <Btn variant="text" onClick={() => setExportState('idle')}>Exportar de novo</Btn>
            </>
          ) : (
            <span className="ac-editor-export-progress">
              {exportState === 'saving' && 'Salvando edição...'}
              {exportState === 'queued' && 'Na fila para renderizar...'}
              {exportState === 'processing' && `Renderizando... ${exportProgress}%`}
            </span>
          )}
          {exportState === 'failed' && exportError && <span className="ac-editor-save-error">{exportError}</span>}
        </div>
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
            transition={editorState.subtitle.transition}
            onTransitionChange={handleSubtitleTransitionChange}
            wordHighlight={editorState.subtitle.wordHighlight}
            onWordHighlightChange={handleWordHighlightChange}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            syncError={syncError}
            syncedAt={syncedAt}
            onStartSync={handleStartSync}
            wordsPerCaption={editorState.subtitle.wordsPerCaption}
            onWordsPerCaptionChange={handleWordsPerCaptionChange}
            visible={editorState.subtitle.visible}
            onToggleVisible={handleToggleSubtitleVisible}
          />
        </aside>

        <main className="ac-editor-main">
          <EditorCanvas
            format={editorState.canvas.format}
            background={editorState.canvas.background}
            layers={editorState.layers}
            selectedLayerId={editorState.selectedLayerId}
            onSelectLayer={handleSelectLayer}
            onLayerTransformChange={handleLayerTransformChange}
            onLayerLoadedMetadata={handleLayerLoadedMetadata}
            mainVideoRef={mainVideoRef}
            onMainTimeUpdate={handleTimeUpdate}
            onMainDurationChange={setDuration}
            onMainEnded={() => setIsPlaying(false)}
            onMainPlayStateChange={setIsPlaying}
            currentTime={currentTime}
            isPlaying={isPlaying}
            subtitleSegments={displaySegments}
            subtitleStyle={editorState.subtitle.style}
            subtitlePosition={editorState.subtitle.position}
            subtitleTransition={editorState.subtitle.transition}
            wordHighlight={editorState.subtitle.wordHighlight}
            subtitleVisible={editorState.subtitle.visible}
            onSubtitlePositionChange={handleSubtitlePositionChange}
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

          <LayersTimeline
            layers={editorState.layers}
            duration={duration}
            selectedLayerId={editorState.selectedLayerId}
            onSelect={handleSelectLayer}
          />
        </main>

        <aside className="ac-editor-panel ac-editor-panel--right">
          <LayerPanel
            layers={editorState.layers}
            selectedLayerId={editorState.selectedLayerId}
            duration={duration}
            onSelect={handleSelectLayer}
            onToggleVisible={handleToggleLayerVisible}
            onRename={handleRenameLayer}
            onMoveUp={handleMoveLayerUp}
            onMoveDown={handleMoveLayerDown}
            onRemove={handleRemoveLayer}
            onTimeRangeChange={handleLayerTimeRangeChange}
            onAddFiles={handleAddVideoFiles}
            onSetFitMode={handleSetFitMode}
            uploadError={layerUploadError}
          />
          {displaySegments.length > 0 && (
            <div className="ac-editor-panel-section">
              <div className="ac-editor-panel-label">Legenda</div>
              <div className="ac-editor-layer-item"><Icon.Chat size={13} /> Legenda</div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default ClipEditorPage
