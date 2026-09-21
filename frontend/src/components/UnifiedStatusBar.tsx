/**
 * Componente de barra de status unificado - substitui o antigo sistema de progresso complexo
 * Suporta exibição unificada de status como baixando, processando, concluído
 */

import React, { useEffect, useState } from 'react'
import { Progress, Typography } from 'antd'
import { resolveApiUrl } from '../utils/apiConfig'
import { useSimpleProgressStore, getStageDisplayName, getStageColor, isCompleted, isFailed } from '../stores/useSimpleProgressStore'

const { Text } = Typography

interface UnifiedStatusBarProps {
  projectId: string
  status: string
  downloadProgress?: number
  onStatusChange?: (status: string) => void
  onDownloadProgressUpdate?: (progress: number) => void
}

export const UnifiedStatusBar: React.FC<UnifiedStatusBarProps> = ({
  projectId,
  status,
  downloadProgress = 0,
  onStatusChange,
  onDownloadProgressUpdate
}) => {
  const { getProgress, startPolling, stopPolling } = useSimpleProgressStore()
  const [isPolling, setIsPolling] = useState(false)
  const [currentDownloadProgress, setCurrentDownloadProgress] = useState(downloadProgress)
  
  const progress = getProgress(projectId)

  // Decidir se deve pesquisar com base no status
  useEffect(() => {
    // Se já houver progresso e o estado final for atingido, não iniciar o polling
    if (progress && (isCompleted(progress.stage) || isFailed(progress.message))) {
      if (isPolling) {
        console.log(`Progresso finalizado, parando pesquisa: ${projectId}`)
        stopPolling()
        setIsPolling(false)
      }
      return
    }

    if ((status === 'processing' || status === 'pending') && !isPolling) {
      console.log(`Iniciando pesquisa de progresso de processamento: ${projectId}`)
      startPolling([projectId], 5000) // Sondar a cada 5 segundos, reduzindo solicitações frequentes
      setIsPolling(true)
    } else if (status !== 'processing' && status !== 'pending' && isPolling) {
      console.log(`Parando pesquisa de progresso de processamento: ${projectId}`)
      stopPolling()
      setIsPolling(false)
    }

    return () => {
      if (isPolling) {
        console.log(`Limpar pesquisa: ${projectId}`)
        stopPolling()
        setIsPolling(false)
      }
    }
  }, [status, projectId, isPolling, startPolling, stopPolling, progress])

  // Pesquisa de progresso de download
  useEffect(() => {
    if (status === 'downloading') {
      const pollDownloadProgress = async () => {
        try {
          console.log(`Verificando progresso do download: ${projectId}`)
          const response = await fetch(resolveApiUrl(`/api/v1/projects/${projectId}`))
          if (response.ok) {
            const projectData = await response.json()
            console.log('Dados do projeto:', projectData)
            const newProgress = projectData.processing_config?.download_progress || 0
            console.log(`Atualização do progresso do download: ${newProgress}%`)
            setCurrentDownloadProgress(newProgress)
            onDownloadProgressUpdate?.(newProgress)
            
            // Se o download estiver concluído, verifica se precisa mudar para o status de processamento
            if (newProgress >= 100) {
              console.log('Download concluído, mudando para o status de processamento')
              setTimeout(() => {
                onStatusChange?.('processing')
              }, 1000)
            }
          } else {
            console.error('Falha ao obter dados do projeto:', response.status, response.statusText)
          }
        } catch (error) {
          console.error('Falha ao obter progresso de download:', error)
        }
      }

      // Obter uma vez imediatamente
      pollDownloadProgress()
      
      // Sondar a cada 5 segundos para reduzir solicitações frequentes
      const interval = setInterval(pollDownloadProgress, 5000)
      
      return () => clearInterval(interval)
    }
  }, [status, projectId, onDownloadProgressUpdate, onStatusChange])

  // Lidar com mudança de status
  useEffect(() => {
    if (progress) {
      // Quando o progresso atinge o estado final, parar imediatamente o polling e sincronizar o status
      if (isCompleted(progress.stage) || isFailed(progress.message)) {
        if (isPolling) {
          console.log(`Progresso atingiu o estado final, parando a pesquisa: ${projectId}`)
          stopPolling()
          setIsPolling(false)
        }
        if (onStatusChange) {
          onStatusChange(isFailed(progress.message) ? 'failed' : 'completed')
        }
      }
    }
  }, [progress, onStatusChange])

  // ===== Exibição de status Calm Premium (ver DESIGN.md)=====
  // Em andamento: linha de progresso fina + etiqueta + porcentagem mono à direita
  const ProgressRow = ({ label, percent }: { label: string; percent: number }) => (
    <div style={{ width: '100%' }}>
      <div style={{ height: 4, background: 'var(--ac-line)', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, percent))}%`, background: 'var(--ac-accent)', borderRadius: 999, transition: 'width .4s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 }}>
        <span style={{ color: 'var(--ac-sub)', fontSize: 12.5 }}>{label}</span>
        <span className="ac-mono" style={{ color: 'var(--ac-accent)', fontSize: 12.5 }}>{Math.round(percent)}%</span>
      </div>
    </div>
  )
  // Estado final: Ponto + Etiqueta
  const StatusRow = ({ label, dot, color }: { label: string; dot: string; color: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 4 + 9 + 12.5 + 2, minHeight: 26 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flex: '0 0 auto' }} />
      <span style={{ color, fontSize: 12.5 }}>{label}</span>
    </div>
  )

  if (status === 'importing') return <ProgressRow label="Importando" percent={downloadProgress} />
  if (status === 'downloading') return <ProgressRow label="Baixando" percent={currentDownloadProgress} />

  if (status === 'processing') {
    if (!progress) return <ProgressRow label="Inicializando" percent={0} />
    const { stage, percent, message } = progress
    if (isFailed(message)) return <StatusRow label="Falha no Processamento" dot="var(--ac-error)" color="var(--ac-error)" />
    return <ProgressRow label={getStageDisplayName(stage)} percent={percent} />
  }

  if (status === 'completed') return <StatusRow label="Concluído" dot="var(--ac-ok)" color="var(--ac-sub)" />
  if (status === 'failed') return <StatusRow label="Falha no Processamento" dot="var(--ac-error)" color="var(--ac-error)" />

  // Aguardando
  return <StatusRow label="Aguardando" dot="var(--ac-muted)" color="var(--ac-muted)" />
}

// Componente de barra de progresso simplificado - para exibição detalhada do progresso
interface SimpleProgressDisplayProps {
  projectId: string
  status: string
  showDetails?: boolean
}

export const SimpleProgressDisplay: React.FC<SimpleProgressDisplayProps> = ({
  projectId,
  status,
  showDetails = false
}) => {
  const { getProgress } = useSimpleProgressStore()
  const progress = getProgress(projectId)

  if (status !== 'processing' || !progress || !showDetails) {
    return null
  }

  const { stage, percent, message } = progress
  const stageColor = getStageColor(stage)

  return (
    <div style={{ marginTop: '8px' }}>
      <Progress
        percent={percent}
        strokeColor={stageColor}
        showInfo={true}
        size="small"
        format={(percent) => `${percent}%`}
      />
      {message && (
        <Text type="secondary" style={{ fontSize: '11px', display: 'block', marginTop: '4px' }}>
          {message}
        </Text>
      )}
    </div>
  )
}
