import React, { useState } from 'react'
import { Input, message } from 'antd'
import { Btn, Row, Section, StatusDot } from '../ui'
import { signInWithEmail, signUpWithEmail, signInWithGoogle, signOutCloud, type CloudUser } from '../utils/cloudSettings'

type Props = {
  user: CloudUser | null
  onSyncNow: () => void
  syncing: boolean
}

const AccountSection: React.FC<Props> = ({ user, onSyncNow, syncing }) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email.trim() || !password) {
      message.warning('Preencha e-mail e senha')
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { needsConfirmation } = await signUpWithEmail(email.trim(), password)
        message.success(needsConfirmation ? 'Conta criada. Confirme pelo link enviado ao seu e-mail.' : 'Conta criada e conectada')
      } else {
        await signInWithEmail(email.trim(), password)
        message.success('Conectado')
      }
      setPassword('')
    } catch (err: any) {
      message.error(err?.message || 'Não foi possível entrar')
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (err: any) {
      message.error(err?.message || 'Não foi possível entrar com o Google')
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <Section title="Conta" description="Suas configurações e chaves ficam salvas na sua conta e aparecem em qualquer navegador.">
        <div className="ac-rows">
          <Row label="Conectado" hint={user.email || 'Conta ativa'}>
            <StatusDot tone="ok" label="Sincronizando" />
          </Row>
          <Row label="Buscar agora" hint="Traz as configurações salvas na conta para este navegador.">
            <Btn size="sm" onClick={onSyncNow} disabled={syncing}>{syncing ? 'Buscando…' : 'Buscar da conta'}</Btn>
          </Row>
          <Row label="Sair" hint="As configurações continuam salvas na conta.">
            <Btn size="sm" variant="text" onClick={async () => { await signOutCloud(); message.success('Você saiu da conta') }}>Sair</Btn>
          </Row>
        </div>
      </Section>
    )
  }

  return (
    <Section title="Conta" description="Entre para salvar suas configurações e chaves na sua conta e usá-las em qualquer navegador.">
      <div className="ac-rows">
        <Row wide label="E-mail" hint="Usado para entrar e recuperar a conta.">
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" autoComplete="email" />
        </Row>
        <Row wide label="Senha" hint="Mínimo de 6 caracteres.">
          <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} onPressEnter={submit} autoComplete="current-password" />
        </Row>
        <Row label={mode === 'signup' ? 'Criar conta' : 'Entrar'} hint={mode === 'signup' ? 'Já tem conta? Troque para entrar.' : 'Ainda não tem conta? Crie uma.'}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="cta" size="sm" onClick={submit} disabled={busy}>{mode === 'signup' ? 'Criar conta' : 'Entrar'}</Btn>
            <Btn variant="text" size="sm" onClick={() => setMode(mode === 'signup' ? 'signin' : 'signup')}>
              {mode === 'signup' ? 'Já tenho conta' : 'Criar conta'}
            </Btn>
          </div>
        </Row>
        <Row label="Google" hint="Entrar com sua conta Google.">
          <Btn size="sm" onClick={google} disabled={busy}>Continuar com o Google</Btn>
        </Row>
      </div>
    </Section>
  )
}

export default AccountSection
