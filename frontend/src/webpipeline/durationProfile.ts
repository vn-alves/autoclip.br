/**
 * Porta simplificada de backend/pipeline/quality.py::profile_for — mesmos limiares de
 * duração total (curto/médio/longo) e as mesmas faixas de duração por corte, usados aqui só
 * pra montar a instrução de prompt do LLM (ver llmClient.ts). Não precisa ficar 100%
 * idêntico ao backend (o pipeline sem servidor é uma versão simplificada, ver conversa),
 * mas reaproveitar os mesmos números evita reinventar esse ajuste fino do zero.
 */
export interface DurationProfile {
  tier: 'short' | 'medium' | 'long'
  minClipSec: number
  targetClipSec: [number, number]
  maxClipSec: number
  topicsHint: [number, number]
}

export function profileFor(totalSec: number): DurationProfile {
  if (totalSec < 8 * 60) {
    return { tier: 'short', minClipSec: 20, targetClipSec: [30, 90], maxClipSec: 150, topicsHint: [3, 6] }
  }
  if (totalSec < 30 * 60) {
    return { tier: 'medium', minClipSec: 45, targetClipSec: [60, 180], maxClipSec: 300, topicsHint: [4, 10] }
  }
  const hours = totalSec / 3600
  return {
    tier: 'long',
    minClipSec: 90,
    targetClipSec: [120, 360],
    maxClipSec: 480,
    topicsHint: [Math.max(6, Math.round(6 * hours)), Math.max(12, Math.round(14 * hours))],
  }
}
