/**
 * Estado do Editor de Corte — ETAPA 1 (fundação).
 *
 * Só existe em memória (React state) nesta etapa; não é persistido no
 * backend. A forma já é pensada para crescer nas próximas etapas
 * (múltiplas layers, legendas, render spec) sem precisar reescrever o
 * que já existe — ver docs/EDITOR_SPEC.md.
 */

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

export interface EditorState {
  canvas: {
    format: CanvasFormat
    background: BackgroundConfig
  }
  videoLayer: VideoLayerState
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
  }
}
