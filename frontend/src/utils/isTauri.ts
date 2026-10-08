/**
 * Detecção síncrona de ambiente Tauri (desktop) — fonte única. Antes duplicada em
 * desktopMode.ts e externalLinks.tsx; usada também pela Landing Page (App.tsx) pra decidir,
 * antes do primeiro render, se mostra a Landing (Web) ou o app direto (Desktop) — precisa ser
 * síncrona pra não ter flash de Landing no app instalado.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
}
