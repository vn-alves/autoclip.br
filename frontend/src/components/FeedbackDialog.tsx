import React, { useEffect, useMemo, useState } from 'react'
import { message } from 'antd'
import { Btn, Dialog, Icon, Segmented } from '../ui'
import {
  FEEDBACK_FORM_URL,
  FEEDBACK_ISSUES_URL,
  FeedbackCategory,
  FeedbackContext,
  collectLlmContext,
  resolveFeedbackSurvey,
  submitFeedback,
  trackFeedbackDismissed,
  trackFeedbackOpened,
} from '../analytics/feedback'
import { isAnalyticsEnabled } from '../analytics/posthog'
import { getRuntimeInfo } from '../analytics/lifecycle'
import { openExternalLink as openExternal } from '../utils/externalLinks'

interface FeedbackDialogProps {
  open: boolean
  onClose: () => void
  context: FeedbackContext
}

/**
 * Feedback no aplicativo — Página de configurações 'Feedback' e estado de falha do projeto são compartilhados.
 * Anexa automaticamente versão / sistema / arquitetura / LLM provider & Modelo / Fase de falha e erro, o usuário só precisa escrever uma frase.
 */
const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ open, onClose, context }) => {
  const [category, setCategory] = useState<FeedbackCategory>(context.source === 'failure' ? 'bug' : 'idea')
  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [sending, setSending] = useState(false)
  const [llm, setLlm] = useState<Pick<FeedbackContext, 'llm_provider' | 'llm_model' | 'llm_base_url'>>({})
  const [surveyReady, setSurveyReady] = useState<boolean | null>(null)
  const runtime = useMemo(() => getRuntimeInfo(), [])
  const analyticsOn = isAnalyticsEnabled()

  const fullContext: FeedbackContext = useMemo(() => ({ ...llm, ...context }), [llm, context])

  useEffect(() => {
    if (!open) return
    setText('')
    setContact('')
    setCategory(context.source === 'failure' ? 'bug' : 'idea')
    collectLlmContext().then(setLlm)
    resolveFeedbackSurvey().then((s) => {
      setSurveyReady(!!s)
      trackFeedbackOpened(context, s)
    })
  }, [open, context])

  const handleClose = () => {
    resolveFeedbackSurvey().then((s) => trackFeedbackDismissed(context, s))
    onClose()
  }

  const handleSend = async () => {
    if (text.trim().length < 4) {
      message.warning('Escreva mais algumas palavras para que possamos localizar o problema')
      return
    }
    setSending(true)
    try {
      const ok = await submitFeedback({ category, text: text.trim(), contact: contact.trim() || undefined, context: fullContext })
      if (ok) {
        message.success('Recebido, obrigado pelo feedback')
        onClose()
      } else {
        message.info('Estatísticas anônimas desativadas, por favor, use o formulário para enviar')
        void openExternal(FEEDBACK_FORM_URL)
      }
    } finally {
      setSending(false)
    }
  }

  const ctxChips: string[] = [
    runtime.version !== 'unknown' ? `v${runtime.version}` : 'dev',
    `${runtime.os}/${runtime.arch}`,
  ]
  if (fullContext.llm_provider) ctxChips.push(`${fullContext.llm_provider}${fullContext.llm_model ? ` · ${fullContext.llm_model}` : ''}`)
  if (fullContext.stage) ctxChips.push(`stage: ${fullContext.stage}`)

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={context.source === 'failure' ? 'Não gerou vídeo desta vez, diga-nos o que deu errado' : 'Feedback'}
      description={
        context.source === 'failure'
          ? 'Mensagens de erro e o ambiente de execução serão anexados automaticamente, você só precisa adicionar o que aconteceu.'
          : 'Uma frase é suficiente. O ambiente de execução será anexado automaticamente, não incluindo conteúdo de vídeo e chaves de API.'
      }
      footer={
        <>
          <div style={{ display: 'flex', gap: 4 }}>
            <Btn variant="text" size="sm" onClick={() => openExternal(FEEDBACK_FORM_URL)}>Formulário <Icon.External size={12} /></Btn>
            <Btn variant="text" size="sm" onClick={() => openExternal(FEEDBACK_ISSUES_URL)}>GitHub <Icon.External size={12} /></Btn>
          </div>
          <div className="right">
            <Btn size="sm" onClick={handleClose}>Cancelar</Btn>
            <Btn variant="cta" size="sm" style={{ height: 32, fontSize: 13, padding: '0 16px' }} loading={sending} onClick={handleSend}>
              Enviar
            </Btn>
          </div>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Segmented
          size="sm"
          ariaLabel="Tipo de Feedback"
          value={category}
          onChange={setCategory}
          options={[
            { value: 'bug', label: 'Algo deu errado' },
            { value: 'idea', label: 'Recurso desejado' },
            { value: 'other', label: 'Outro' },
          ]}
        />
        <textarea
          className="ac-input ac-textarea"
          autoFocus
          placeholder={
            category === 'bug'
              ? 'O que aconteceu? Qual passo foi dado, qual era a expectativa, o que foi realmente visto.'
              : category === 'idea'
                ? 'O que você quer que o AutoClip faça por você?'
                : 'Sinta-se à vontade para dizer o que quiser.'
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
        />
        {fullContext.error_message && (
          <div className="ac-input ac-input--mono" style={{ height: 'auto', padding: '8px 12px', color: 'var(--ac-sub)', background: 'var(--ac-line-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 88, overflow: 'auto', fontSize: 11.5 }}>
            {fullContext.error_message}
          </div>
        )}
        <input
          className="ac-input"
          placeholder="Informações de contato (opcional, e-mail / Feishu / WeChat)"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
        />
        <div className="ac-context" title="Contexto a ser enviado com o feedback">
          {ctxChips.map((c) => <span key={c}>{c}</span>)}
          {!analyticsOn && <span style={{ color: 'var(--ac-warn)' }}>Estatísticas anônimas desativadas · Será usado um formulário</span>}
          {analyticsOn && surveyReady === false && <span>· Relatar diretamente</span>}
        </div>
      </div>
    </Dialog>
  )
}

export default FeedbackDialog
