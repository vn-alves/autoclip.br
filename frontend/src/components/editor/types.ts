/**
 * Estado do Editor de Corte — ETAPA 1 (fundação) + ETAPA 2 (legendas).
 *
 * Só existe em memória (React state) nesta etapa; não é persistido no
 * backend. A forma já é pensada para crescer nas próximas etapas
 * (múltiplas layers, legendas, render spec) sem precisar reescrever o
 * que já existe — ver docs/EDITOR_SPEC.md.
 */

import type { SubtitleSegment, SubtitleWord, SubtitleSyncStatus } from '../../services/api'

export type { SubtitleSegment, SubtitleWord, SubtitleSyncStatus }

export type CanvasFormat = '9:16' | '16:9' | '1:1'

/** Resolução lógica de referência por formato — não depende do tamanho físico do preview na tela. */
export const CANVAS_DIMENSIONS: Record<CanvasFormat, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '16:9': { width: 1920, height: 1080 },
  '1:1': { width: 1080, height: 1080 },
}

export const canvasRatio = (format: CanvasFormat): number => {
  const { width, height } = CANVAS_DIMENSIONS[format]
  return width / height
}

/**
 * Posição/tamanho normalizados (0..1) relativos ao canvas — nunca em pixels
 * físicos do preview, para que redimensionar a janela não destrua o
 * posicionamento (ver EDITOR_SPEC.md seção 8).
 */
export interface NormalizedTransform {
  x: number
  y: number
  width: number
  height: number
  rotation: number
}

export type BackgroundType = 'blur' | 'color'

export interface BackgroundConfig {
  type: BackgroundType
  color: string
  blurAmount: number
}

export const DEFAULT_BACKGROUND: BackgroundConfig = { type: 'blur', color: '#000000', blurAmount: 36 }

/* ------------------------------------------------------------------ Layers de vídeo (Etapa 3) --- */

/**
 * Uma camada de vídeo no Canvas. A layer principal (`isMain: true`) é sempre a primeira,
 * corresponde ao corte original e não pode ser removida nem ter o `source` trocado — seu
 * `startTime`/`endTime` cobrem o corte inteiro (Infinity = "sempre ativa", já que sua própria
 * duração natural do arquivo já delimita quando ela para de tocar). Layers secundárias são
 * vídeos adicionados localmente pelo usuário (upload), com uma janela de tempo própria dentro
 * do currentTime global do Editor — ver findActiveLayers().
 */
export interface VideoLayer {
  id: string
  type: 'video'
  name: string
  /** URL do vídeo (endpoint do clip para a layer principal; object URL de upload local para as demais). */
  source: string
  visible: boolean
  transform: NormalizedTransform
  /** Maior = mais acima na composição visual. */
  zIndex: number
  /** Janela [startTime, endTime] no relógio global do Editor em que esta layer aparece. */
  startTime: number
  endTime: number
  isMain: boolean
  /**
   * Referência do backend para o arquivo desta layer secundária (Stage 4) — preenchida só
   * depois do upload real do vídeo (ver ClipEditorPage.handleSaveEditorConfig). `source`
   * continua sendo um object URL válido só NESTA sessão do navegador; `assetId` é o que
   * sobrevive a salvar/recarregar/renderizar. undefined na layer principal (ela nunca é um
   * asset do Editor, é o próprio vídeo do corte) e em layers ainda não enviadas ao backend.
   */
  assetId?: string
}

export const createMainVideoLayer = (source: string): VideoLayer => ({
  id: 'main', type: 'video', name: 'Vídeo principal', source, visible: true,
  transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  zIndex: 0, startTime: 0, endTime: Number.POSITIVE_INFINITY, isMain: true,
})

let secondaryLayerCounter = 0

/** Nova layer secundária a partir de um arquivo local (item 4) — ainda sem `transform` ajustado
 * ao aspect ratio real do vídeo (isso só é conhecido depois do onLoadedMetadata, ver
 * EditorCanvas); usa um enquadramento central razoável como ponto de partida. */
