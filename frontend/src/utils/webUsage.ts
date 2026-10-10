import type { UsageRecord } from './llmPricing'

// Versão web (sem o aplicativo): o navegador chama a OpenAI direto, então o consumo fica salvo aqui.
const KEY = 'autoclip.webUsage.v1'

export function loadWebUsage(): UsageRecord[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') } catch { return [] }
}

export function recordWebUsage(r: Omit<UsageRecord, 'ts'>): void {
  try {
    const all = loadWebUsage()
    all.push({ ...r, ts: Date.now() / 1000 })
    localStorage.setItem(KEY, JSON.stringify(all.slice(-5000)))
  } catch { /* contar gasto nunca deve quebrar o corte */ }
}

export function clearWebUsage(): void {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
