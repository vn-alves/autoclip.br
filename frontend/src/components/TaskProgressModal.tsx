import React, { useState, useEffect } from 'react'
import { Modal, Steps, Progress, Typography, Button, Alert, Space, Spin } from 'antd'
import { 
  CheckCircleOutlined, 
  LoadingOutlined, 
  ExclamationCircleOutlined, 
  ReloadOutlined
} from '@ant-design/icons'
import { projectApi } from '../services/api'
import { useProjectStore } from '../store/useProjectStore'

const { Text } = Typography
const { Step } = Steps

interface ProcessingStatus {
  status: 'processing' | 'completed' | 'error'
  current_step: number
  total_steps: number
  step_name: string
  progress: number
  error_message?: string
}

interface TaskProgressModalProps {
  visible: boolean
  projectId: string | null
  onClose: () => void
  onComplete?: (projectId: string) => void
}

const TaskProgressModal: React.FC<TaskProgressModalProps> = ({
  visible,
  projectId,
  onClose,
  onComplete
}) => {
  const [status, setStatus] = useState<ProcessingStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const { updateProject } = useProjectStore()

  const steps = [
    { title: 'Extração de Tópicos', description: 'Extrair um esboço estrutural do texto transcrito do vídeo' },
    { title: 'Localização Temporal', description: 'Localizar intervalos de tempo de tópicos com base em legendas SRT' },
    { title: 'Pontuação de Conteúdo', description: 'Avaliar a qualidade do clipe e o potencial de disseminação em múltiplas dimensões' },
    { title: 'Geração de Título', description: 'Gerar títulos atraentes para clipes de alta pontuação' },
    { title: 'Agrupamento de Temas', description: 'Agrupar fragmentos relacionados em coleções recomendadas' },
    { title: 'Corte de Vídeo', description: 'Usar FFmpeg para gerar clipes e vídeos de coleção' }
  ]

  useEffect(() => {
    if (!visible || !projectId) {
      setStatus(null)
      return
    }

    const checkStatus = async () => {
      try {
        const statusData = await projectApi.getProcessingStatus(projectId)
        setStatus(statusData)
        
        // Atualizar status do projeto
        updateProject(projectId, {
          status: statusData.status,
          current_step: statusData.current_step,
          total_steps: statusData.total_steps,
          error_message: statusData.error_message
        })
        
        // Se o processamento estiver concluído, notificar o componente pai
        if (statusData.status === 'completed') {
          onComplete?.(projectId)
        }
      } catch (error) {
        console.error('Check status error:', error)
      }
    }

    // Verificar o status imediatamente
    checkStatus()
    
    // Se a tarefa ainda estiver em andamento, verificar o status periodicamente
    const interval = setInterval(checkStatus, 2000)
    
    return () => clearInterval(interval)
  }, [visible, projectId, updateProject, onComplete])

  const handleRetry = async () => {
    if (!projectId) return
    
    setLoading(true)
    try {
      if (status?.current_step !== undefined) {
        // Tentar novamente a partir da etapa atual
        await projectApi.restartStep(projectId, status.current_step)
      } else {
        // Tentar novamente completamente
        await projectApi.retryProcessing(projectId)
      }
      // Reiniciar verificação de status
      setStatus(null)
    } catch (error) {
      console.error('Retry error:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStepStatus = (stepIndex: number) => {
    if (!status) return 'wait'
    
    if (status.status === 'error' && stepIndex === status.current_step) {
      return 'error'
    }
    
    if (stepIndex < status.current_step) {
      return 'finish'
    }
    
    if (stepIndex === status.current_step) {
      return status.status === 'completed' ? 'finish' : 'process'
    }
    
    return 'wait'
  }

  const getStepIcon = (stepIndex: number) => {
    const stepStatus = getStepStatus(stepIndex)
    
    if (stepStatus === 'error') {
      return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
    }
    
    if (stepStatus === 'finish') {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />
    }
    
    if (stepStatus === 'process') {
      return <LoadingOutlined style={{ color: '#1890ff' }} />
    }
    
    return null
  }

  return (
    <Modal
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <LoadingOutlined style={{ color: '#1890ff' }} />
          <span>Progresso do processamento da tarefa</span>
        </div>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="close" onClick={onClose}>
          Fechar
        </Button>,
        ...(status?.status === 'error' ? [
          <Button 
            key="retry" 
            type="primary" 
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={handleRetry}
          >
            Tentar novamente a partir da etapa atual
          </Button>
        ] : [])
      ]}
      width={600}
      centered
      maskClosable={false}
      destroyOnClose
    >
      <div style={{ padding: '16px 0' }}>
        {!status ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: '16px', color: '#666' }}>
              Obtendo status da tarefa...
            </div>
          </div>
        ) : (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {/* Progresso Geral */}
            <div>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: '8px'
              }}>
                <Text strong>Progresso Geral</Text>
                <Text type="secondary">
                  {status.current_step}/{status.total_steps} Passos
                </Text>
              </div>
              <Progress 
                percent={Math.round((status.current_step / status.total_steps) * 100)}
                status={status.status === 'error' ? 'exception' : 'active'}
                strokeColor={{
                  '0%': '#4facfe',
                  '100%': '#00f2fe'
                }}
              />
            </div>

            {/* Informações da etapa atual */}
            <div style={{
              background: '#f8f9fa',
              padding: '16px',
              borderRadius: '8px',
              border: '1px solid #e9ecef'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                {getStepIcon(status.current_step)}
                <Text strong>Etapa atual: {status.step_name}</Text>
              </div>
              <Progress 
                percent={status.progress}
                size="small"
                status={status.status === 'error' ? 'exception' : 'active'}
              />
            </div>

            {/* Mensagem de erro */}
            {status.status === 'error' && status.error_message && (
              <Alert
                message="Falha no Processamento"
                description={status.error_message}
                type="error"
                showIcon
              />
            )}

            {/* Lista de Etapas */}
            <div>
              <Text strong style={{ marginBottom: '16px', display: 'block' }}>Etapa de Processamento</Text>
              <Steps
                direction="vertical"
                size="small"
                current={status.current_step}
                status={status.status === 'error' ? 'error' : 'process'}
              >
                {steps.map((step, index) => (
                  <Step
                    key={index}
                    title={step.title}
                    description={step.description}
                    status={getStepStatus(index)}
                    icon={getStepIcon(index)}
                  />
                ))}
              </Steps>
            </div>

            {/* Dica de Conclusão */}
            {status.status === 'completed' && (
              <Alert
                message="Processamento Concluído"
                description="O vídeo foi processado com sucesso, você pode visualizar os clipes e coleções gerados."
                type="success"
                showIcon
              />
            )}
          </Space>
        )}
      </div>
    </Modal>
  )
}

export default TaskProgressModal