/**
 * Componente de barra de progresso simplificado - baseado em fases fixas
 */

import React, { useEffect } from 'react'
import { Progress, Card, Typography, Space, Tag } from 'antd'
import { 
  useSimpleProgressStore, 
  getStageDisplayName, 
  getStageColor, 
  isCompleted, 
  isFailed,
  SimpleProgress 
} from '../stores/useSimpleProgressStore'

const { Text } = Typography

interface SimpleProgressBarProps {
  projectId: string
  autoStart?: boolean
  pollingInterval?: number
  showDetails?: boolean
  onProgressUpdate?: (progress: SimpleProgress) => void
}

export const SimpleProgressBar: React.FC<SimpleProgressBarProps> = ({
  projectId,
  autoStart = true,
  pollingInterval = 2000,
  showDetails = true,
  onProgressUpdate
}) => {
  const { 
    getProgress, 
    startPolling, 
    stopPolling
  } = useSimpleProgressStore()

  const progress = getProgress(projectId)

  // Iniciar pesquisa automaticamente
  useEffect(() => {
    if (autoStart && projectId) {
      startPolling([projectId], pollingInterval)
      
      return () => {
        stopPolling()
      }
    }
  }, [projectId, autoStart, pollingInterval, startPolling, stopPolling])

  // Notificar o componente pai sobre a atualização de progresso
  useEffect(() => {
    if (progress && onProgressUpdate) {
      onProgressUpdate(progress)
    }
  }, [progress, onProgressUpdate])

  // Se não houver dados de progresso, exibir status de espera
  if (!progress) {
    return (
      <Card size="small" style={{ margin: '8px 0' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Text type="secondary">Aguardando para iniciar o processamento...</Text>
          <Progress 
            percent={0} 
            status="active" 
            strokeColor="#1890ff"
            showInfo={false}
          />
        </Space>
      </Card>
    )
  }

  const { stage, percent, message, ts } = progress
  const stageDisplayName = getStageDisplayName(stage)
  const stageColor = getStageColor(stage)
  const completed = isCompleted(stage)
  const failed = isFailed(message)

  // Determinar o status da barra de progresso
  let progressStatus: 'normal' | 'active' | 'success' | 'exception' = 'normal'
  if (failed) {
    progressStatus = 'exception'
  } else if (completed) {
    progressStatus = 'success'
  } else if (percent > 0) {
    progressStatus = 'active'
  }

  return (
    <Card size="small" style={{ margin: '8px 0' }}>
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* Etapa e progresso */}
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Tag color={stageColor} style={{ margin: 0 }}>
            {stageDisplayName}
          </Tag>
          <Text strong style={{ color: stageColor }}>
            {percent}%
          </Text>
        </Space>

        {/* Barra de progresso */}
        <Progress
          percent={percent}
          status={progressStatus}
          strokeColor={stageColor}
          showInfo={false}
          size="small"
        />

        {/* Detalhes */}
        {showDetails && message && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {message}
          </Text>
        )}

        {/* Timestamp */}
        {showDetails && ts > 0 && (
          <Text type="secondary" style={{ fontSize: '11px' }}>
            Hora da atualização: {new Date(ts * 1000).toLocaleTimeString()}
          </Text>
        )}
      </Space>
    </Card>
  )
}

// Componente de exibição de progresso em lote
interface BatchProgressBarProps {
  projectIds: string[]
  autoStart?: boolean
  pollingInterval?: number
  showDetails?: boolean
  onProgressUpdate?: (projectId: string, progress: SimpleProgress) => void
}

export const BatchProgressBar: React.FC<BatchProgressBarProps> = ({
  projectIds,
  autoStart = true,
  pollingInterval = 2000,
  showDetails = true,
  onProgressUpdate
}) => {
  const { 
    getAllProgress, 
    startPolling, 
    stopPolling
  } = useSimpleProgressStore()

  const allProgress = getAllProgress()

  // Iniciar pesquisa automaticamente
  useEffect(() => {
    if (autoStart && projectIds.length > 0) {
      startPolling(projectIds, pollingInterval)
      
      return () => {
        stopPolling()
      }
    }
  }, [projectIds, autoStart, pollingInterval, startPolling, stopPolling])

  // Notificar o componente pai sobre a atualização de progresso
  useEffect(() => {
    if (onProgressUpdate) {
      projectIds.forEach(projectId => {
        const progress = allProgress[projectId]
        if (progress) {
          onProgressUpdate(projectId, progress)
        }
      })
    }
  }, [allProgress, projectIds, onProgressUpdate])

  return (
    <div>
      {projectIds.map(projectId => (
        <SimpleProgressBar
          key={projectId}
          projectId={projectId}
          autoStart={false} // Não iniciar automaticamente no modo em lote
          showDetails={showDetails}
          onProgressUpdate={(progress) => onProgressUpdate?.(projectId, progress)}
        />
      ))}
    </div>
  )
}
