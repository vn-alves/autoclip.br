import { describe, expect, it } from 'vitest'
import { costPerClip, priceFor, recordCostUsd, sumUsage } from './llmPricing'

describe('llmPricing', () => {
  it('gpt-4o-mini: 1M de entrada + 1M de saída custa US$ 0,75', () => {
    expect(recordCostUsd({ ts: 0, provider: 'openai', model: 'gpt-4o-mini', prompt_tokens: 1_000_000, completion_tokens: 1_000_000 })).toBeCloseTo(0.75)
  })
  it('modelo com data no nome usa o preço do modelo base', () => {
    expect(priceFor('gpt-4o-mini-2024-07-18')?.input).toBe(0.15)
    expect(priceFor('gpt-4o-2024-08-06')?.input).toBe(2.5)
  })
  it('tokens em cache são cobrados pelo preço reduzido', () => {
    expect(recordCostUsd({ ts: 0, provider: 'openai', model: 'gpt-4o', prompt_tokens: 1_000_000, cached_tokens: 1_000_000 })).toBeCloseTo(1.25)
  })
  it('whisper cobra US$ 0,006 por minuto', () => {
    expect(recordCostUsd({ ts: 0, provider: 'openai', model: 'whisper-1', audio_seconds: 600 })).toBeCloseTo(0.06)
  })
  it('modelo sem preço não entra no total e é contado à parte', () => {
    const t = sumUsage([{ ts: 0, provider: 'dashscope', model: 'qwen-plus', prompt_tokens: 10 }])
    expect(t.usd).toBe(0)
    expect(t.unpriced).toBe(1)
  })
  it('custo por corte divide pelo número de cortes', () => {
    expect(costPerClip(0.6, 6)).toBeCloseTo(0.1)
    expect(costPerClip(0.6, 0)).toBeNull()
  })
})
