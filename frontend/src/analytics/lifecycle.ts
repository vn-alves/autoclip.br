/**
 * Rastreamento de eventos do ciclo de vida do aplicativo + propriedades globais (super properties).
 *
 * - Propriedades globais: app_version / os / arch / locale, automaticamente incluído em cada evento após o registro,
 *   Botão conveniente"Versão / Sistema / Arquitetura"Análise de clipe (solução de problemas"Alta taxa de falha de uma versão em um sistema"etc.)
 * - Evento de ciclo de vida:
 *   - app_installed: primeira inicialização neste dispositivo (= Indicador de proxy de instalação)
 *   - app_aberto: cada inicialização (PostHog calcula automaticamente DAU / retenção com base nisso)
 *   - app_updated: número da versão mudou desde a última vez
 */
import { getVersion } from '@tauri-apps/api/app'
import { posthog } from './posthog'

const INSTALL_FLAG_KEY = 'autoclip.analytics.installed'
const LAST_VERSION_KEY = 'autoclip.analytics.lastVersion'
const SESSION_COUNT_KEY = 'autoclip.analytics.sessionCount'

/** Analisa grosseiramente o sistema operacional a partir do UA do webview, evitando a introdução da dependência plugin-os que exigiria modificações no lado Rust. */
function detectOS(): string {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua)) return 'macos'
  if (/Win/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'unknown'
}

/** Analisa grosseiramente a arquitetura da CPU (para distinguir Intel / Apple Silicon, etc.). */
function detectArch(): string {
  const ua = navigator.userAgent
  if (/arm64|aarch64/i.test(ua)) return 'arm64'
  if (/x86_64|x64|Win64|WOW64|Intel/i.test(ua)) return 'x64'
  return 'unknown'
}

async function getAppVersion(): Promise<string> {
  try {
    return await getVersion()
  } catch {
    // Em ambiente não-Tauri (ex: rodando vite dev no navegador) não é possível obter a versão
    return 'unknown'
  }
}

function readInt(key: string): number {
  try {
    return parseInt(localStorage.getItem(key) || '0', 10) || 0
  } catch {
    return 0
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

export interface RuntimeInfo { version: string; os: string; arch: string; locale: string }
let runtimeInfo: RuntimeInfo = { version: 'unknown', os: detectOS(), arch: detectArch(), locale: typeof navigator !== 'undefined' ? navigator.language : '' }

/** Ambiente de execução em cache após a inicialização (versão / sistema / arquitetura), reutilizado para feedback e outros cenários; não depende se o rastreamento está ativado. */
export function getRuntimeInfo(): RuntimeInfo {
  return runtimeInfo
}

/**
 * Registrar propriedades globais e relatar eventos de ciclo de vida relacionados à inicialização.
 * Chamar uma vez após initAnalytics(). Apenas armazena o ambiente de execução em cache quando o posthog não está inicializado.
 */
export async function trackLaunch(): Promise<void> {
  const version = await getAppVersion()
  const os = detectOS()
  const arch = detectArch()
  const locale = navigator.language
  runtimeInfo = { version, os, arch, locale }

  if (typeof posthog?.register !== 'function') return

  // Propriedades globais: cada evento subsequente as carregará automaticamente
  posthog.register({
    app_version: version,
    os,
    arch,
    app_locale: locale,
  })

  // Contagem de sessões
  const sessionCount = readInt(SESSION_COUNT_KEY) + 1
  safeSet(SESSION_COUNT_KEY, String(sessionCount))

  // Primeira instalação
  let isInstalled = false
  try {
    isInstalled = localStorage.getItem(INSTALL_FLAG_KEY) === 'true'
  } catch {
    /* ignore */
  }
  if (!isInstalled) {
    posthog.capture('app_installed', { version, os, arch })
    safeSet(INSTALL_FLAG_KEY, 'true')
  }

  // Atualização de versão
  let lastVersion: string | null = null
  try {
    lastVersion = localStorage.getItem(LAST_VERSION_KEY)
  } catch {
    /* ignore */
  }
  if (lastVersion && lastVersion !== version) {
    posthog.capture('app_updated', { from_version: lastVersion, to_version: version })
  }
  safeSet(LAST_VERSION_KEY, version)

  // Cada inicialização
  posthog.capture('app_opened', { version, session_number: sessionCount })
}
