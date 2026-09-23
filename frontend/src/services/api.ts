import axios from 'axios'
import { Project, Clip, Collection } from '../store/useProjectStore'
import { errorHandler } from '../utils/errorHandler'
import { apiConfigManager, resolveApiUrl } from '../utils/apiConfig'
import {
  trackVideoImported,
  trackClipsExported,
  trackProcessingFailed,
} from '../analytics/events'

// Estender o tipo de configuração do Axios
declare module 'axios' {
  interface InternalAxiosRequestConfig {
    metadata?: {
      startTime: number
      retryCount?: number
    }
  }
}

// Função de formatação de tempo (não usada atualmente, mantida para backup)

const api = axios.create({
  baseURL: apiConfigManager.getBaseUrl(),
  timeout: 300000, // Aumentado para 5 minutos de timeout
  headers: {
    'Content-Type': 'application/json',
  },
})

const RETRYABLE_METHODS = new Set(['get', 'head', 'options'])
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504])
const MAX_RETRIES = 2

const shouldRetry = (error: any): boolean => {
  const method = error?.config?.method?.toLowerCase()
  if (!method || !RETRYABLE_METHODS.has(method)) return false

  const status = error?.response?.status
  if (status && RETRYABLE_STATUS_CODES.has(status)) return true

  const code = error?.code
  return code === 'ECONNABORTED' || !error?.response
}

const getRetryDelay = (retryCount: number): number => 300 * Math.pow(2, retryCount)

apiConfigManager.addListener((config) => {
  api.defaults.baseURL = config.baseUrl
})

