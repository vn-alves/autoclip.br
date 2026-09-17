import { supabase } from '@cloud/supabase/client'
import { lovable } from '@cloud/lovable/index'

export type CloudUser = { id: string; email: string | null }

export async function getCloudUser(): Promise<CloudUser | null> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

export function onCloudAuthChange(cb: (user: CloudUser | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
  })
  return () => data.subscription.unsubscribe()
}

export async function signUpWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return { needsConfirmation: !data.session }
}

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signInWithGoogle() {
  const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })
  if (result.error) throw result.error
  return result
}

export async function sendPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

export async function signOutCloud() {
  await supabase.auth.signOut()
}

/** Lê as configurações da conta (mesmas chaves em qualquer navegador). */
export async function loadCloudSettings(): Promise<any | null> {
  const user = await getCloudUser()
  if (!user) return null
  const { data, error } = await supabase
    .from('user_settings')
    .select('settings')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) {
    console.warn('Falha ao ler configurações da conta:', error.message)
    return null
  }
  return (data?.settings as any) ?? null
}

/** Grava as configurações na conta. Retorna false quando ninguém está conectado. */
export async function saveCloudSettings(settings: any): Promise<boolean> {
  const user = await getCloudUser()
  if (!user) return false
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, settings }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  return true
}
