/**
 * Página de demonstração do sistema de progresso simplificado
 */

import React, { useState } from 'react'
import { 
  Card, 
  Typography, 
  Space, 
  Button, 
  Row, 
  Col, 
  Divider, 
  message,
  Input,
  Tag,
  Select
} from 'antd'
import { 
  PlayCircleOutlined, 
  StopOutlined, 
  ReloadOutlined,
  PlusOutlined
} from '@ant-design/icons'
import { BatchProgressBar } from '../components/SimpleProgressBar'
import { SimpleProjectCard } from '../components/SimpleProjectCard'
import { useSimpleProgressStore } from '../stores/useSimpleProgressStore'

const { Title, Text, Paragraph } = Typography
const { Option } = Select

// Simular dados do projeto
const mockProjects = [
  {
    id: 'demo-project-1',
    title: 'Análise de vídeo por IA',
    description: 'Análise aprofundada do desenvolvimento da tecnologia de inteligência artificial',
    status: 'pending',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z',
    category: 'knowledge'
  },
  {
    id: 'demo-project-2', 
    title: 'Compartilhamento de experiência empreendedora',
    description: 'Compartilhe os altos e baixos da jornada empreendedora',
    status: 'processing',
    created_at: '2024-01-14T15:30:00Z',
    updated_at: '2024-01-15T09:45:00Z',
    category: 'business'
  },
  {
    id: 'demo-project-3',
    title: 'Vídeos de avaliação de jogos',
    description: 'Análise aprofundada dos jogos mais recentes',
    status: 'completed',
    created_at: '2024-01-13T20:15:00Z',
    updated_at: '2024-01-14T16:20:00Z',
    category: 'entertainment'
  }
]

