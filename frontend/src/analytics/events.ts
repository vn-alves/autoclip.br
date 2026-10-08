/**
 * Eventos de negócios críticos (ver ROADMAP.md Fase 0: importação / exportação / falha / configuração de chave).
 *
 * Defina nomes de eventos e tipos de payload aqui para evitar strings soltas em vários lugares.
 * Todas as capturas passam por trackEvent, automaticamente no-op quando não inicializado / desativado.
 */
import { posthog } from './posthog'

export const AnalyticsEvent = {
  /** Importar material (enviar/selecionar vídeo para iniciar um projeto) */
  VideoImported: 'video_imported',
  /** Exportar: Fatiamento gerado com sucesso */
  ClipsExported: 'clips_exported',
  /** Falha no fluxo crítico (qualquer etapa de importação/transcrição/corte/exportação) */
  ProcessingFailed: 'processing_failed',
  /** Definir/Atualizar chave da API LLM */
  ApiKeyConfigured: 'api_key_configured',
} as const

export type AnalyticsEventName =
  (typeof AnalyticsEvent)[keyof typeof AnalyticsEvent]

/** Ponto de entrada de rastreamento genérico. É no-op quando o posthog não está inicializado ou opt-out (já tratado internamente). */
function trackEvent(
  name: AnalyticsEventName,
  properties?: Record<string, unknown>,
): void {
  // posthog.capture não lança erro se não for inicializado; ainda assim, verifica por segurança
  if (typeof posthog?.capture !== 'function') return
  posthog.capture(name, properties)
}

export function trackVideoImported(props?: {
  source?: 'upload' | 'url' | 'local'
  fileType?: string
  durationSec?: number
  sizeBytes?: number
}): void {
  trackEvent(AnalyticsEvent.VideoImported, props)
}

export function trackClipsExported(props?: {
  clipCount?: number
  durationSec?: number
  withSubtitles?: boolean
  exportType?: 'clip' | 'collection' | 'project'
}): void {
  trackEvent(AnalyticsEvent.ClipsExported, props)
}

export function trackProcessingFailed(props: {
  stage: 'import' | 'transcribe' | 'analyze' | 'clip' | 'export' | 'other'
  message?: string
  code?: string | number
}): void {
  trackEvent(AnalyticsEvent.ProcessingFailed, props)
}

export function trackApiKeyConfigured(props: {
  provider: string
  /** Não passe a chave em texto claro, apenas marque se foi preenchida */
  hasKey: boolean
}): void {
  trackEvent(AnalyticsEvent.ApiKeyConfigured, props)
}
