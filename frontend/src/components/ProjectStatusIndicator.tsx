import React from 'react'
import { Badge, Tooltip } from 'antd'
import { Project } from '../store/useProjectStore'
// import { 
//   getProjectStatusConfig, 
//   normalizeProjectStatus 
// } from '../utils/statusUtils'

interface ProjectStatusIndicatorProps {
  project: Project
  showProgress?: boolean
  size?: 'small' | 'default' | 'large'
}

const ProjectStatusIndicator: React.FC<ProjectStatusIndicatorProps> = ({
  project,
  size = 'default'
}) => {
  // Usar tratamento de status simples temporariamente
  const normalizedStatus = project.status === 'error' ? 'failed' : project.status

  const getStepName = () => {
    if (normalizedStatus === 'processing' && project.current_step) {
      const stepNames = {
        1: 'Análise do esboço do conteúdo',
        2: 'Geração de linha do tempo',
        3: 'Avaliação de Clipe',
        4: 'Geração de Título',
        5: 'Agrupamento de Temas',
        6: 'Geração de Vídeo'
      }
      return stepNames[project.current_step as keyof typeof stepNames] || 'Processando'
    }
    return 'Processando'
  }

  const getStatusConfig = () => {
    switch (normalizedStatus) {
      case 'processing':
        return { text: 'Processando', badgeStatus: 'processing' as const, color: '#1890ff' }
      case 'completed':
        return { text: 'Concluído', badgeStatus: 'success' as const, color: '#52c41a' }
      case 'failed':
        return { text: 'Falha', badgeStatus: 'error' as const, color: '#ff4d4f' }
      default:
        return { text: 'Desconhecido', badgeStatus: 'default' as const, color: '#d9d9d9' }
    }
  }

  const config = getStatusConfig()

  if (size === 'small') {
    return (
      <Tooltip title={getStepName()}>
        <Badge status={config.badgeStatus} text={config.text} />
      </Tooltip>
    )
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: `${config.color}15`,
      border: `1px solid ${config.color}30`,
      color: config.color,
      fontSize: '12px',
      fontWeight: 500,
      minHeight: '24px'
    }}>
      <span style={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>
        {config.text}
      </span>
      <span>{config.text}</span>
    </div>
  )
}

export default ProjectStatusIndicator