export function createVideoLayerFromFile(file: File, existingLayers: VideoLayer[], duration: number): VideoLayer {
  secondaryLayerCounter += 1
  const nextIndex = existingLayers.length + 1
  const maxZ = existingLayers.reduce((m, l) => Math.max(m, l.zIndex), 0)
  return {
    id: `layer-${Date.now()}-${secondaryLayerCounter}`,
    type: 'video',
    name: `Vídeo ${nextIndex}`,
    source: URL.createObjectURL(file),
    visible: true,
    transform: { x: 0.15, y: 0.15, width: 0.5, height: 0.5, rotation: 0 },
    zIndex: maxZ + 1,
    startTime: 0,
    endTime: duration > 0 ? duration : Number.POSITIVE_INFINITY,
    isMain: false,
  }
}

/** Layers visíveis cujo intervalo [startTime, endTime] contém currentTime (item 13) — a
 * principal, com endTime=Infinity, está sempre incluída enquanto visível. */
export function findActiveLayers(layers: VideoLayer[], currentTime: number): VideoLayer[] {
  return layers.filter((l) => l.visible && currentTime >= l.startTime && currentTime <= l.endTime)
}

/* ---------------------------------------------------------------- Legendas (Etapa 2) --- */

export type SubtitlePositionPreset = 'top' | 'center' | 'bottom' | 'custom'

/** Igual a NormalizedTransform em espírito (0..1 relativo ao canvas), mas sem altura —
 * a caixa de legenda tem altura automática (definida pelo texto), nunca esticada. */
export interface SubtitlePosition {
  preset: SubtitlePositionPreset
  x: number
  y: number
  width: number
}

export const SUBTITLE_POSITION_PRESETS: Record<Exclude<SubtitlePositionPreset, 'custom'>, Omit<SubtitlePosition, 'preset'>> = {
  top: { x: 0.07, y: 0.06, width: 0.86 },
  center: { x: 0.07, y: 0.46, width: 0.86 },
  bottom: { x: 0.07, y: 0.78, width: 0.86 },
}

export type SubtitleAnimation = 'none' | 'karaoke' | 'pop_in'

export interface SubtitleOutline {
  enabled: boolean
  color: string
  width: number
}

export interface SubtitleStyle {
  /** id do preset aplicado por último (ver SUBTITLE_STYLE_PRESETS), ou 'custom' após qualquer edição manual. */
  id: string
  fontFamily: string
  /** px, relativo à resolução lógica do canvas (CANVAS_DIMENSIONS) — escalado na hora de renderizar. */
  fontSize: number
  fontWeight: 400 | 500 | 600 | 700 | 800
  color: string
  highlightColor: string
  outline: SubtitleOutline
  animation: SubtitleAnimation
}

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  id: 'white-outline',
  fontFamily: "Inter, 'Noto Sans SC', system-ui, sans-serif",
  fontSize: 46,
  fontWeight: 700,
  color: '#FFFFFF',
  highlightColor: '#2D6BFF',
  outline: { enabled: true, color: '#000000', width: 2 },
  animation: 'none',
}

export const DEFAULT_SUBTITLE_POSITION: SubtitlePosition = { preset: 'bottom', ...SUBTITLE_POSITION_PRESETS.bottom }

export interface SubtitleStylePreset {
  id: string
  label: string
  /** aplicado por cima de DEFAULT_SUBTITLE_STYLE (merge raso; outline é substituído por inteiro quando presente). */
  style: Partial<Omit<SubtitleStyle, 'id'>>
}

