/**
 * Componente de cartão de projeto simplificado - integra novo sistema de progresso
 */

import React, { useState, useEffect } from 'react'
import { Card, Typography, Space, Button, Tag, Tooltip, Modal, message } from 'antd'
import { 
  PlayCircleOutlined, 
  EyeOutlined, 
  DeleteOutlined, 
  ReloadOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { SimpleProgressBar } from './SimpleProgressBar'
import { 
  useSimpleProgressStore, 
  isCompleted, 
  isFailed,
  SimpleProgress 
} from '../stores/useSimpleProgressStore'

const { Title, Text } = Typography

interface Project {
  id: string
  title: string
  description?: string
  status: string
  created_at: string
  updated_at: string
  video_path?: string
  srt_path?: string
  category?: string
}

interface SimpleProjectCardProps {
  project: Project
  onStartProcessing?: (projectId: string) => void
  onViewDetails?: (projectId: string) => void
  onDelete?: (projectId: string) => void
  onRetry?: (projectId: string) => void
}

export const SimpleProjectCard: React.FC<SimpleProjectCardProps> = ({
  project,
  onStartProcessing,
  onViewDetails,
  onDelete,
  onRetry
}) => {
  const navigate = useNavigate()
  const { getProgress, startPolling, stopPolling } = useSimpleProgressStore()
  const [showProgress, setShowProgress] = useState(false)
  
  const progress = getProgress(project.id)

  // Decidir se exibe o progresso com base no status do projeto
  useEffect(() => {
    if (project.status === 'processing') {
      setShowProgress(true)
      // Começar a sondar o progresso deste projeto
      startPolling([project.id], 2000)
    } else {
      setShowProgress(false)
      stopPolling()
    }
  }, [project.status, project.id, startPolling, stopPolling])

  const handleStartProcessing = () => {
    if (onStartProcessing) {
      onStartProcessing(project.id)
    }
  }

  const handleViewDetails = () => {
    if (onViewDetails) {
      onViewDetails(project.id)
    } else {
      navigate(`/project/${project.id}`)
    }
  }

  const handleDelete = () => {
    Modal.confirm({
      title: 'Confirmar Exclusão',
      content: `Tem certeza de que deseja excluir o item "${project.title}" ? Esta operação é irreversível.`,
      okText: 'Excluir',
      okType: 'danger',
      cancelText: 'Cancelar',
      onOk: () => {
        if (onDelete) {
          onDelete(project.id)
        }
      }
    })
  }

  const handleRetry = () => {
    if (onRetry) {
      onRetry(project.id)
    }
  }

  // Obter ícone e cor do status
  const getStatusConfig = (status: string, progress?: SimpleProgress) => {
    if (progress && isFailed(progress.message)) {
      return {
        icon: <ExclamationCircleOutlined />,
        color: '#ff4d4f',
        text: 'Falha no Processamento'
      }
    }
    
    if (progress && isCompleted(progress.stage)) {
      return {
        icon: <CheckCircleOutlined />,
        color: '#52c41a',
        text: 'Processamento Concluído'
      }
    }
    
    if (status === 'processing' || (progress && !isCompleted(progress.stage))) {
      return {
        icon: <ReloadOutlined spin />,
        color: '#1890ff',
        text: 'Processando'
      }
    }
    
    return {
      icon: <PlayCircleOutlined />,
      color: '#666666',
      text: 'Aguardando Processamento'
    }
  }

  const statusConfig = getStatusConfig(project.status, progress || undefined)
  const canStart = project.status === 'pending' || project.status === 'failed'
  const canRetry = project.status === 'failed' || (progress && isFailed(progress.message))

  return (
    <Card
      hoverable
      style={{ margin: '8px 0' }}
      actions={[
        canStart && (
          <Tooltip title="Iniciar Processamento">
            <Button 
              type="primary" 
              icon={<PlayCircleOutlined />}
              onClick={handleStartProcessing}
            >
              Iniciar Processamento
            </Button>
          </Tooltip>
        ),
        canRetry && (
          <Tooltip title="Tentar Novamente">
            <Button 
              icon={<ReloadOutlined />}
              onClick={handleRetry}
            >
              Tentar Novamente
            </Button>
          </Tooltip>
        ),
        <Tooltip title="Ver Detalhes">
          <Button 
            icon={<EyeOutlined />}
            onClick={handleViewDetails}
          >
            Ver Detalhes
          </Button>
        </Tooltip>,
        <Tooltip title="Excluir Projeto">
          <Button 
            danger 
            icon={<DeleteOutlined />}
            onClick={handleDelete}
          >
            Excluir
          </Button>
        </Tooltip>
      ].filter(Boolean)}
    >
      <Space direction="vertical" style={{ width: '100%' }}>
        {/* Título e status do item */}
        <Space align="center" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Title level={5} style={{ margin: 0, flex: 1 }}>
            {project.title}
          </Title>
          <Tag 
            color={statusConfig.color} 
            icon={statusConfig.icon}
            style={{ margin: 0 }}
          >
            {statusConfig.text}
          </Tag>
        </Space>

        {/* Descrição do Projeto */}
        {project.description && (
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {project.description}
          </Text>
        )}

        {/* Tags de Categoria */}
        {project.category && (
          <Tag color="blue" style={{ fontSize: '11px' }}>
            {project.category}
          </Tag>
        )}

        {/* Barra de progresso */}
        {showProgress && (
          <SimpleProgressBar
            projectId={project.id}
            autoStart={false} // Já tratado em useEffect
            showDetails={true}
            onProgressUpdate={(progress) => {
              // Se o processamento estiver concluído, atualizar o status de exibição
              if (isCompleted(progress.stage)) {
                setShowProgress(false)
                message.success('Processamento do item concluído!')
              } else if (isFailed(progress.message)) {
                message.error('Falha no processamento do item!')
              }
            }}
          />
        )}

        {/* Informações de Tempo */}
        <Space style={{ fontSize: '11px', color: '#999' }}>
          <Text type="secondary">
            Criado: {new Date(project.created_at).toLocaleDateString()}
          </Text>
          <Text type="secondary">
            Atualizado: {new Date(project.updated_at).toLocaleDateString()}
          </Text>
        </Space>
      </Space>
    </Card>
  )
}
