// Conexão com o Lovable Cloud feita de forma preguiçosa e segura:
// se as variáveis VITE_SUPABASE_* não estiverem presentes no build,
// o app continua funcionando (sem conta na nuvem) em vez de quebrar a tela.
export type CloudUser = { id: string; email: string | null }

type SupabaseClient = typeof import('@cloud/supabase/client')['supabase']
type LovableApi = typeof import('@cloud/lovable/index')['lovable']

let cachedClient: SupabaseClient | null | undefined
let cachedLovable: LovableApi | null | undefined

/** true quando o build tem URL e chave do Cloud configuradas. */
export function isCloudConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  return typeof url === 'string' && url.length > 0 && typeof key === 'string' && key.length > 0
}

async function getSupabase(): Promise<SupabaseClient | null> {
  if (!isCloudConfigured()) return null
  if (cachedClient !== undefined) return cachedClient
  try {
    const mod = await import('@cloud/supabase/client')
    cachedClient = mod.supabase
  } catch (err) {
    console.warn('Conexão com a nuvem indisponível:', err)
    cachedClient = null
  }
  return cachedClient
}

async function getLovable(): Promise<LovableApi | null> {
  if (!isCloudConfigured()) return null
  if (cachedLovable !== undefined) return cachedLovable
  try {
    const mod = await import('@cloud/lovable/index')
    cachedLovable = mod.lovable
  } catch (err) {
    console.warn('Conexão com a nuvem indisponível:', err)
    cachedLovable = null
  }
  return cachedLovable
}

export async function getCloudUser(): Promise<CloudUser | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user) return null
  return { id: data.user.id, email: data.user.email ?? null }
}

export function onCloudAuthChange(cb: (user: CloudUser | null) => void): () => void {
  let unsubscribe: (() => void) | null = null
  let cancelled = false
  void getSupabase().then((supabase) => {
    if (!supabase || cancelled) return
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ? { id: session.user.id, email: session.user.email ?? null } : null)
    })
    unsubscribe = () => data.subscription.unsubscribe()
  })
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

export async function signUpWithEmail(email: string, password: string) {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Login na nuvem indisponível neste endereço.')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return { needsConfirmation: !data.session }
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Login na nuvem indisponível neste endereço.')
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signInWithGoogle() {
  const lovable = await getLovable()
  if (!lovable) throw new Error('Login na nuvem indisponível neste endereço.')
  const result = await lovable.auth.signInWithOAuth('google', { redirect_uri: window.location.origin })
  if (result.error) throw result.error
  return result
}

export async function sendPasswordReset(email: string) {
  const supabase = await getSupabase()
  if (!supabase) throw new Error('Login na nuvem indisponível neste endereço.')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  })
  if (error) throw error
}

export async function signOutCloud() {
  const supabase = await getSupabase()
  if (supabase) await supabase.auth.signOut()
}

/** Lê as configurações da conta (mesmas chaves em qualquer navegador). */
export async function loadCloudSettings(): Promise<any | null> {
  const supabase = await getSupabase()
  if (!supabase) return null
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
  const supabase = await getSupabase()
  if (!supabase) return false
  const user = await getCloudUser()
  if (!user) return false
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: user.id, settings }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
  return true
}
