import React, { useState, useEffect } from 'react'
import { 
  Layout, 
  Typography, 
  Select, 
  Spin, 
  Empty,
  message 
} from 'antd'
import { useNavigate } from 'react-router-dom'
import ProjectCard from '../components/ProjectCard'
import FileUpload from '../components/FileUpload'
import BilibiliDownload from '../components/BilibiliDownload'

import { projectApi } from '../services/api'
import { useSimpleProgressStore } from '../stores/useSimpleProgressStore'
import { Project, useProjectStore } from '../store/useProjectStore'
import { useProjectPolling } from '../hooks/useProjectPolling'

const { Content } = Layout
const { Title, Text } = Typography
const { Option } = Select

const HomePage: React.FC = () => {
  const navigate = useNavigate()
  const { projects, setProjects, deleteProject, loading, setLoading } = useProjectStore()
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'upload' | 'bilibili'>('bilibili')

  // Usar Hook de pesquisa de projeto
  useProjectPolling({
    onProjectsUpdate: (updatedProjects) => {
      setProjects(updatedProjects || [])
    },
    enabled: true,
    interval: 30000 // Polling a cada 30 segundos, reduzindo requisições frequentes
  })

  // Seguro global: quando não há projetos em execução, força a parada do polling de progresso e limpa o cache
  useEffect(() => {
    const hasActive = projects.some(p => p.status === 'processing' || p.status === 'pending')
    if (!hasActive) {
      try {
        const { stopPolling, clearAllProgress } = useSimpleProgressStore.getState()
        stopPolling()
        clearAllProgress()
        console.log('Nenhum projeto em execução, o polling de progresso foi interrompido globalmente e o cache de progresso foi limpo')
      } catch (e) {
        console.warn('Problema ao parar a pesquisa de progresso global:', e)
      }
    }
  }, [projects])

  useEffect(() => {
    // Carregamento atrasado de projetos para evitar um grande número de solicitações no início
    const timer = setTimeout(() => {
      loadProjects()
    }, 1000) // Atraso de 1 segundo para carregar
    
    return () => clearTimeout(timer)
  }, [])

  const loadProjects = async () => {
    setLoading(true)
    try {
      // Obter dados reais do projeto da API de backend
      const projects = await projectApi.getProjects()
      // Garantir que projects seja um tipo de array
      const safeProjects = Array.isArray(projects) ? projects : []
      setProjects(safeProjects)
    } catch (error) {
      message.error('Falha ao carregar projeto')
      console.error('Load projects error:', error)
      // Se a chamada da API falhar, definir array vazio
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteProject = async (id: string) => {
    try {
      await projectApi.deleteProject(id)
      deleteProject(id)
      message.success('Projeto excluído com sucesso')
    } catch (error) {
      message.error('Falha ao excluir projeto')
      console.error('Delete project error:', error)
    }
  }

  // Chamado por ProjectCard quando o 'usuário clica manualmente em tentar novamente' e a requisição de nova tentativa foi bem-sucedida.
  // ProjectCard.handleRetry já enviou solicitações start/retryProcessing, aqui é apenas responsável por
  // Dica + atualiza a lista, nunca deve enviar outra requisição de nova tentativa (isso se somaria à requisição do próprio cartão e criaria
  // loadProjects→Remontar→loop de inicialização automática).
  const handleRetryProject = async () => {
    message.success('Reinício do processamento de itens')
    try {
      await loadProjects()
    } catch (error) {
      console.error('Refresh after retry error:', error)
    }
  }

  const handleProjectCardClick = (project: Project) => {
    // Projetos em status de importação não podem ser clicados para ver detalhes
    if (project.status === 'pending') {
      message.warning('O projeto está sendo importado, por favor, verifique os detalhes mais tarde')
      return
    }
    
    // Outros status podem entrar na página de detalhes normalmente
    navigate(`/project/${project.id}`)
  }

  const filteredProjects = (projects || [])
    .filter(project => {
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter
      return matchesStatus
    })
    .sort((a, b) => {
      // Ordenar por data de criação decrescente, os mais recentes primeiro
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  return (
    <Layout style={{
      minHeight: '100vh',
      background: 'var(--ac-bg)'
    }}>
      <Content style={{ padding: '40px 56px 56px', position: 'relative' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto', position: 'relative' }}>
          {/* Área de upload de arquivos */}
          <div style={{ 
            marginBottom: '48px',
            marginTop: '20px',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <div style={{ width: '100%', maxWidth: '820px' }}>
              <div style={{ fontSize: '13px', color: 'var(--ac-muted)', margin: '0 4px 14px', letterSpacing: '0.2px' }}>
                Cole o link, a IA corta automaticamente
              </div>
              <div style={{
                background: 'var(--ac-card)',
                borderRadius: '16px',
                border: '1px solid var(--ac-line)',
                padding: '18px',
                boxShadow: 'var(--ac-shadow)'
              }}>
              {/* Alternar guia — Segmentação de Cápsulas */}
              <div style={{
                display: 'inline-flex',
                marginBottom: '14px',
                borderRadius: '999px',
                background: 'var(--ac-line-2)',
                padding: '3px',
                gap: '2px'
              }}>
                 <button
                   style={{
                     padding: '8px 18px',
                     borderRadius: '999px',
                     background: activeTab === 'bilibili' ? 'var(--ac-card)' : 'transparent',
                     color: activeTab === 'bilibili' ? 'var(--ac-ink)' : 'var(--ac-sub)',
                     cursor: 'pointer',
                     fontSize: '14px',
                     fontWeight: 500,
                     transition: 'all 0.2s ease',
                     border: 'none',
                     boxShadow: activeTab === 'bilibili' ? '0 1px 2px rgba(0,0,0,.08)' : 'none'
                   }}
                   onClick={() => setActiveTab('bilibili')}
                 >
                   Importar Link
                 </button>
                <button
                   style={{
                     padding: '8px 18px',
                     borderRadius: '999px',
                     background: activeTab === 'upload' ? 'var(--ac-card)' : 'transparent',
                     color: activeTab === 'upload' ? 'var(--ac-ink)' : 'var(--ac-sub)',
                     cursor: 'pointer',
                     fontSize: '14px',
                     fontWeight: 500,
                     transition: 'all 0.2s ease',
                     border: 'none',
                     boxShadow: activeTab === 'upload' ? '0 1px 2px rgba(0,0,0,.08)' : 'none'
                   }}
                   onClick={() => setActiveTab('upload')}
                 >
                   Importar Arquivo
                 </button>
              </div>
              
              {/* Área de Conteúdo */}
              <div>
                {activeTab === 'bilibili' && (
                  <BilibiliDownload onDownloadSuccess={async () => {
                    // Atualizar lista de projetos após o processamento
                    await loadProjects()
                    // Não exibir mais toasts repetidos, o componente BilibiliDownload já exibe um aviso unificado
                  }} />
                )}
                {activeTab === 'upload' && (
                  <FileUpload onUploadSuccess={async () => {
                    // Atualizar lista de projetos após o processamento
                    await loadProjects()
                    message.success('Projeto criado com sucesso, em processamento...')
                  }} />
                )}
              </div>
              </div>
            </div>
          </div>

          {/* Área de gerenciamento de projetos */}
          <div style={{
            background: 'transparent',
            padding: '0',
            marginBottom: '32px'
          }}>
            {/* Área do título da lista de projetos */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginTop: '56px',
              marginBottom: '22px'
            }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                <Title
                  level={2}
                  style={{ margin: 0, color: 'var(--ac-ink)', fontSize: '16px', fontWeight: 600 }}
                >
                  Meus Projetos
                </Title>
                <Text style={{ color: 'var(--ac-muted)', fontSize: '13px' }}>
                  {filteredProjects.length}
                </Text>
              </div>
              
              {/* Filtro de status movido para a direita */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center'
              }}>
                <Select
                  placeholder="Todos os Status"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  variant="borderless"
                  style={{ minWidth: '120px', fontSize: '13px' }}
                  suffixIcon={<span style={{ color: 'var(--ac-muted)', fontSize: '10px' }}>⌄</span>}
                  allowClear
                >
                  <Option value="all">Todos os Status</Option>
                  <Option value="completed">Concluído</Option>
                  <Option value="processing">Processando</Option>
                  <Option value="error">Falha no Processamento</Option>
                </Select>
              </div>
            </div>

            {/* Conteúdo da lista de projetos */}
             <div>
               {loading ? (
                 <div style={{
                   textAlign: 'center',
                   padding: '72px 0',
                   background: 'var(--ac-card)',
                   borderRadius: '16px',
                   border: '1px solid var(--ac-line)'
                 }}>
                   <Spin size="large" />
                   <div style={{ marginTop: '18px', color: 'var(--ac-muted)', fontSize: '14px' }}>
                     Carregando lista de projetos…
                   </div>
                 </div>
               ) : filteredProjects.length === 0 ? (
                 <div style={{
                   textAlign: 'center',
                   padding: '72px 0',
                   background: 'var(--ac-card)',
                   borderRadius: '16px',
                   border: '1px solid var(--ac-line)'
                 }}>
                   <Empty
                     image={Empty.PRESENTED_IMAGE_SIMPLE}
                     description={
                       <div>
                         <Text type="secondary">
                           {projects.length === 0 ? 'Ainda não há projetos, por favor, use a área de importação acima para criar o primeiro projeto' : 'Nenhum item correspondente encontrado'}
                         </Text>
                       </div>
                     }
                   />
                 </div>
               ) : (
                 <div style={{
                   display: 'grid',
                   gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                   gap: '24px',
                   justifyContent: 'start'
                 }}>
                   {filteredProjects.map((project: Project) => (
                     <div key={project.id} style={{ position: 'relative', zIndex: 1 }}>
                       <ProjectCard 
                         project={project} 
                         onDelete={handleDeleteProject}
                         onRetry={() => handleRetryProject()}
                         onClick={() => handleProjectCardClick(project)}
                       />
                     </div>
                   ))}
                 </div>
               )}
             </div>
           </div>
         </div>
      </Content>
    </Layout>
  )
}

export default HomePage