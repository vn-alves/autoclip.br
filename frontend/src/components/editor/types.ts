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

/**
 * Camada única do vídeo principal nesta etapa. O nome "layers" (plural, no
 * estado do editor) já antecipa a Etapa 3 (múltiplas camadas de vídeo) —
 * aqui a lista sempre tem exatamente um item, o corte original.
 */
export interface VideoLayerState {
  id: 'main'
  transform: NormalizedTransform
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
 * são uma contagem fixa de palavras por legenda. Reagrupar NUNCA chama IA — é só reparticionar a mesma
 * lista de palavras já sincronizada (ver groupWordsIntoSegments), por isso é instantâneo. */
export type SubtitleWordsPerCaption = 'auto' | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10

export const WORDS_PER_CAPTION_OPTIONS: { value: SubtitleWordsPerCaption; label: string }[] = [
  { value: 'auto', label: 'Automático' },
  { value: 1, label: '1 palavra' },
  { value: 2, label: '2 palavras' },
  { value: 3, label: '3 palavras' },
  { value: 4, label: '4 palavras' },
  { value: 5, label: '5 palavras' },
  { value: 6, label: '6 palavras' },
  { value: 8, label: '8 palavras' },
  { value: 10, label: '10 palavras' },
]

const AUTO_MAX_WORDS = 8
const AUTO_MAX_CHARS = 42
const AUTO_PAUSE_GAP_SECONDS = 0.6
const SENTENCE_END_RE = /[.!?;]$/

/**
 * Reagrupa uma lista "achatada" de palavras (já com timestamps reais, sincronizados
 * uma única vez com IA) em blocos de legenda — puramente local, sem tocar nos
 * timestamps individuais de cada palavra (item 7/13 da tarefa de sincronização).
 */
export function groupWordsIntoSegments(words: SubtitleWord[], mode: SubtitleWordsPerCaption): SubtitleSegment[] {
  if (words.length === 0) return []

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
    if (mode === 'auto') {
      const next = words[i + 1]
      const pause = next ? next.startTime - w.endTime : Infinity
      const tooLong = current.length >= AUTO_MAX_WORDS || currentChars >= AUTO_MAX_CHARS
      if (!next || SENTENCE_END_RE.test(w.text) || pause >= AUTO_PAUSE_GAP_SECONDS || tooLong) flush()
    } else if (current.length >= mode) {
      flush()
    }
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
  videoLayer: VideoLayerState
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

export function createDefaultEditorState(): EditorState {
  return {
    canvas: { format: '9:16', background: { ...DEFAULT_BACKGROUND } },
    videoLayer: { id: 'main', transform: { x: 0, y: 0, width: 1, height: 1, rotation: 0 } },
    subtitle: {
      style: { ...DEFAULT_SUBTITLE_STYLE, outline: { ...DEFAULT_SUBTITLE_STYLE.outline } },
      position: { ...DEFAULT_SUBTITLE_POSITION },
      selectedSegmentId: null,
      wordsPerCaption: 'auto',
    },
  }
}
