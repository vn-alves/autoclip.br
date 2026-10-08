/**
 * Análise de produto / Rastreamento PostHog
 *
 * Objetivos de design (ver ROADMAP.md Fase 0): anônimo, desativável, buffer local.
 * - Anônimo: Por padrão, não coleta nenhuma PII, usa ID de dispositivo anônimo antes do login; perfis de pessoa são criados apenas após identify.
 * - Desativável: O usuário pode desativar nas configurações (opt-out), o estado é persistido no localStorage e permanece efetivo após reiniciar o aplicativo.
 * - Buffer local: posthog-js armazena eventos em lote na memória por padrão, não perdendo o fluxo principal em caso de perda de conexão/saída do proxy.
 *
 * VITE não configurado_PUBLIC_POSTHOG_KEY, este módulo é totalmente no-op,
 * Portanto, o ambiente dev (sem chave) não contaminará os dados de produção.
 */
import posthog from 'posthog-js'

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY as string | undefined
const POSTHOG_HOST =
  (import.meta.env.VITE_PUBLIC_POSTHOG_HOST as string | undefined) ??
  'https://us.i.posthog.com'

/** Chave de armazenamento da preferência do usuário para rastreamento (true = Coleta desativada). */
const OPT_OUT_STORAGE_KEY = 'autoclip.analytics.optOut'

let initialized = false

/** Se o rastreamento de eventos está ativado (chave configurada e usuário não desativou). */
export function isAnalyticsEnabled(): boolean {
  if (!POSTHOG_KEY) return false
  try {
    return localStorage.getItem(OPT_OUT_STORAGE_KEY) !== 'true'
  } catch {
    return true
  }
}

/**
 * Inicializar PostHog. Deve ser chamado uma vez na inicialização do aplicativo.
 * Retornar diretamente quando não houver chave, sem fazer nenhuma solicitação de rede.
 */
export function initAnalytics(): void {
  if (initialized) return
  if (!POSTHOG_KEY) {
    if (import.meta.env.DEV) {
      console.info('[analytics] VITE não configurado_PUBLIC_POSTHOG_KEY, rastreamento desativado')
    }
    return
  }

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // No desktop, carrega de file:// / protocolo personalizado, cookies não são confiáveis, usa localStorage para persistir ID anônimo
    persistence: 'localStorage',
    // Não criar perfil de pessoa antes de fazer login, manter anônimo; associar via identify após login (ver ROADMAP Fase 1)
    person_profiles: 'identified_only',
    // Captura automaticamente cliques/entradas na página, combinando com eventos-chave manuais para construir funis
    autocapture: true,
    // Privacidade em primeiro lugar: gravação de tela desativada por padrão (também precisa ser ativada no PostHog)
    disable_session_recording: true,
    // Relatar pageview manualmente sob HashRouter (ver trackPageview)
    capture_pageview: false,
    capture_pageleave: true,
    // Respeitar a preferência de fechamento do usuário neste dispositivo
    opt_out_capturing_by_default: !isAnalyticsEnabled(),
    loaded: (ph) => {
      if (import.meta.env.DEV) ph.debug()
    },
  })

  initialized = true
}

/**
 * Ativa/desativa a coleta de rastreamento (para o interruptor da página de configurações). Será persistido no localStorage.
 */
export function setAnalyticsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(OPT_OUT_STORAGE_KEY, enabled ? 'false' : 'true')
  } catch {
    /* Ignorar quando localStorage não estiver disponível */
  }
  if (!initialized) return
  if (enabled) posthog.opt_in_capturing()
  else posthog.opt_out_capturing()
}

/** Relatar uma pageview (chamado na mudança de rota). */
export function trackPageview(path: string): void {
  if (!initialized) return
  posthog.capture('$pageview', { $current_url: path })
}

/** Vincular identidade após o login (usado ao integrar contas na Fase 1). */
export function identifyUser(
  distinctId: string,
  properties?: Record<string, unknown>,
): void {
  if (!initialized) return
  posthog.identify(distinctId, properties)
}

/** Redefinir identidade anônima ao sair. */
export function resetUser(): void {
  if (!initialized) return
  posthog.reset()
}

export { posthog }
