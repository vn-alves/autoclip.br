import { useEffect, useRef, useState } from 'react'
import { projectApi } from '../services/api'
import { Project, useProjectStore } from '../store/useProjectStore'

interface UseProjectPollingOptions {
  interval?: number // Intervalo de polling, padrão 10 segundos
  onProjectsUpdate?: (projects: Project[]) => void
  enabled?: boolean // Se a sondagem está ativada
}

export const useProjectPolling = ({
  interval = 30000, // Padrão 30 segundos, para reduzir solicitações frequentes
  onProjectsUpdate,
  enabled = true
}: UseProjectPollingOptions = {}) => {
  const [isPolling, setIsPolling] = useState(false)
  const intervalRef = useRef<number | null>(null)
  const [lastUpdateTime, setLastUpdateTime] = useState<number>(Date.now())

    const startPolling = () => {
    if (!enabled || intervalRef.current) return

    setIsPolling(true)
    
    const poll = async () => {
      try {
        // Obter o status isDragging em tempo real
        const currentIsDragging = useProjectStore.getState().isDragging
        
        // Se estiver arrastando, pular esta sondagem
        if (currentIsDragging) {
          console.log('Skipping poll: dragging in progress')
          return
        }
        
        console.log('Polling projects...')
        const projects = await projectApi.getProjects()
        console.log('Polled projects:', projects)
        
        // Garantir que projects seja um tipo de array
        const safeProjects = Array.isArray(projects) ? projects : []
        const hasProcessingProjects = safeProjects.some(p => p.status === 'processing')
        
        if (onProjectsUpdate) {
          console.log('Calling onProjectsUpdate with:', safeProjects)
          onProjectsUpdate(safeProjects)
        }
        
        setLastUpdateTime(Date.now())
        
        // Sondagem inteligente: se não houver projetos em processamento, aumente o intervalo de sondagem
        if (!hasProcessingProjects) {
          // Se não houver projetos ativos, a frequência de sondagem pode ser ainda mais reduzida
          console.log('Nenhum projeto ativo, a frequência de pesquisa será reduzida')
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }

    // Executar imediatamente
    poll()
    
    // Definir temporizador
    intervalRef.current = window.setInterval(poll, interval)
  }

  const stopPolling = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setIsPolling(false)
  }

  const refreshNow = async () => {
    try {
      const projects = await projectApi.getProjects()
      // Garantir que projects seja um tipo de array
      const safeProjects = Array.isArray(projects) ? projects : []
      if (onProjectsUpdate) {
        onProjectsUpdate(safeProjects)
      }
      setLastUpdateTime(Date.now())
      return safeProjects
    } catch (error) {
      console.error('Manual refresh error:', error)
      throw error
    }
  }

  useEffect(() => {
    if (enabled) {
      startPolling()
    } else {
      stopPolling()
    }

    return () => {
      stopPolling()
    }
  }, [enabled, interval])

  return {
    isPolling,
    lastUpdateTime,
    startPolling,
    stopPolling,
    refreshNow
  }
}

export default useProjectPolling