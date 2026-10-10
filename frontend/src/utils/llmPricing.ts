/**
 * Preços da OpenAI (US$ por 1 milhão de tokens) e cálculo de gasto a partir dos tokens que a
 * própria API devolveu. Fonte única de preço: o backend só grava tokens, então reajustar um
 * valor aqui recalcula todo o histórico. Referência: https://openai.com/api/pricing
 */
export interface ModelPrice { input: number; cachedInput: number; output: number }

export const OPENAI_PRICES: Record<string, ModelPrice> = {
  'gpt-5': { input: 1.25, cachedInput: 0.125, output: 10 },
  'gpt-5-mini': { input: 0.25, cachedInput: 0.025, output: 2 },
  'gpt-5-nano': { input: 0.05, cachedInput: 0.005, output: 0.4 },
  'gpt-4.1': { input: 2, cachedInput: 0.5, output: 8 },
  'gpt-4.1-mini': { input: 0.4, cachedInput: 0.1, output: 1.6 },
  'gpt-4.1-nano': { input: 0.1, cachedInput: 0.025, output: 0.4 },
  'gpt-4o': { input: 2.5, cachedInput: 1.25, output: 10 },
  'gpt-4o-mini': { input: 0.15, cachedInput: 0.075, output: 0.6 },
  'o4-mini': { input: 1.1, cachedInput: 0.275, output: 4.4 },
  'o3': { input: 2, cachedInput: 0.5, output: 8 },
}

/** Whisper: US$ por minuto de áudio. */
export const WHISPER_USD_PER_MINUTE = 0.006

export const DEFAULT_USD_BRL = 5.4

export interface UsageRecord {
  ts: number
  project_id?: string | null
  provider: string
  model: string
  prompt_tokens?: number
  completion_tokens?: number
  cached_tokens?: number
  audio_seconds?: number
}

/** Casa o modelo pelo prefixo mais longo ("gpt-4o-mini-2024-07-18" → gpt-4o-mini). */
export function priceFor(model: string): ModelPrice | null {
  const m = (model || '').toLowerCase().replace(/^openai\//, '')
  let best: string | null = null
  for (const key of Object.keys(OPENAI_PRICES)) {
    if ((m === key || m.startsWith(key + '-')) && (!best || key.length > best.length)) best = key
  }
  return best ? OPENAI_PRICES[best] : null
}

/** Custo em US$ de um registro; null quando o modelo não tem preço conhecido. */
export function recordCostUsd(r: UsageRecord): number | null {
  if (r.audio_seconds) return (r.audio_seconds / 60) * WHISPER_USD_PER_MINUTE
  const price = priceFor(r.model)
  if (!price) return null
  const cached = Math.min(r.cached_tokens || 0, r.prompt_tokens || 0)
  const fresh = (r.prompt_tokens || 0) - cached
  return (fresh * price.input + cached * price.cachedInput + (r.completion_tokens || 0) * price.output) / 1_000_000
}

export interface UsageTotals { calls: number; tokens: number; usd: number; unpriced: number }

export function sumUsage(records: UsageRecord[]): UsageTotals {
  const t: UsageTotals = { calls: 0, tokens: 0, usd: 0, unpriced: 0 }
  for (const r of records) {
    t.calls += 1
    t.tokens += (r.prompt_tokens || 0) + (r.completion_tokens || 0)
    const c = recordCostUsd(r)
    if (c === null) t.unpriced += 1
    else t.usd += c
  }
  return t
}

/** Custo médio por corte: gasto do projeto dividido pelos cortes gerados. */
export function costPerClip(usd: number, clips: number): number | null {
  return clips > 0 ? usd / clips : null
}
