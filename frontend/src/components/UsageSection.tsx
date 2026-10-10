import React, { useEffect, useMemo, useState } from 'react'
import { Input, message } from 'antd'
import { Btn, Row, Section } from '../ui'
import { usageApi } from '../services/api'
import { listWebProjects, listWebClips } from '../webstore/projects'
import { clearWebUsage, loadWebUsage } from '../utils/webUsage'
import { DEFAULT_USD_BRL, costPerClip, sumUsage, type UsageRecord } from '../utils/llmPricing'

const RATE_KEY = 'autoclip.usdBrl'
const usd = (v: number) => `US$ ${v < 1 ? v.toFixed(4) : v.toFixed(2)}`
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })
const num = (v: number) => v.toLocaleString('pt-BR')

type ProjectInfo = Record<string, { name: string; clips: number }>

const UsageSection: React.FC = () => {
  const [records, setRecords] = useState<UsageRecord[]>([])
  const [projects, setProjects] = useState<ProjectInfo>({})
  const [loading, setLoading] = useState(true)
  const [rate, setRate] = useState<number>(DEFAULT_USD_BRL)

  useEffect(() => {
    const saved = Number(localStorage.getItem(RATE_KEY))
    if (saved > 0) setRate(saved)
  }, [])

  const load = async () => {
    setLoading(true)
    const all: UsageRecord[] = []
    const info: ProjectInfo = {}
    try {
      const res = await usageApi.getLlmUsage()
      all.push(...(res.records || []))
      Object.assign(info, res.projects || {})
    } catch { /* sem o aplicativo: só a versão web */ }
    const web = loadWebUsage()
    all.push(...web)
    if (web.length) {
      try {
        for (const p of await listWebProjects()) {
          if (!info[p.id]) info[p.id] = { name: p.name, clips: (await listWebClips(p.id)).length }
        }
      } catch { /* ignore */ }
    }
    setRecords(all.filter((r) => (r.provider || '').startsWith('openai')))
    setProjects(info)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const total = useMemo(() => sumUsage(records), [records])
  const byProject = useMemo(() => {
    const groups = new Map<string, UsageRecord[]>()
    for (const r of records) {
      const k = r.project_id || '__none'
      groups.set(k, [...(groups.get(k) || []), r])
    }
    return [...groups.entries()]
      .map(([id, rs]) => ({ id, totals: sumUsage(rs), info: projects[id] }))
      .sort((a, b) => b.totals.usd - a.totals.usd)
  }, [records, projects])

  const totalClips = byProject.reduce((n, p) => n + (p.info?.clips || 0), 0)
  const perClipAll = costPerClip(total.usd, totalClips)

  const reset = async () => {
    if (!window.confirm('Zerar o histórico de gastos? Isso não afeta sua conta na OpenAI.')) return
    try { await usageApi.resetLlmUsage() } catch { /* ignore */ }
    clearWebUsage()
    message.success('Histórico zerado')
    load()
  }

  const cell: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid var(--ac-line)', textAlign: 'right', whiteSpace: 'nowrap' }
  const head: React.CSSProperties = { ...cell, color: 'var(--ac-muted)', fontWeight: 500, fontSize: 12 }

  return (
    <Section
      title="Gastos"
      description="Quanto a sua chave da OpenAI já gastou com o AutoClip, calculado pelos tokens que a própria OpenAI informa em cada chamada. É uma estimativa: o valor oficial é o da sua fatura na OpenAI."
    >
      <div className="ac-rows">
        <Row label="Crédito usado (OpenAI)" hint={`${num(total.calls)} chamadas · ${num(total.tokens)} tokens`}
          control={<strong style={{ fontFamily: 'var(--ac-font-mono)' }}>{loading ? '…' : usd(total.usd)}</strong>} />
        <Row label="Em reais" hint="Convertido pela cotação abaixo"
          control={<strong style={{ fontFamily: 'var(--ac-font-mono)' }}>{loading ? '…' : brl(total.usd * rate)}</strong>} />
        <Row label="Média por corte" hint={`${num(totalClips)} cortes gerados`}
          control={<span style={{ fontFamily: 'var(--ac-font-mono)' }}>{perClipAll === null ? '—' : `${usd(perClipAll)} · ${brl(perClipAll * rate)}`}</span>} />
        <Row label="Cotação do dólar" hint="Ajuste para a cotação do dia (R$ por US$ 1)"
          control={
            <Input style={{ width: 110 }} type="number" step="0.01" min="0" value={rate}
              onChange={(e) => { const v = Number(e.target.value); setRate(v); if (v > 0) localStorage.setItem(RATE_KEY, String(v)) }} />
          } />
        {total.unpriced > 0 && (
          <Row label="Sem preço conhecido" hint="Chamadas de um modelo fora da tabela de preços; não entram no total."
            control={<span>{num(total.unpriced)}</span>} />
        )}
      </div>

      <div style={{ marginTop: 24, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--ac-ink)' }}>
          <thead>
            <tr>
              <th style={{ ...head, textAlign: 'left' }}>Projeto</th>
              <th style={head}>Tokens</th>
              <th style={head}>Cortes</th>
              <th style={head}>Total</th>
              <th style={head}>Por corte</th>
            </tr>
          </thead>
          <tbody>
            {!loading && byProject.length === 0 && (
              <tr><td colSpan={5} style={{ ...cell, textAlign: 'left', color: 'var(--ac-muted)' }}>Nenhum gasto registrado ainda. Os próximos vídeos processados com a OpenAI aparecem aqui.</td></tr>
            )}
            {byProject.map((p) => {
              const clips = p.info?.clips || 0
              const per = costPerClip(p.totals.usd, clips)
              return (
                <tr key={p.id}>
                  <td style={{ ...cell, textAlign: 'left', whiteSpace: 'normal' }}>
                    {p.id === '__none' ? 'Testes e outras chamadas' : p.info?.name || 'Projeto removido'}
                  </td>
                  <td style={cell}>{num(p.totals.tokens)}</td>
                  <td style={cell}>{clips || '—'}</td>
                  <td style={cell}>{usd(p.totals.usd)}<div style={{ color: 'var(--ac-muted)', fontSize: 12 }}>{brl(p.totals.usd * rate)}</div></td>
                  <td style={cell}>{per === null ? '—' : <>{usd(per)}<div style={{ color: 'var(--ac-muted)', fontSize: 12 }}>{brl(per * rate)}</div></>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <Btn size="sm" onClick={load}>Atualizar</Btn>
        <Btn size="sm" onClick={reset}>Zerar histórico</Btn>
      </div>
    </Section>
  )
}

export default UsageSection