/** Base pequena e fácil de expandir — cada card é só um objeto novo nesta lista. */
export const SUBTITLE_STYLE_PRESETS: SubtitleStylePreset[] = [
  {
    id: 'white-outline',
    label: 'Branco + contorno',
    style: { color: '#FFFFFF', outline: { enabled: true, color: '#000000', width: 2 }, fontWeight: 700, animation: 'none' },
  },
  {
    id: 'yellow-black',
    label: 'Amarelo + preto',
    style: { color: '#FFE14D', outline: { enabled: true, color: '#000000', width: 3 }, fontWeight: 700, animation: 'none' },
  },
  {
    id: 'big-text',
    label: 'Texto grande',
    style: { fontSize: 64, color: '#FFFFFF', outline: { enabled: true, color: '#000000', width: 2 }, fontWeight: 700, animation: 'none' },
  },
  {
    id: 'bold',
    label: 'Texto bold',
    style: { color: '#FFFFFF', fontWeight: 800, outline: { enabled: false, color: '#000000', width: 2 }, animation: 'none' },
  },
  {
    id: 'karaoke',
    label: 'Karaokê',
    style: { color: '#FFFFFF', highlightColor: '#2D6BFF', outline: { enabled: true, color: '#000000', width: 2 }, fontWeight: 700, animation: 'karaoke' },
  },
]

/** Sombra em 8 direções — aproxima um contorno uniforme ao redor do texto (mais suave que -webkit-text-stroke sozinho). */
export function subtitleOutlineShadow(outline: SubtitleOutline): string {
  if (!outline.enabled || outline.width <= 0) return 'none'
  const w = outline.width
  const offsets: [number, number][] = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]
  return offsets.map(([dx, dy]) => `${dx * w}px ${dy * w}px 0 ${outline.color}`).join(', ')
}

/** O segmento cujo intervalo [startTime, endTime] contém currentTime, ou null fora de qualquer legenda. */
export function findActiveSegment(segments: SubtitleSegment[], currentTime: number): SubtitleSegment | null {
  for (const seg of segments) {
    if (currentTime >= seg.startTime && currentTime <= seg.endTime) return seg
  }
  return null
}

/** A palavra ativa dentro do segmento (para o destaque karaokê), usando os timestamps já fornecidos pelo backend. */
export function findActiveWord(segment: SubtitleSegment, currentTime: number): SubtitleWord | null {
  for (const w of segment.words) {
    if (currentTime >= w.startTime && currentTime <= w.endTime) return w
  }
  return null
}

/* ------------------------------------------------------ Sincronização precisa (Etapa 2 — evolução) --- */

/** 'auto' deixa o sistema escolher a quantidade por bloco (pausas/pontuação/tamanho); os demais valores
 * são um TETO aproximado de palavras por legenda — não uma regra cega: uma pausa natural clara entre
 * palavras fecha o bloco mais cedo mesmo sem atingir o teto (ver groupWordsIntoSegments). Reagrupar
 * NUNCA chama IA — é só reparticionar a mesma lista de palavras já sincronizada, por isso é instantâneo. */
export type SubtitleWordsPerCaption = 'auto' | 5 | 10 | 15 | 20 | 25 | 30

export const WORDS_PER_CAPTION_OPTIONS: { value: SubtitleWordsPerCaption; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 5, label: '5 palavras' },
  { value: 10, label: '10 palavras' },
  { value: 15, label: '15 palavras' },
  { value: 20, label: '20 palavras' },
  { value: 25, label: '25 palavras' },
  { value: 30, label: '30 palavras' },
]

const AUTO_MAX_WORDS = 8
const AUTO_MAX_CHARS = 42
// Pausa entre o fim de uma palavra e o início da próxima que conta como corte natural de frase —
// vale pra TODOS os modos (auto e contagem fixa): o teto de palavras é só um limite superior,
// uma pausa clara sempre fecha o bloco antes disso (item 4 do pedido de "palavras por legenda").
const NATURAL_PAUSE_GAP_SECONDS = 0.6
const SENTENCE_END_RE = /[.!?;]$/

