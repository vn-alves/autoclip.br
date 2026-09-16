/**
 * Serviço de API relacionado a envios
 */

import api from './api'

// Definição de tipo
export interface BilibiliAccount {
  id: string
  username: string
  nickname?: string
  status: string
  is_default: boolean
  created_at: string
}

export interface UploadRequest {
  clip_ids: string[]
  account_id: string
  title: string
  description: string
  tags: string[]
  partition_id: number
}

export interface UploadRecord {
  id: string | number
  task_id?: string
  project_id?: string
  account_id: string | number
  clip_id: string
  title: string
  description?: string
  tags?: string
  partition_id: number
  video_path?: string
  bv_id?: string
  av_id?: string
  status: string
  error_message?: string
  progress: number
  file_size?: number
  upload_duration?: number
  created_at: string
  updated_at: string
  account_username?: string
  account_nickname?: string
  project_name?: string
}

export interface UploadStatus {
  id: string
  status: string
  bvid?: string
  error_message?: string
  created_at: string
}

// Informações de partição Bilibili - Atualizado de acordo com a documentação oficial da API, partição principal de primeiro nível
export const BILIBILI_PARTITIONS = [
  { id: 1, name: "Animação" },
  { id: 4, name: "Jogos" },
  { id: 8, name: "Kichiku" },
  { id: 3, name: "Música" },
  { id: 129, name: "Dança" },
  { id: 181, name: "Filmes e TV" },
  { id: 5, name: "Entretenimento" },
  { id: 36, name: "Conhecimento" },
  { id: 188, name: "Tecnologia Digital" },
  { id: 202, name: "Notícias" },
  { id: 76, name: "Culinária" },
  { id: 138, name: "Mini-teatro" },
  { id: 176, name: "Automóveis" },
  { id: 155, name: "Moda e Beleza" },
  { id: 235, name: "Esportes" },
  { id: 75, name: "Animais" },
  { id: 21, name: "vlog" },
  { id: 162, name: "Desenho" },
  { id: 207, name: "Inteligência Artificial" },
  { id: 208, name: "Decoração e Imóveis" },
  { id: 209, name: "Tendências ao Ar Livre" },
  { id: 164, name: "Fitness" },
  { id: 161, name: "Artesanato" },
  { id: 165, name: "Viagens" },
  { id: 158, name: "Agricultura" },
  { id: 159, name: "Parentalidade" },
  { id: 160, name: "Saúde" },
  { id: 163, name: "Emoção" },
  { id: 22, name: "Interesses de Vida" },
  { id: 23, name: "Experiências de Vida" }
]

// API de envio
export const uploadApi = {
  // Gerenciamento de conta
  createAccount: async (username: string, password: string, nickname?: string, cookieContent?: string): Promise<BilibiliAccount> => {
    return api.post('/upload/accounts', { username, password, nickname, cookie_content: cookieContent })
  },

  // Obter métodos de login suportados
  getLoginMethods: async (): Promise<{methods: Array<{
    id: string,
    name: string,
    description: string,
    icon: string,
    recommended: boolean,
    risk_level: string
  }>}> => {
    return api.get('/upload/login-methods')
  },

  // Login com conta e senha
  passwordLogin: async (username: string, password: string, nickname?: string): Promise<BilibiliAccount> => {
    return api.post('/upload/password-login', { username, password, nickname })
  },

  // Login por importação de Cookie
  cookieLogin: async (cookies: Record<string, string>, nickname?: string): Promise<BilibiliAccount> => {
    return api.post('/upload/cookie-login', { cookies, nickname })
  },

  // Login de terceiros
  thirdPartyLogin: async (type: 'wechat' | 'qq', nickname?: string): Promise<{login_url: string, message: string}> => {
    return api.post('/upload/third-party-login', { type, nickname })
  },

  startQRLogin: async (nickname?: string): Promise<{session_id: string, status: string, message: string}> => {
    return api.post('/upload/qr-login', { nickname })
  },

  checkQRLoginStatus: async (sessionId: string): Promise<{session_id: string, status: string, message: string, qr_code?: string}> => {
    return api.get(`/upload/qr-login/${sessionId}`)
  },

  completeQRLogin: async (sessionId: string, nickname?: string): Promise<BilibiliAccount> => {
    return api.post(`/upload/qr-login/${sessionId}/complete`, { nickname })
  },

  getAccounts: async (): Promise<BilibiliAccount[]> => {
    return api.get('/upload/accounts')
  },

  deleteAccount: async (accountId: string): Promise<void> => {
    return api.delete(`/upload/accounts/${accountId}`)
  },

  checkAccountStatus: async (accountId: string): Promise<{is_valid: boolean, message: string}> => {
    return api.post(`/upload/accounts/${accountId}/check`)
  },

  // Gerenciamento de envio
  createUploadTask: async (projectId: string, uploadData: UploadRequest): Promise<{message: string, record_id: string, clip_count: number}> => {
    return api.post(`/upload/projects/${projectId}/upload`, uploadData)
  },

  retryUploadTask: async (recordId: string): Promise<{message: string}> => {
    return api.post(`/upload/records/${recordId}/retry`)
  },

  cancelUploadTask: async (recordId: string): Promise<{message: string}> => {
    return api.post(`/upload/records/${recordId}/cancel`)
  },

  getUploadRecords: async (projectId?: string): Promise<UploadRecord[]> => {
    const params = projectId ? { project_id: projectId } : {}
    return api.get('/upload/records', { params })
  },

  getUploadRecord: async (recordId: string): Promise<UploadStatus> => {
    return api.get(`/upload/records/${recordId}`)
  },

  getBilibiliAccounts: async (): Promise<BilibiliAccount[]> => {
    return api.get('/upload/accounts')
  },

  // Gerenciamento de tarefas de envio
  retryUpload: async (recordId: string | number): Promise<{message: string}> => {
    return api.post(`/upload/records/${recordId}/retry`)
  },

  cancelUpload: async (recordId: string | number): Promise<{message: string}> => {
    return api.post(`/upload/records/${recordId}/cancel`)
  },

  deleteUpload: async (recordId: string | number): Promise<{message: string}> => {
    return api.delete(`/upload/records/${recordId}`)
  }
}
