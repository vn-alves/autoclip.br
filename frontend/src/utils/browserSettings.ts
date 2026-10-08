const STORAGE_KEY = 'autoclip.settings.v1'

export function loadBrowserSettings(): any | null {
  if (typeof window === 'undefined') return null

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (error) {
    console.warn('Falha ao ler as configurações salvas no navegador:', error)
    return null
  }
}

export function saveBrowserSettings(settings: any): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}