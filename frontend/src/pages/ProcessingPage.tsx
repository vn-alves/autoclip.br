import React, { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Layout, Card, Progress, Steps, Typography, Button, Alert, Space, Spin, message } from 'antd'
import { CheckCircleOutlined, LoadingOutlined, ExclamationCircleOutlined, ArrowLeftOutlined } from '@ant-design/icons'
import { projectApi } from '../services/api'
import { useProjectStore } from '../store/useProjectStore'

const { Content } = Layout
const { Title, Text } = Typography
const { Step } = Steps

interface ProcessingStatus {
  status: 'processing' | 'completed' | 'error'
  current_step: number
  total_steps: number
  step_name: string
  progress: number
  error_message?: string
}

const ProcessingPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentProject, setCurrentProject } = useProjectStore()
  const [status, setStatus] = useState<ProcessingStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const steps = [
    { title: 'Extração de Tópicos', description: 'Extrair um esboço estrutural do texto transcrito do vídeo' },
    { title: 'Localização Temporal', description: 'Localizar intervalos de tempo de tópicos com base em legendas SRT' },
    { title: 'Pontuação de Conteúdo', description: 'Avaliar a qualidade do clipe e o potencial de disseminação em múltiplas dimensões' },
    { title: 'Geração de Título', description: 'Gerar títulos atraentes para clipes de alta pontuação' },
    { title: 'Agrupamento de Temas', description: 'Agrupar fragmentos relacionados em coleções recomendadas' },
    { title: 'Corte de Vídeo', description: 'Usar FFmpeg para gerar clipes e vídeos de coleção' }
  ]

  useEffect(() => {
    if (!id) return
    
    loadProject()
    const interval = setInterval(checkStatus, 2000) // Verifica o status a cada 2 segundos
    
    return () => clearInterval(interval)
  }, [id])

  const loadProject = async () => {
    if (!id) return
    
    try {
      const project = await projectApi.getProject(id)
      setCurrentProject(project)
      
      // Se o projeto estiver concluído, ir diretamente para a página de detalhes
      if (project.status === 'completed') {
        navigate(`/project/${id}`)
        return
      }
      
      // Se o status do projeto for 'aguardando processamento', iniciar o processamento
      if (project.status === 'pending') {
        await startProcessing()
      }
    } catch (error) {
      message.error('Falha ao carregar projeto')
      console.error('Load project error:', error)
    } finally {
      setLoading(false)
    }
  }

  const startProcessing = async () => {
    if (!id) return
    
    try {
      await projectApi.startProcessing(id)
      message.success('Iniciar processamento do projeto')
    } catch (error) {
      message.error('Falha ao iniciar processamento')
      console.error('Start processing error:', error)
    }
  }

  const checkStatus = async () => {
    if (!id) return
    
    try {
      const statusData = await projectApi.getProcessingStatus(id)
      setStatus(statusData)
      
      // Se o processamento for concluído, ir para a página de detalhes do projeto
      if (statusData.status === 'completed') {
        message.success('🎉 Processamento de vídeo concluído! Redirecionando para a página de resultados...')
        setTimeout(() => {
          navigate(`/project/${id}`)
        }, 2000)
      }
      
      // Se o processamento falhar, exibir informações detalhadas do erro
      if (statusData.status === 'error') {
        const errorMsg = statusData.error_message || 'Ocorreu um erro desconhecido durante o processamento'
        message.error(`Falha no processamento: ${errorMsg}`)
        
        // Oferecer opção de tentar novamente
        message.info('Você pode retornar à página inicial para reenviar o arquivo ou entrar em contato com o suporte técnico', 5)
      }
      
    } catch (error: any) {
      console.error('Check status error:', error)
      
      // Fornecer sugestões de tratamento diferentes com base no tipo de erro
      if (error.response?.status === 404) {
        message.error('Projeto não existe ou foi excluído')
        setTimeout(() => navigate('/'), 2000)
      } else if (error.code === 'ECONNABORTED') {
        message.warning('Tempo limite da conexão de rede, tentando novamente...')
      } else {
        message.error('Falha ao obter o status do processamento, atualize a página e tente novamente')
      }
    }
  }

  const getStepStatus = (stepIndex: number) => {
    if (!status) return 'wait'
    
    if (status.status === 'error') {
      return stepIndex < status.current_step ? 'finish' : 'error'
    }
    
    if (stepIndex < status.current_step) return 'finish'
    if (stepIndex === status.current_step) return 'process'
    return 'wait'
  }

  const getStepIcon = (stepIndex: number) => {
    const stepStatus = getStepStatus(stepIndex)
    
    if (stepStatus === 'finish') return <CheckCircleOutlined />
    if (stepStatus === 'process') return <LoadingOutlined />
    if (stepStatus === 'error') return <ExclamationCircleOutlined />
    return null
  }

  if (loading) {
    return (
      <Content style={{ padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <Spin size="large" tip="Carregando..." />
      </Content>
    )
  }

  return (
    <Content style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto' }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Title level={2}>Progresso do processamento de vídeo</Title>
          <Button 
            icon={<ArrowLeftOutlined />} 
            onClick={() => navigate('/')}
          >
            Voltar ao Início
          </Button>
        </div>

        {currentProject && (
          <Card>
            <Title level={4}>{currentProject.name}</Title>
            <Text type="secondary">ID do projeto: {currentProject.id}</Text>
          </Card>
        )}

        {status?.status === 'error' && (
          <Alert
            message="Falha no Processamento"
            description={
              <div>
                <p>{status.error_message || 'Ocorreu um erro desconhecido durante o processamento'}</p>
                <p style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                  Possíveis causas: formato de arquivo não suportado, arquivo corrompido, problema de rede ou erro do servidor
                </p>
              </div>
            }
            type="error"
            showIcon
            action={
              <Space>
                <Button size="small" onClick={() => window.location.reload()}>
                  Atualizar Página
                </Button>
                <Button size="small" onClick={() => navigate('/')}>
                  Voltar ao Início
                </Button>
              </Space>
            }
          />
        )}

        {status && status.status === 'processing' && (
          <Card title="Progresso do Processamento">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <Text strong>Progresso Geral</Text>
                  <Text>{Math.round(status.progress)}%</Text>
                </div>
                <Progress 
                  percent={status.progress} 
                  status="active"
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                />
              </div>

              <div>
                <Text strong>Etapa atual: </Text>
                <Text>{status.step_name}</Text>
              </div>

              <Steps 
                direction="vertical" 
                current={status.current_step}
                status="process"
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
            </Space>
          </Card>
        )}

        {status?.status === 'completed' && (
          <Alert
            message="Processamento Concluído"
            description="Vídeo processado com sucesso, redirecionando para a página de detalhes do projeto..."
            type="success"
            showIcon
          />
        )}
      </Space>
    </Content>
  )
}

export default ProcessingPage