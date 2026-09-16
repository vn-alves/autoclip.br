/**
 * Feedback no aplicativo (PostHog Surveys).
 *
 * Objetivo: O usuário não precisa sair do aplicativo, nem se registrar no GitHub, para poder"O que está errado / O que você quer"Publicar,
 * e inclui automaticamente o contexto necessário para depuração (versão / sistema / arquitetura / provedor LLM & Modelo / Fase de falha e erro).
 *
 * Pontos-chave de implementação:
 * - Feedback com `feedback_submitted` O evento entra no PostHog (será enviado independentemente de haver Survey configurado ou não).
 * - Se houver um projeto PostHog chamado FEEDBACK_SURVEY_Survey (tipo API / sem UI) com NAME (ou ID especificado por env),
 *   E enviar de acordo com a convenção do PostHog `survey shown` / `survey sent` / `survey dismissed`, 
 *   Assim, os resultados aparecerão no PostHog → No painel de respostas do Surveys, o relatório semanal também pode ser lido diretamente.
 * - Versão / sistema / arquitetura são automaticamente incluídos pelas super properties registradas por lifecycle.ts; aqui são explicitamente adicionados,
 *   Evitar que o painel de Surveys seja apenas visualização `$survey_response*` perde o contexto.
 * - Quando o rastreamento é desativado pelo usuário, o PostHog não envia; neste caso, retorna ao formulário Feishu oficial (FEEDBACK_FORM_URL) . 
 */
import { posthog, isAnalyticsEnabled } from './posthog'
import { settingsApi } from '../services/api'

export const FEEDBACK_SURVEY_NAME = 'Feedback no aplicativo AutoClip'
export const FEEDBACK_FORM_URL = 'https://my.feishu.cn/share/base/shrcn8hKUG2icIJLpNry6uWVNJe'
export const FEEDBACK_ISSUES_URL = 'https://github.com/zhouxiaoka/autoclip/issues/new/choose'

const SURVEY_ID_ENV = import.meta.env.VITE_PUBLIC_POSTHOG_FEEDBACK_SURVEY_ID as string | undefined

export type FeedbackCategory = 'bug' | 'idea' | 'other'
export type FeedbackSource = 'settings' | 'failure' | 'detail'

export interface FeedbackContext {
  source: FeedbackSource
  /** Estado de falha com */
  stage?: string
  error_message?: string
  project_id?: string
  /** Página de configurações / estado de falha serão preenchidos o máximo possível */
  llm_provider?: string
  llm_model?: string
  llm_base_url?: string
}

interface SurveyLike {
  id: string
  name: string
  type?: string
  questions?: Array<{ id?: string; type?: string; question?: string }>
}

let cachedSurvey: SurveyLike | null | undefined

/** Encontra o Survey para coletar feedback; retorna null se não encontrado (não afeta o feedback_relato de submitted). */
export function resolveFeedbackSurvey(): Promise<SurveyLike | null> {
  if (cachedSurvey !== undefined) return Promise.resolve(cachedSurvey)
  return new Promise((resolve) => {
    if (typeof posthog?.getSurveys !== 'function' || !isAnalyticsEnabled()) {
      cachedSurvey = null
      return resolve(null)
    }
    try {
      posthog.getSurveys((surveys: unknown) => {
        const list = (Array.isArray(surveys) ? surveys : []) as SurveyLike[]
        const found =
          list.find((s) => SURVEY_ID_ENV && s.id === SURVEY_ID_ENV) ||
          list.find((s) => s.name === FEEDBACK_SURVEY_NAME) ||
          null
        cachedSurvey = found
        resolve(found)
      }, false)
    } catch {
      cachedSurvey = null
      resolve(null)
    }
  })
}

/** Lê o provedor / modelo LLM atual, adiciona ao contexto de feedback; ignora silenciosamente se o backend estiver inacessível. */
export async function collectLlmContext(): Promise<Pick<FeedbackContext, 'llm_provider' | 'llm_model' | 'llm_base_url'>> {
  try {
    const p = await settingsApi.getCurrentProvider()
    return {
      llm_provider: p?.provider,
      llm_model: p?.model,
      llm_base_url: p?.base_url || undefined,
    }
  } catch {
    return {}
  }
}

export function trackFeedbackOpened(ctx: FeedbackContext, survey: SurveyLike | null): void {
  if (typeof posthog?.capture !== 'function') return
  posthog.capture('feedback_opened', { source: ctx.source, stage: ctx.stage })
  if (survey) posthog.capture('survey shown', { $survey_id: survey.id, $survey_name: survey.name })
}

export function trackFeedbackDismissed(ctx: FeedbackContext, survey: SurveyLike | null): void {
  if (typeof posthog?.capture !== 'function') return
  posthog.capture('feedback_dismissed', { source: ctx.source })
  if (survey) posthog.capture('survey dismissed', { $survey_id: survey.id, $survey_name: survey.name })
}

export interface FeedbackPayload {
  category: FeedbackCategory
  text: string
  contact?: string
  context: FeedbackContext
}

/**
 * Enviar feedback. Retorna true se enviado via PostHog; false se o rastreamento estiver desativado / não inicializado,
 * O chamador deve guiar o usuário para usar o formulário Feishu.
 */
export async function submitFeedback(payload: FeedbackPayload): Promise<boolean> {
  if (typeof posthog?.capture !== 'function' || !isAnalyticsEnabled()) return false

  const survey = await resolveFeedbackSurvey()
  const props: Record<string, unknown> = {
    category: payload.category,
    text: payload.text,
    contact: payload.contact || undefined,
    ...payload.context,
  }
  posthog.capture('feedback_submitted', props)

  if (survey) {
    const qs = survey.questions || []
    const responses: Record<string, unknown> = {
      $survey_id: survey.id,
      $survey_name: survey.name,
      $survey_questions: qs.map((q) => ({ id: q.id, question: q.question })),
      // Pergunta 1: Texto livre
      $survey_response: payload.text,
      ...props,
    }
    // Compatível com a chave question-id: primeira pergunta = Texto, subsequentemente single_Questão de múltipla escolha = Categoria
    qs.forEach((q, i) => {
      const key = q.id ? `$survey_response_${q.id}` : `$survey_response_${i}`
      if (i === 0) responses[key] = payload.text
      else if (q.type === 'single_choice' || q.type === 'multiple_choice') responses[key] = payload.category
      else if (/Contato|contact|email/i.test(q.question || '')) responses[key] = payload.contact || ''
    })
    posthog.capture('survey sent', responses)
  }
  return true
}