/**
 * Reagrupa uma lista "achatada" de palavras (já com timestamps reais, sincronizados
 * uma única vez com IA) em blocos de legenda — puramente local, sem tocar nos
 * timestamps individuais de cada palavra (item 7/13 da tarefa de sincronização).
 */
export function groupWordsIntoSegments(words: SubtitleWord[], mode: SubtitleWordsPerCaption): SubtitleSegment[] {
  if (words.length === 0) return []

  const maxWords = mode === 'auto' ? AUTO_MAX_WORDS : mode
  const groups: SubtitleWord[][] = []
  let current: SubtitleWord[] = []
  let currentChars = 0

  const flush = () => {
    if (current.length > 0) {
      groups.push(current)
      current = []
      currentChars = 0
    }
  }

  words.forEach((w, i) => {
    current.push(w)
    currentChars += w.text.length + 1
    const next = words[i + 1]
    const pause = next ? next.startTime - w.endTime : Infinity
    const reachedLimit = current.length >= maxWords || (mode === 'auto' && currentChars >= AUTO_MAX_CHARS)
    const sentenceEnd = mode === 'auto' && SENTENCE_END_RE.test(w.text)
    if (!next || sentenceEnd || pause >= NATURAL_PAUSE_GAP_SECONDS || reachedLimit) flush()
  })
  flush()

  return groups.map((group, index) => ({
    id: `synced-seg-${index}`,
    startTime: group[0].startTime,
    endTime: group[group.length - 1].endTime,
    text: group.map((w) => w.text).join(' '),
    index,
    words: group,
  }))
}

export interface SubtitleEditorState {
  style: SubtitleStyle
  position: SubtitlePosition
  /** Só para destacar o bloco na timeline de legendas; não controla o que aparece no canvas (isso é sempre derivado de currentTime). */
  selectedSegmentId: string | null
  wordsPerCaption: SubtitleWordsPerCaption
}

export interface EditorState {
  canvas: {
    format: CanvasFormat
    background: BackgroundConfig
  }
  /** layers[0] é sempre a layer principal (isMain=true) — ver createMainVideoLayer. */
  layers: VideoLayer[]
  selectedLayerId: string | null
  subtitle: SubtitleEditorState
}

/** Enquadra o vídeo dentro do canvas preservando a proporção original (contain-fit), centralizado. */
export function fitTransform(format: CanvasFormat, videoRatio: number): NormalizedTransform {
  const cRatio = canvasRatio(format)
  let width: number
  let height: number
  if (videoRatio > cRatio) {
    width = 1
    height = cRatio / videoRatio
  } else {
    height = 1
    width = videoRatio / cRatio
  }
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height, rotation: 0 }
}

/**
 * Ao trocar o formato do canvas, o retângulo normalizado precisa ser
 * recalculado: a MESMA fração width/height representa proporções físicas
 * diferentes em canvas de proporções diferentes. Preserva a largura escolhida
 * pelo usuário e recalcula a altura para manter o vídeo sem distorção.
 */
export function resizeTransformForFormat(
  transform: NormalizedTransform,
  prevFormat: CanvasFormat,
  nextFormat: CanvasFormat,
  videoRatio: number,
): NormalizedTransform {
  if (prevFormat === nextFormat) return transform
  const nextCanvasRatio = canvasRatio(nextFormat)
  const height = (transform.width * nextCanvasRatio) / videoRatio
  return { ...transform, height }
}

/* -------------------------------------------------------- Persistência / Render (Etapa 4) --- */

/**
 * Forma serializável de EditorState, salva em clip.clip_metadata["edit_config"] (backend,
 * ver editor_render_service.py). Deliberadamente NÃO inclui `syncedWords`: os timestamps por
 * palavra já são persistidos de forma durável em clip_metadata.subtitle_sync.words (ver
 * subtitle_sync_service.py) — duplicá-los aqui criaria duas fontes de verdade para o mesmo
 * dado. O backend, ao renderizar, lê subtitle_sync.words direto (mesma função usada por
 * GET /subtitle-editor/.../subtitles) e reagrupa com groupWordsIntoSegments — a MESMA lógica
 * deste arquivo, portada para Python em editor_render_service.group_words_into_segments
 * (qualquer mudança nas constantes/regras precisa ser replicada nos dois lados).
 */
