import { buildApiUrl } from './apiConfig'

// Tauri = sempre modo desktop. Fora do Tauri (preview no navegador) perguntamos ao
// backend local: se ele roda em modo desktop, salvar configurações funciona igual.
let cached: Promise<boolean> | null = null

async function detect(): Promise<boolean> {
  if (typeof window !== 'undefined' && ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)) {
    return true
  }
  try {
    const res = await fetch(buildApiUrl('/settings/desktop-mode'))
    if (!res.ok) return false
    const data = await res.json()
    return Boolean(data?.is_desktop_mode)
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
