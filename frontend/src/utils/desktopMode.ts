import { buildApiUrl } from './apiConfig'

// Tauri = sempre modo desktop. Fora do Tauri (preview no navegador) perguntamos ao
// backend local: se ele roda em modo desktop, salvar configurações funciona igual.
let cached: Promise<boolean> | null = null

function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
}

async function detect(): Promise<boolean> {
  if (isTauri()) return true
  try {
    const res = await fetch(buildApiUrl('/settings/desktop-mode'))
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.is_desktop_mode)
  } catch {
    return false
  }
}

async function detectWritable(): Promise<boolean> {
  if (isTauri()) return true
  try {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 3000)
    const res = await fetch(buildApiUrl('/settings/'), { signal: controller.signal })
    window.clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

export async function isDesktopMode(): Promise<boolean> {
  if (!cached) {
    cached = detect().catch(() => false)
  }
  return cached
}

// Verdadeiro sempre que o servidor de configurações responder — inclusive no navegador.
export async function canSaveSettings(): Promise<boolean> {
  return detectWritable().catch(() => false)
}