export const EDIT_CONFIG_VERSION = 1

export interface EditConfigLayer {
  id: string
  name: string
  visible: boolean
  transform: NormalizedTransform
  zIndex: number
  startTime: number
  /** Infinity (layer principal) não sobrevive a JSON.stringify — vira null; o backend trata
   * null como "até o fim do vídeo principal" (ver editor_render_service.build_render_spec). */
  endTime: number | null
  isMain: boolean
  assetId?: string
}

export interface EditConfig {
  version: typeof EDIT_CONFIG_VERSION
  canvas: EditorState['canvas']
  layers: EditConfigLayer[]
  subtitle: {
    wordsPerCaption: SubtitleWordsPerCaption
    style: SubtitleStyle
    position: SubtitlePosition
  }
}

/** true se alguma layer secundária ainda não tem assetId (upload pendente) — usado para
 * bloquear Salvar/Exportar até o upload terminar (ver ClipEditorPage). */
export function hasUnuploadedLayers(layers: VideoLayer[]): boolean {
  return layers.some((l) => !l.isMain && !l.assetId)
}

export function toEditConfig(state: EditorState): EditConfig {
  return {
    version: EDIT_CONFIG_VERSION,
    canvas: state.canvas,
    layers: state.layers.map((l) => ({
      id: l.id,
      name: l.name,
      visible: l.visible,
      transform: l.transform,
      zIndex: l.zIndex,
      startTime: l.startTime,
      endTime: Number.isFinite(l.endTime) ? l.endTime : null,
      isMain: l.isMain,
      assetId: l.assetId,
    })),
    subtitle: {
      wordsPerCaption: state.subtitle.wordsPerCaption,
      style: state.subtitle.style,
      position: state.subtitle.position,
    },
  }
}

/**
 * Reconstrói o EditorState a partir de um EditConfig salvo. `resolveAssetSource` traduz o
 * assetId de cada layer secundária numa URL tocável (endpoint do backend que serve o asset —
 * o object URL original da sessão de upload não existe mais depois de um reload).
 */
export function applyEditConfig(
  config: EditConfig,
  mainVideoUrl: string,
  resolveAssetSource: (assetId: string) => string,
): EditorState {
  return {
    canvas: config.canvas,
    selectedLayerId: null,
    layers: config.layers.map((l) => ({
      id: l.id,
      type: 'video',
      name: l.name,
      source: l.isMain ? mainVideoUrl : (l.assetId ? resolveAssetSource(l.assetId) : ''),
      visible: l.visible,
      transform: l.transform,
      zIndex: l.zIndex,
      startTime: l.startTime,
      endTime: l.endTime === null ? Number.POSITIVE_INFINITY : l.endTime,
      isMain: l.isMain,
      assetId: l.assetId,
    })),
    subtitle: {
      style: config.subtitle.style,
      position: config.subtitle.position,
      selectedSegmentId: null,
      wordsPerCaption: config.subtitle.wordsPerCaption,
    },
  }
}

export function createDefaultEditorState(mainVideoUrl: string): EditorState {
  const mainLayer = createMainVideoLayer(mainVideoUrl)
  return {
    canvas: { format: '9:16', background: { ...DEFAULT_BACKGROUND } },
    layers: [mainLayer],
    selectedLayerId: null,
    subtitle: {
      style: { ...DEFAULT_SUBTITLE_STYLE, outline: { ...DEFAULT_SUBTITLE_STYLE.outline } },
      position: { ...DEFAULT_SUBTITLE_POSITION },
      selectedSegmentId: null,
      wordsPerCaption: 'auto',
    },
  }
}