const isTauriRuntime = () => (
  typeof window !== 'undefined' &&
  ((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
)

// Interceptor de requisição
api.interceptors.request.use(
  async (config) => {
    if (isTauriRuntime() && !apiConfigManager.isReady()) {
      await apiConfigManager.waitForReady()
    }

    config.baseURL = apiConfigManager.getBaseUrl()
    // Adicionar ID da solicitação para rastreamento
    config.metadata = { startTime: Date.now() }
    return config
  },
  (error) => {
    errorHandler.handleError(error, 'RequestInterceptor')
    return Promise.reject(error)
  }
)

// Interceptor de resposta
api.interceptors.response.use(
  (response) => {
    // Registrar tempo de requisição
    if (response.config.metadata?.startTime) {
      const duration = Date.now() - response.config.metadata.startTime
      if (duration > 5000) { // Requisições com mais de 5 segundos
        console.warn(`Slow API request: ${response.config.url} took ${duration}ms`)
      }
    }
    
    return response.data
  },
  async (error) => {
    if (shouldRetry(error)) {
      const currentRetryCount = error.config?.metadata?.retryCount || 0
      if (currentRetryCount < MAX_RETRIES) {
        error.config.metadata = {
          ...(error.config.metadata || { startTime: Date.now() }),
          retryCount: currentRetryCount + 1,
        }
        await new Promise((resolve) => setTimeout(resolve, getRetryDelay(currentRetryCount)))
        return api.request(error.config)
      }
    }

    // Usar um manipulador de erros unificado
    errorHandler.handleError(error, 'API')
    
    // Manter a estrutura original do objeto de erro para garantir compatibilidade com versões anteriores
    if (error.response?.status === 429) {
      const message = error.response?.data?.detail || 'O sistema está processando outros projetos, tente novamente mais tarde'
      error.userMessage = message
    }
    else if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      error.userMessage = 'Tempo limite da solicitação, o projeto pode ainda estar sendo processado em segundo plano, verifique o status do projeto mais tarde'
    }
    else if (error.code === 'NETWORK_ERROR' || !error.response) {
      error.userMessage = 'Falha na conexão de rede, por favor, verifique sua conexão'
    }
    else if (error.response?.status >= 500) {
      error.userMessage = 'Erro interno do servidor, tente novamente mais tarde'
    }
    
    return Promise.reject(error)
  }
)

export interface UploadFilesRequest {
  video_file: File
  srt_file?: File
  project_name: string
  video_category?: string
}

export interface VideoCategory {
  value: string
  name: string
  description: string
  icon: string
  color: string
}

export interface VideoCategoriesResponse {
  categories: VideoCategory[]
  default_category: string
}

export interface ProcessingStatus {
  status: 'processing' | 'completed' | 'error'
  current_step: number
  total_steps: number
  step_name: string
  progress: number
  error_message?: string
}

// Espelha backend/schemas/clip.py ClipResponse — start_time/end_time/duration em SEGUNDOS
// (diferente do tipo Clip do useProjectStore, que traz strings "HH:MM:SS,mmm" da listagem legada).
export interface ClipDetail {
  id: string
  project_id: string
  title: string
  description?: string
  start_time?: number
  end_time?: number
  duration?: number
  score?: number
  status: string
  video_path?: string
  tags?: string[]
  clip_metadata?: Record<string, any>
  created_at: string
  updated_at: string
  collection_ids?: string[]
}

// Espelha backend/utils/subtitle_processor.py _process_subtitle_segment/_split_text_to_words —
// timestamps em segundos, já relativos ao início do clip (o endpoint desloca isso no backend).
export interface SubtitleWord {
  id: string
  text: string
  startTime: number
  endTime: number
}

export interface SubtitleSegment {
  id: string
  startTime: number
  endTime: number
  text: string
  index: number
  words: SubtitleWord[]
}

// Sincronização precisa de legendas (Whisper + alinhamento) — ver
// backend/services/subtitle_sync_service.py. "not_synced" = ainda usando a
// estimativa linear; "synced" = timestamps reais já persistidos e em uso.
export type SubtitleSyncStatus = 'not_synced' | 'syncing' | 'synced' | 'error'

// Espelha backend/api/v1/subtitle_editor.py SubtitleDataResponse
export interface SubtitleDataResponse {
  segments: SubtitleSegment[]
  total_duration: number
  word_count: number
  segment_count: number
  sync_status: SubtitleSyncStatus
  synced_at: string | null
  words: SubtitleWord[] | null
}

// Espelha backend/api/v1/subtitle_editor.py SubtitleSyncStartResponse/SubtitleSyncStatusResponse
export interface SubtitleSyncStartResponse {
  job_id: string
  status: string
}

export interface SubtitleSyncStatusResponse {
  status: 'analyzing_audio' | 'aligning_words' | 'synced' | 'error'
  progress: number
  error: string | null
  synced_at: string | null
  word_count: number | null
}

// Tipos de interface relacionados ao Bilibili
export interface BilibiliVideoInfo {
  title: string
  description: string
  duration: number
  uploader: string
  upload_date: string
  view_count: number
  like_count: number
  thumbnail: string
  url: string
}

export interface BilibiliDownloadRequest {
  url: string
  project_name: string
  video_category?: string
  browser?: string
  target_clip_seconds?: number
  clip_count?: number
}

export interface BilibiliDownloadTask {
  id: string
  url: string
  project_name: string
  video_category?: string
  browser?: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  error_message?: string
  video_info?: BilibiliVideoInfo
  project_id?: string
  created_at: string
  updated_at: string
}

// Definir API relacionada
export const settingsApi = {
  // Obter configuração do sistema
  getSettings: (): Promise<any> => {
    return api.get('/settings')
  },

  // Atualizar configuração do sistema
  updateSettings: (settings: any): Promise<any> => {
    return api.put('/settings/', settings)
  },

  // Testar chave de API
  testApiKey: (
    provider: string,
    apiKey: string,
    options: { baseUrl?: string; model?: string } = {}
  ): Promise<{ success: boolean; error?: string }> => {
    return api.post('/settings/test-api', { 
      provider, 
      api_key: apiKey,
      base_url: options.baseUrl,
      model: options.model,
    })
  },

  // Obter todos os modelos disponíveis
  getAvailableModels: (): Promise<any> => {
    return api.get('/settings/available-models')
  },

  // Obter informações do provedor atual
  getCurrentProvider: (): Promise<any> => {
    return api.get('/settings/current-provider')
  },

  // Lista de modelos realmente fornecidos por serviços locais compatíveis com OpenAI (Ollama / LM Studio / vLLM)
  listCompatibleModels: (
    params: { provider?: string; baseUrl?: string; apiKey?: string }
  ): Promise<{ reachable: boolean; base_url: string; models: string[]; error?: string }> => {
    return api.get('/settings/compatible-models', {
      params: { provider: params.provider, base_url: params.baseUrl, api_key: params.apiKey },
    })
  },

  // Verificar modo desktop
  checkDesktopMode: (): Promise<{ is_desktop_mode: boolean; environment: any }> => {
    return api.get('/settings/desktop-mode')
  }
}

// API relacionada ao projeto
export const projectApi = {
  // Obter configuração de categoria de vídeo
  getVideoCategories: async (): Promise<VideoCategoriesResponse> => {
    return api.get('/video-categories')
  },

  // Obter todos os itens
  getProjects: async (): Promise<Project[]> => {
    const response = await api.get('/projects/')
    // Processar a estrutura de resposta paginada, retornando o array de itens
    return (response as any).items || response || []
  },

  // Obter item único
  getProject: async (id: string): Promise<Project> => {
    return api.get(`/projects/${id}`)
  },

  // Carregar arquivo e criar projeto
  uploadFiles: async (data: UploadFilesRequest): Promise<Project> => {
    const formData = new FormData()
    formData.append('video_file', data.video_file)
    if (data.srt_file) {
      formData.append('srt_file', data.srt_file)
    }
    formData.append('project_name', data.project_name)
    if (data.video_category) {
      formData.append('video_category', data.video_category)
    }
    
    try {
      const project = await api.post<unknown, Project>('/projects/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      })
      trackVideoImported({
        source: 'upload',
        fileType: data.video_file?.type || undefined,
        sizeBytes: data.video_file?.size,
      })
      return project
    } catch (error: any) {
      trackProcessingFailed({
        stage: 'import',
        message: error?.message,
        code: error?.response?.status,
      })
      throw error
    }
  },

  // Excluir item
  deleteProject: async (id: string): Promise<void> => {
    await api.delete(`/projects/${id}`)
  },

  // Iniciar processamento de item
  startProcessing: async (id: string): Promise<void> => {
    await api.post(`/projects/${id}/process`)
  },

  // Retentar processamento do projeto
  retryProcessing: async (id: string): Promise<void> => {
    await api.post(`/projects/${id}/retry`)
  },

  // Obter status de processamento
  getProcessingStatus: async (id: string): Promise<ProcessingStatus> => {
    return api.get(`/projects/${id}/status`)
  },

  // Obter logs do projeto
  getProjectLogs: async (id: string, lines: number = 50): Promise<{logs: Array<{timestamp: string, module: string, level: string, message: string}>}> => {
    return api.get(`/projects/${id}/logs?lines=${lines}`)
  },

  // Obter clipes do projeto
  getClips: async (projectId: string): Promise<any[]> => {
    try {
      // Obter dados apenas do banco de dados, não mais retornar ao sistema de arquivos
      console.log('🔍 Calling clips API for project:', projectId)
      const response = await api.get(`/clips/?project_id=${projectId}`)
      console.log('📦 Raw API response:', response)
      const clips = (response as any).items || response || []
      console.log('📋 Extracted clips:', clips.length, 'clips found')
      
      // Converter o formato de dados do backend para o formato esperado pelo frontend
      const convertedClips = clips.map((clip: any) => {
        // Converter segundos para formato de string de tempo
        const formatSecondsToTime = (seconds: number) => {
          const hours = Math.floor(seconds / 3600)
          const minutes = Math.floor((seconds % 3600) / 60)
          const secs = Math.floor(seconds % 60)
          return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        }
        
        // Obter conteúdo dos metadados
        const metadata = clip.clip_metadata || {}
        
        return {
          id: clip.id,
          title: clip.title,
          generated_title: clip.title,
          start_time: formatSecondsToTime(clip.start_time),
          end_time: formatSecondsToTime(clip.end_time),
          duration: clip.duration || 0,
          final_score: clip.score || 0,
          recommend_reason: metadata.recommend_reason || '',
          outline: metadata.outline || '',
          // Usar apenas o content dos metadados, evitar usar description (que pode ser texto transcrito)
          content: metadata.content || [],
          chunk_index: metadata.chunk_index || 0
        }
      })
      
      console.log('✅ Converted clips:', convertedClips.length, 'clips')
      console.log('📄 First clip sample:', convertedClips[0])
      return convertedClips
    } catch (error) {
      console.error('❌ Failed to get clips:', error)
      return []
    }
  },

  // Obter coleção do projeto
  getCollections: async (projectId: string): Promise<any[]> => {
    try {
      // Obter dados apenas do banco de dados, não mais retornar ao sistema de arquivos
      const response = await api.get(`/collections/?project_id=${projectId}`)
      const collections = (response as any).items || response || []
      
      // Converter o formato de dados do backend para o formato esperado pelo frontend
      return collections.map((collection: any) => ({
        id: collection.id,
        collection_title: collection.name || collection.collection_title || '',
        collection_summary: collection.description || collection.collection_summary || '',
        clip_ids: collection.clip_ids || collection.metadata?.clip_ids || [],
        collection_type: collection.collection_type || 'ai_recommended',
        created_at: collection.created_at,
        project_id: collection.project_id,
        thumbnail_path: collection.thumbnail_path
      }))
    } catch (error) {
      console.error('Failed to get collections:', error)
      return []
    }
  },

  // Reiniciar etapa especificada
  restartStep: async (id: string, step: number): Promise<void> => {
    await api.post(`/projects/${id}/restart-step`, { step })
  },

  // Atualizar informações do clipe
  updateClip: (projectId: string, clipId: string, updates: Partial<Clip>): Promise<Clip> => {
    return api.patch(`/projects/${projectId}/clips/${clipId}`, updates)
  },

  // Atualizar título do clipe
  updateClipTitle: async (clipId: string, title: string): Promise<any> => {
    return api.patch(`/clips/${clipId}/title`, { title })
  },

  // Gerar título do clipe
  generateClipTitle: async (clipId: string): Promise<{clip_id: string, generated_title: string, success: boolean}> => {
    return api.post(`/clips/${clipId}/generate-title`)
  },

  // Criar coleção
  createCollection: (projectId: string, collectionData: { collection_title: string, collection_summary: string, clip_ids: string[] }): Promise<Collection> => {
    return api.post(`/collections/`, {
      project_id: projectId,
      name: collectionData.collection_title,
      description: collectionData.collection_summary,
      clip_ids: collectionData.clip_ids,
      collection_type: 'manual'
    })
  },

  // Atualizar informações da coleção
  updateCollection: (_projectId: string, collectionId: string, updates: Partial<Collection>): Promise<Collection> => {
    return api.put(`/collections/${collectionId}`, updates)
  },

  // Reordenar fatias da coleção
  reorderCollectionClips: (projectId: string, collectionId: string, clipIds: string[]): Promise<Collection> => {
    return api.patch(`/projects/${projectId}/collections/${collectionId}/reorder`, clipIds)
  },

  // Excluir coleção
  deleteCollection: (_projectId: string, collectionId: string): Promise<{message: string, deleted_collection: string}> => {
    return api.delete(`/collections/${collectionId}`)
  },

  // Gerar título da coleção
  generateCollectionTitle: (collectionId: string): Promise<{collection_id: string, generated_title: string, success: boolean}> => {
    return api.post(`/collections/${collectionId}/generate-title`)
  },

  // Atualizar título da coleção
  updateCollectionTitle: (collectionId: string, title: string): Promise<{collection_id: string, title: string, success: boolean}> => {
    return api.put(`/collections/${collectionId}/title`, { title })
  },

  // Baixar vídeo do clipe
  downloadClip: (_projectId: string, clipId: string): Promise<Blob> => {
    return api.get(`/files/projects/${_projectId}/clips/${clipId}`, {
      responseType: 'blob'
    })
  },

  // Baixar vídeo da coleção
  downloadCollection: (projectId: string, collectionId: string): Promise<Blob> => {
    return api.get(`/files/projects/${projectId}/collections/${collectionId}`, {
      responseType: 'blob'
    })
  },

  // Exportar metadados
  exportMetadata: (projectId: string): Promise<Blob> => {
    return api.get(`/projects/${projectId}/export`, {
      responseType: 'blob'
    })
  },

  // Gerar vídeo da coleção
  generateCollectionVideo: (projectId: string, collectionId: string) => {
    return api.post(`/projects/${projectId}/collections/${collectionId}/generate`)
  },

  downloadVideo: async (projectId: string, clipId?: string, collectionId?: string) => {
    let url = `/projects/${projectId}/download`
    if (clipId) {
      url += `?clip_id=${clipId}`
    } else if (collectionId) {
      url += `?collection_id=${collectionId}`
    }
    
    try {
      // Para respostas do tipo blob, é necessário usar axios diretamente, sem passar pelo interceptor
      const response = await axios.get(resolveApiUrl(`/api/v1${url}`), {
        responseType: 'blob',
        headers: {
          'Accept': 'application/octet-stream'
        }
      })
      
      // Obtém o nome do arquivo do cabeçalho da resposta, se não houver, usa o nome padrão
      const contentDisposition = response.headers['content-disposition']
      let filename = clipId ? `clip_${clipId}.mp4` : 
                     collectionId ? `collection_${collectionId}.mp4` : 
                     `project_${projectId}.mp4`
      
      if (contentDisposition) {
        // Tenta primeiro analisar o nome do arquivo no formato RFC 6266* Parâmetros
        const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/)
        if (filenameStarMatch) {
          filename = decodeURIComponent(filenameStarMatch[1])
        } else {
          // Reverter para o parâmetro filename tradicional
          const filenameMatch = contentDisposition.match(/filename="([^"]+)"/)
          if (filenameMatch) {
            filename = filenameMatch[1]
          }
        }
      }
      
      // Criar link de download
      const blob = new Blob([response.data], { type: 'video/mp4' })
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = filename
      
      // Acionar download
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)

      trackClipsExported({
        clipCount: 1,
        // Distinguir granularidade de exportação: clipe único / coleção / vídeo completo
        exportType: clipId ? 'clip' : collectionId ? 'collection' : 'project',
      })
      return response.data
    } catch (error: any) {
      console.error('Falha no download:', error)
      trackProcessingFailed({
        stage: 'export',
        message: error?.message,
        code: error?.response?.status,
      })
      throw error
    }
  },

  // Obter URL do arquivo do projeto
  getProjectFileUrl: (projectId: string, filename: string): string => {
    return `${api.defaults.baseURL}/projects/${projectId}/files/${filename}`
  },

  // Obter URL do vídeo do projeto
  getProjectVideoUrl: (projectId: string): string => {
    return `${api.defaults.baseURL}/projects/${projectId}/video`
  },

  // Obter URL do vídeo cortado
  getClipVideoUrl: (projectId: string, clipId: string, _clipTitle?: string): string => {
    // Usar a rota projects para obter vídeos fatiados
    return resolveApiUrl(`/api/v1/projects/${projectId}/clips/${clipId}`)
  },

  // Obter um clip específico (GET /clips/{clip_id}) — usado pelo Editor de Corte.
  getClipDetail: (clipId: string): Promise<ClipDetail> => {
    return api.get(`/clips/${clipId}`)
  },

  // Legendas do clip, já em granularidade de palavra e relativizadas ao tempo do
  // clip — reaproveita o endpoint existente do editor de legendas (subtitle_editor.py),
  // sem criar um novo processamento de SRT. 404 = corte sem legenda disponível (não é erro fatal).
  getClipSubtitles: (projectId: string, clipId: string): Promise<SubtitleDataResponse> => {
    return api.get(`/subtitle-editor/${projectId}/clips/${clipId}/subtitles`)
  },

  // Dispara a sincronização precisa (Whisper + alinhamento, roda em background no
  // backend) — devolve um job_id para consultar o progresso com getClipSubtitleSyncStatus.
  startClipSubtitleSync: (projectId: string, clipId: string): Promise<SubtitleSyncStartResponse> => {
    return api.post(`/subtitle-editor/${projectId}/clips/${clipId}/subtitles/sync`)
  },

  getClipSubtitleSyncStatus: (projectId: string, clipId: string, jobId: string): Promise<SubtitleSyncStatusResponse> => {
    return api.get(`/subtitle-editor/${projectId}/clips/${clipId}/subtitles/sync/${jobId}`)
  },

  // Obter URL do vídeo da coleção
  getCollectionVideoUrl: (projectId: string, collectionId: string): string => {
    // Usar a rota files para obter vídeos de coleção
    return resolveApiUrl(`/api/v1/files/projects/${projectId}/collections/${collectionId}`)
  },

  // Gerar miniatura do projeto
  generateThumbnail: async (projectId: string): Promise<{success: boolean, thumbnail: string, message: string}> => {
    return api.post(`/projects/${projectId}/generate-thumbnail`)
  },

  startClipExport: async (
    projectId: string,
    clipId: string,
    body: { preset: string; subtitles?: boolean; title_card?: boolean }
  ): Promise<{ ok: boolean; job_id: string; status: string }> => {
    return api.post(`/projects/${projectId}/clips/${clipId}/export`, body)
  },

  getExportJob: async (projectId: string, jobId: string): Promise<{
    job_id: string
    status: 'queued' | 'running' | 'completed' | 'failed'
    percent?: number
    error?: string
    result?: { path: string; title?: string; width?: number; height?: number; warnings?: string[] }
  }> => {
    return api.get(`/projects/${projectId}/exports/${jobId}`)
  },

  downloadExport: async (projectId: string, jobId: string) => {
    const response = await axios.get(resolveApiUrl(`/api/v1/projects/${projectId}/exports/${jobId}/download`), {
      responseType: 'blob',
      headers: { Accept: 'application/octet-stream' },
    })
    const cd = response.headers['content-disposition'] || ''
    let filename = `export_${jobId.slice(0, 8)}.mp4`
    const star = cd.match(/filename\*=UTF-8''([^;]+)/)
    const plain = cd.match(/filename="([^"]+)"/)
    if (star) filename = decodeURIComponent(star[1])
    else if (plain) filename = plain[1]
    const url = window.URL.createObjectURL(new Blob([response.data], { type: 'video/mp4' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  },
}

// APIs relacionadas ao download de vídeo
export const bilibiliApi = {
  // Analisar informações de vídeo do Bilibili
  parseVideoInfo: async (url: string, browser?: string): Promise<{success: boolean, video_info: BilibiliVideoInfo}> => {
    const formData = new FormData()
    formData.append('url', url)
    if (browser) {
      formData.append('browser', browser)
    }
    return api.post('/bilibili/parse', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Analisar informações do vídeo do YouTube
  parseYouTubeVideoInfo: async (url: string, browser?: string): Promise<{success: boolean, video_info: BilibiliVideoInfo}> => {
    const formData = new FormData()
    formData.append('url', url)
    if (browser) {
      formData.append('browser', browser)
    }
    return api.post('/youtube/parse', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },

  // Criar tarefa de download do Bilibili
  createDownloadTask: async (data: BilibiliDownloadRequest): Promise<BilibiliDownloadTask> => {
    const task = await api.post<unknown, BilibiliDownloadTask>('/bilibili/download', data)
    trackVideoImported({ source: 'url', fileType: 'bilibili' })
    return task
  },

  // Criar tarefa de download do YouTube
  createYouTubeDownloadTask: async (data: BilibiliDownloadRequest): Promise<BilibiliDownloadTask> => {
    const task = await api.post<unknown, BilibiliDownloadTask>('/youtube/download', data)
    trackVideoImported({ source: 'url', fileType: 'youtube' })
    return task
  },

  // Obter status da tarefa de download
  getTaskStatus: async (taskId: string): Promise<BilibiliDownloadTask> => {
    return api.get(`/bilibili/tasks/${taskId}`)
  },

  // Obter status da tarefa de download do YouTube
  getYouTubeTaskStatus: async (taskId: string): Promise<BilibiliDownloadTask> => {
    return api.get(`/youtube/tasks/${taskId}`)
  },

  // Obter todas as tarefas de download
  getAllTasks: async (): Promise<BilibiliDownloadTask[]> => {
    return api.get('/bilibili/tasks')
  },

  // Obter todas as tarefas de download do YouTube
  getAllYouTubeTasks: async (): Promise<BilibiliDownloadTask[]> => {
    return api.get('/youtube/tasks')
  }
}

export interface YouTubeCookiesStatus {
  configured: boolean
  source: 'env' | 'upload' | null
  updated_at: string | null
  cookie_count: number
  has_session_cookie: boolean
}

// Cookies do YouTube (arquivo cookies.txt de uma conta logada)
export const youtubeCookiesApi = {
  getStatus: async (): Promise<YouTubeCookiesStatus> => {
    return api.get('/youtube/cookies')
  },

  upload: async (file: File): Promise<YouTubeCookiesStatus & { message: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post('/youtube/cookies', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  remove: async (): Promise<YouTubeCookiesStatus & { message: string }> => {
    return api.delete('/youtube/cookies')
  },
}



// APIs relacionadas ao status do sistema
export const systemApi = {
  // Obter status do sistema
  getSystemStatus: (): Promise<{
    current_processing_count: number
    max_concurrent_processing: number
    total_projects: number
    processing_projects: string[]
  }> => {
    return api.get('/system/status')
  }
}

export interface WhisperRuntimeStatus {
  status: 'unknown' | 'not_installed' | 'installing' | 'installed' | 'error'
  progress: number
  message: string
  log_tail?: string
  platform_supported: boolean
  packages: string[]
}

export interface WhisperModel {
  name: string
  size: string
  sizeBytes: number
  description: string
  accuracy: string
  speed: string
  status: 'available' | 'downloading' | 'downloaded' | 'error' | 'not_found'
  downloadProgress?: number | null
  localPath?: string | null
  errorMessage?: string | null
}

// Reconhecimento de voz / Tempo de execução e gerenciamento de modelos do Whisper
export const speechApi = {
  getRuntimeStatus: (): Promise<WhisperRuntimeStatus> => api.get('/whisper/runtime-status'),
  installRuntime: (): Promise<{ started: boolean; message: string }> => api.post('/whisper/install'),
  uninstallRuntime: (): Promise<{ success: boolean; message: string }> => api.post('/whisper/uninstall'),
  getModels: (): Promise<WhisperModel[]> => api.get('/whisper-models'),
  downloadModel: (model: string): Promise<unknown> => api.post('/whisper-models/download', { model }),
  deleteModel: (model: string): Promise<unknown> => api.delete(`/whisper-models/${model}`),
}

export default api
