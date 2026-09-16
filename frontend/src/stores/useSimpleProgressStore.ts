/**
 * Gerenciamento simplificado do status de progresso - baseado em fases fixas e sondagem
 */

import { create } from 'zustand'

export interface SimpleProgress {
  project_id: string
  stage: string
  percent: number
  message: string
  ts: number
}

interface SimpleProgressState {
  // Dados de status
  byId: Record<string, SimpleProgress>
  
  // Controle de polling
  pollingInterval: number | null
  isPolling: boolean
  
  // Métodos de operação
  upsert: (progress: SimpleProgress) => void
  startPolling: (projectIds: string[], intervalMs?: number) => void
  stopPolling: () => void
  clearProgress: (projectId: string) => void
  clearAllProgress: () => void
  
  // Obter método
  getProgress: (projectId: string) => SimpleProgress | null
  getAllProgress: () => Record<string, SimpleProgress>
}

export const useSimpleProgressStore = create<SimpleProgressState>((set, get) => {
  let timer: number | null = null

  return {
    // Estado inicial
    byId: {},
    pollingInterval: null,
    isPolling: false,

    // Atualizar ou inserir dados de progresso
    upsert: (progress: SimpleProgress) => {
      set((state) => ({
        byId: {
          ...state.byId,
          [progress.project_id]: progress
        }
      }))
    },

    // Iniciar pesquisa
    startPolling: (projectIds: string[], intervalMs: number = 5000) => {
      const { stopPolling, isPolling } = get()
      
      // Se já estiver pesquisando, pare primeiro
      if (isPolling) {
        stopPolling()
      }

      if (projectIds.length === 0) {
        console.warn('Sem ID do projeto, pular pesquisa')
        return
      }

      console.log(`Iniciar progresso da pesquisa: ${projectIds.join(', ')}`)

      // Obter uma vez imediatamente
      const fetchSnapshots = async () => {
        try {
          const queryString = projectIds.map(id => `project_ids=${id}`).join('&')
          const response = await fetch(`/api/v1/simple-progress/snapshot?${queryString}`)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          const snapshots: SimpleProgress[] = await response.json()
          
          // Atualizar status
          snapshots.forEach(snapshot => {
            console.log(`Atualizar progresso: ${snapshot.project_id} - ${snapshot.stage} (${snapshot.percent}%)`)
            get().upsert(snapshot)
          })
          
          console.log(`Atualização de pesquisa: ${snapshots.length} projetos`)
          
          // Se não houver progresso, ou todos os projetos atingiram o estado final, o polling é automaticamente interrompido
          try {
            const allTerminal = snapshots.length > 0 && snapshots.every(s => {
              return isCompleted(s.stage) || isFailed(s.message)
            })
            // Parar de sondar apenas quando houver progresso e todos os itens estiverem concluídos
            // Se snapshots.length === 0, indica que o projeto pode estar pendente e a sondagem não deve ser interrompida
            if (snapshots.length > 0 && allTerminal) {
              console.log('Todos os projetos concluídos, pesquisa interrompida automaticamente')
              get().stopPolling()
            } else if (snapshots.length === 0) {
              console.log('O projeto pode ainda estar pendente, continuando o polling para aguardar')
            }
          } catch (e) {
            // Captura protetora para evitar afetar a lógica de polling subsequente
            console.warn('Problema ao detectar o estado final, mas não afeta a execução contínua:', e)
          }
          
        } catch (error) {
          console.error('Falha no progresso da pesquisa:', error)
        }
      }

      // Executar imediatamente
      fetchSnapshots()

      // Definir temporizador
      timer = window.setInterval(fetchSnapshots, intervalMs)

      set({
        isPolling: true,
        pollingInterval: intervalMs
      })
    },

    // Parar polling
    stopPolling: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
      
      set({
        isPolling: false,
        pollingInterval: null
      })
      
      console.log('Parar pesquisa de progresso')
    },

    // Limpar progresso de um único projeto
    clearProgress: (projectId: string) => {
      set((state) => {
        const newById = { ...state.byId }
        delete newById[projectId]
        return { byId: newById }
      })
    },

    // Limpar todo o progresso
    clearAllProgress: () => {
      set({ byId: {} })
    },

    // Obter progresso de um único projeto
    getProgress: (projectId: string) => {
      return get().byId[projectId] || null
    },

    // Obter todo o progresso
    getAllProgress: () => {
      return get().byId
    }
  }
})

// Mapeamento de nome de exibição de fase
export const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'INGEST': 'Preparação de material',
  'SUBTITLE': 'Processamento de legendas',
  'ANALYZE': 'Análise de Conteúdo', 
  'HIGHLIGHT': 'Localização de clipe',
  'EXPORT': 'Exportar vídeo',
  'DONE': 'Processamento Concluído'
}

// Mapeamento de cores de fases
export const STAGE_COLORS: Record<string, string> = {
  'INGEST': '#1890ff',      // Azul
  'SUBTITLE': '#52c41a',    // Verde
  'ANALYZE': '#fa8c16',     // Laranja
  'HIGHLIGHT': '#722ed1',   // Roxo
  'EXPORT': '#eb2f96',      // Rosa
  'DONE': '#13c2c2'         // Ciano
}

// Obter nome de exibição da fase
export const getStageDisplayName = (stage: string): string => {
  return STAGE_DISPLAY_NAMES[stage] || stage
}

// Obter cor da fase
export const getStageColor = (stage: string): string => {
  return STAGE_COLORS[stage] || '#666666'
}

// Determinar se o status é concluído
export const isCompleted = (stage: string): boolean => {
  return stage === 'DONE'
}

// Determinar se o status é falha
export const isFailed = (message: string): boolean => {
  return message.includes('Falha') || message.includes('Erro') || message.includes('Falha')
}
