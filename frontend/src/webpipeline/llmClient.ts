import { loadBrowserSettings } from '../utils/browserSettings'
import { profileFor } from './durationProfile'

/**
 * IA direto do navegador (Fase 2 do plano "Web sem servidor") — reaproveita a MESMA chave/
 * config que o usuário já cadastra em Configurações (ver SettingsPage.tsx), chamando a API
 * do provedor direto do browser, sem passar pelo backend Python.
 *
 * Escopo desta primeira versão: só provedores com endpoint compatível com OpenAI (a própria
 * opção "OpenAI / Interface compatível" já cobre OpenAI, Zhipu, DeepSeek, OpenRouter, vLLM
 * etc. — ver PROVIDERS em SettingsPage.tsx). Outros provedores (DashScope, Gemini nativo,
 * SiliconFlow) têm formatos de API diferentes pra transcrição de áudio especificamente;
 * suportar cada um exigiria um cliente próprio — deixado pra uma próxima etapa se algum
 * desses for o provedor mais pedido.
 */
export class WebPipelineError extends Error {}

export interface OpenAICompatConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function getOpenAICompatConfig(): OpenAICompatConfig | null {
  const settings = loadBrowserSettings()
  const api = settings?.api
  if (!api || api.api_provider !== 'openai') return null
  const apiKey = api.api_keys?.openai
  if (!apiKey) return null
  const baseUrl = (api.api_base_url || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = api.api_model || 'gpt-4o-mini'
  return { apiKey, baseUrl, model }
}

export interface TranscriptSegment {
  start: number
  end: number
  text: string
}

/** Transcreve um áudio (já extraído/comprimido — ver ffmpegClient.extractAudio) via
 * /audio/transcriptions, pedindo timestamps por segmento direto da própria API do Whisper —
 * evita precisar de um passo de alinhamento separado (o backend faz isso com
 * subtitle_sync_service.py; aqui a API já devolve os tempos prontos). */
export async function transcribeAudio(audioBlob: Blob): Promise<TranscriptSegment[]> {
  const cfg = getOpenAICompatConfig()
  if (!cfg) {
    throw new WebPipelineError('Configure uma chave de API compatível com OpenAI em Configurações pra usar o corte por IA sem servidor.')
  }
  const form = new FormData()
  form.append('file', audioBlob, 'audio.mp3')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  const res = await fetch(`${cfg.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}` },
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new WebPipelineError(`Falha na transcrição (${res.status}): ${detail.slice(0, 300)}`)
  }
  const data = await res.json()
  const segments = Array.isArray(data.segments) ? data.segments : []
  return segments.map((s: any) => ({ start: Number(s.start) || 0, end: Number(s.end) || 0, text: String(s.text || '').trim() }))
}

export interface HighlightClip {
  start: number
  end: number
  title: string
}

const fmtTs = (sec: number) => sec.toFixed(1)

/** Pede ao LLM pra escolher os melhores trechos do vídeo — versão simplificada de
 * backend/pipeline/step1_outline.py: um único prompt (o backend usa chunking + várias
 * passadas pra vídeos longos), mas a mesma ideia central (trechos autocontidos, direto ao
 * ponto, tempos batendo com o começo/fim real de uma fala da transcrição). */
export async function extractHighlightClips(segments: TranscriptSegment[], totalDurationSec: number): Promise<HighlightClip[]> {
  const cfg = getOpenAICompatConfig()
  if (!cfg) {
    throw new WebPipelineError('Configure uma chave de API compatível com OpenAI em Configurações pra usar o corte por IA sem servidor.')
  }
  if (segments.length === 0) {
    throw new WebPipelineError('Transcrição vazia — não há texto pra escolher os cortes.')
  }
  const profile = profileFor(totalDurationSec)
  const transcriptText = segments.map((s) => `[${fmtTs(s.start)}-${fmtTs(s.end)}] ${s.text}`).join('\n')
  const [topicsLo, topicsHi] = profile.topicsHint
  const [targetLo, targetHi] = profile.targetClipSec

  const prompt = `Você é um editor de vídeo especializado em identificar os melhores trechos de um vídeo pra cortar em clipes pra redes sociais.

Abaixo está a transcrição completa do vídeo, com o tempo (em segundos) de cada trecho entre colchetes.

Escolha entre ${topicsLo} e ${topicsHi} trechos que funcionem como clipes independentes (que façam sentido sozinhos, sem precisar do resto do vídeo). Cada clipe deve durar entre ${targetLo} e ${targetHi} segundos (nunca menos que ${profile.minClipSec}, nunca mais que ${profile.maxClipSec}).

IMPORTANTE: o "start" e o "end" de cada clipe precisam ser exatamente o tempo de início de algum trecho da transcrição (os números entre colchetes) — nunca invente um tempo que não apareça na transcrição.

Responda SOMENTE com um JSON no formato:
{"clips": [{"start": 12.4, "end": 98.2, "title": "Título curto e chamativo"}]}

Transcrição:
${transcriptText}`

  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: cfg.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new WebPipelineError(`Falha ao analisar o vídeo (${res.status}): ${detail.slice(0, 300)}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new WebPipelineError('O modelo não devolveu nenhuma escolha de corte.')

  let parsed: any
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new WebPipelineError('Não foi possível interpretar a resposta do modelo.')
  }
  const rawClips: any[] = Array.isArray(parsed.clips) ? parsed.clips : []

  // Encaixa start/end no início/fim real de um segmento da transcrição — nunca deixa o
  // corte cair no meio de uma fala, mesmo que o modelo tenha arredondado o número.
  const snapToSegment = (t: number, edge: 'start' | 'end'): number => {
    let best = segments[0][edge]
    let bestDiff = Math.abs(segments[0][edge] - t)
    for (const seg of segments) {
      const diff = Math.abs(seg[edge] - t)
      if (diff < bestDiff) {
        best = seg[edge]
        bestDiff = diff
      }
    }
    return best
  }

  return rawClips
    .map((c) => ({
      start: snapToSegment(Number(c.start) || 0, 'start'),
      end: snapToSegment(Number(c.end) || 0, 'end'),
      title: String(c.title || '').trim() || 'Corte sem título',
    }))
    .filter((c) => c.end - c.start >= profile.minClipSec * 0.5)
    .sort((a, b) => a.start - b.start)
}