export const SimpleProgressDemo: React.FC = () => {
  const { 
    startPolling, 
    stopPolling, 
    isPolling, 
    getAllProgress,
    clearAllProgress 
  } = useSimpleProgressStore()

  const [projects, setProjects] = useState(mockProjects)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [pollingInterval, setPollingInterval] = useState(2000)
  const [newProjectId, setNewProjectId] = useState('')

  // Simular início do processamento do projeto
  const handleStartProcessing = (projectId: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, status: 'processing' } : p
    ))
    message.success(`Iniciar processamento do item: ${projectId}`)
  }

  // Simular visualização de detalhes
  const handleViewDetails = (projectId: string) => {
    message.info(`Ver detalhes do item: ${projectId}`)
  }

  // Simular exclusão de projeto
  const handleDelete = (projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId))
    message.success(`Excluir projeto: ${projectId}`)
  }

  // Simular tentativa de projeto
  const handleRetry = (projectId: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId ? { ...p, status: 'processing' } : p
    ))
    message.success(`Tentar novamente projeto: ${projectId}`)
  }

  // Adicionar novo item
  const handleAddProject = () => {
    if (!newProjectId.trim()) {
      message.warning('Por favor, insira o ID do item')
      return
    }

    const newProject = {
      id: newProjectId,
      title: `Novo projeto ${newProjectId}`,
      description: 'Este é um item de demonstração recém-adicionado',
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      category: 'default'
    }

    setProjects(prev => [...prev, newProject])
    setNewProjectId('')
    message.success(`Adicionar projeto: ${newProjectId}`)
  }

  // Começar a sondar os itens selecionados
  const handleStartPolling = () => {
    if (selectedProjectIds.length === 0) {
      message.warning('Por favor, selecione os itens para pesquisar')
      return
    }
    startPolling(selectedProjectIds, pollingInterval)
    message.success(`Iniciar Sondagem ${selectedProjectIds.length} projetos`)
  }

  // Parar polling
  const handleStopPolling = () => {
    stopPolling()
    message.info('Parar Sondagem')
  }

  // Limpar todo o progresso
  const handleClearProgress = () => {
    clearAllProgress()
    message.success('Limpar todos os dados de progresso')
  }

  const allProgress = getAllProgress()

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2}>Demonstração simplificada do sistema de progresso</Title>
      
      <Paragraph>
        Esta é uma demonstração de um sistema de progresso simplificado baseado em fases fixas e polling.
        O sistema usa 6 fases fixas, cada uma com um peso fixo, e obtém o progresso mais recente por meio de polling da API.
      </Paragraph>

      <Divider />

      {/* Painel de Controle */}
      <Card title="Painel de Controle" style={{ marginBottom: '24px' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Row gutter={16}>
            <Col span={8}>
              <Text strong>Intervalo de pesquisa:</Text>
              <Select
                value={pollingInterval}
                onChange={setPollingInterval}
                style={{ width: '100%', marginTop: '8px' }}
              >
                <Option value={1000}>1s</Option>
                <Option value={2000}>2s</Option>
                <Option value={3000}>3s</Option>
                <Option value={5000}>5s</Option>
              </Select>
            </Col>
            <Col span={8}>
              <Text strong>Status da pesquisa:</Text>
              <div style={{ marginTop: '8px' }}>
                <Tag color={isPolling ? 'green' : 'red'}>
                  {isPolling ? 'Sondando' : 'Não pesquisado'}
                </Tag>
              </div>
            </Col>
            <Col span={8}>
              <Text strong>Dados de progresso:</Text>
              <div style={{ marginTop: '8px' }}>
                <Tag color="blue">
                  {Object.keys(allProgress).length} projetos
                </Tag>
              </div>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Space>
                <Button 
                  type="primary" 
                  icon={<PlayCircleOutlined />}
                  onClick={handleStartPolling}
                  disabled={isPolling}
                >
                  Iniciar Sondagem
                </Button>
                <Button 
                  icon={<StopOutlined />}
                  onClick={handleStopPolling}
                  disabled={!isPolling}
                >
                  Parar Sondagem
                </Button>
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={handleClearProgress}
                >
                  Limpar Progresso
                </Button>
              </Space>
            </Col>
            <Col span={12}>
              <Space>
                <Input
                  placeholder="Inserir novo ID do item"
                  value={newProjectId}
                  onChange={(e) => setNewProjectId(e.target.value)}
                  onPressEnter={handleAddProject}
                />
                <Button 
                  type="dashed" 
                  icon={<PlusOutlined />}
                  onClick={handleAddProject}
                >
                  Adicionar Projeto
                </Button>
              </Space>
            </Col>
          </Row>

          <Row>
            <Col span={24}>
              <Text strong>Selecionar itens para pesquisar:</Text>
              <div style={{ marginTop: '8px' }}>
                <Select
                  mode="multiple"
                  placeholder="Selecionar projeto"
                  value={selectedProjectIds}
                  onChange={setSelectedProjectIds}
                  style={{ width: '100%' }}
                >
                  {projects.map(project => (
                    <Option key={project.id} value={project.id}>
                      {project.title} ({project.status})
                    </Option>
                  ))}
                </Select>
              </div>
            </Col>
          </Row>
        </Space>
      </Card>

      {/* Exibição de progresso em lote */}
      {selectedProjectIds.length > 0 && (
        <Card title="Exibição de progresso em lote" style={{ marginBottom: '24px' }}>
          <BatchProgressBar
            projectIds={selectedProjectIds}
            autoStart={false}
            pollingInterval={pollingInterval}
            showDetails={true}
            onProgressUpdate={(projectId, progress) => {
              console.log(`Projeto ${projectId} Atualização de progresso:`, progress)
            }}
          />
        </Card>
      )}

      {/* Lista de cartões de projeto */}
      <Card title="Lista de projetos">
        <Row gutter={[16, 16]}>
          {projects.map(project => (
            <Col span={24} key={project.id}>
              <SimpleProjectCard
                project={project}
                onStartProcessing={handleStartProcessing}
                onViewDetails={handleViewDetails}
                onDelete={handleDelete}
                onRetry={handleRetry}
              />
            </Col>
          ))}
        </Row>
      </Card>

      {/* Dados de progresso atuais */}
      {Object.keys(allProgress).length > 0 && (
        <Card title="Dados de progresso atuais" style={{ marginTop: '24px' }}>
          <pre style={{ 
            background: '#f5f5f5', 
            padding: '12px', 
            borderRadius: '4px',
            fontSize: '12px',
            maxHeight: '300px',
            overflow: 'auto'
          }}>
            {JSON.stringify(allProgress, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  )
}
