import React, { useState, useEffect } from 'react'
import { Button, message, Progress, Input, Card, Typography, Space, Spin, Select } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'
import { projectApi, bilibiliApi, VideoCategory, BilibiliDownloadTask } from '../services/api'
import { useProjectStore } from '../store/useProjectStore'
import { validateApiConfigBeforeProjectCreation } from '../utils/apiConfigCheck'

const { Text } = Typography

interface BilibiliDownloadProps {
  onDownloadSuccess?: (projectId: string) => void
}

// Usar o tipo BilibiliDownloadTask importado da API

const BilibiliDownload: React.FC<BilibiliDownloadProps> = ({ onDownloadSuccess }) => {
  const [url, setUrl] = useState('')
  const [projectName, setProjectName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedBrowser, setSelectedBrowser] = useState<string>('')
  const [categories, setCategories] = useState<VideoCategory[]>([])
  const [loadingCategories, setLoadingCategories] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [currentTask, setCurrentTask] = useState<BilibiliDownloadTask | null>(null)
  const [pollingInterval, setPollingInterval] = useState<number | null>(null)
  const [videoInfo, setVideoInfo] = useState<any>(null)
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  
  const { addProject } = useProjectStore()

  // Carregar configuração de categoria de vídeo
  useEffect(() => {
    const loadCategories = async () => {
      setLoadingCategories(true)
      try {
        const response = await projectApi.getVideoCategories()
        setCategories(response.categories)
        if (response.default_category) {
          setSelectedCategory(response.default_category)
        } else if (response.categories.length > 0) {
          setSelectedCategory(response.categories[0].value)
        }
      } catch (error) {
        console.error('Failed to load video categories:', error)
        message.error('Falha ao carregar categorias de vídeo')
      } finally {
        setLoadingCategories(false)
      }
    }

    loadCategories()
  }, [])

  // Limpar pesquisa
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const validateVideoUrl = (url: string): boolean => {
    const bilibiliPatterns = [
      /^https?:\/\/www\.bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/b23\.tv\/[0-9A-Za-z]+/,
      /^https?:\/\/www\.bilibili\.com\/video\/av\d+/,
      /^https?:\/\/bilibili\.com\/video\/av\d+/
    ]
    
    const youtubePatterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]+/
    ]
    
    return bilibiliPatterns.some(pattern => pattern.test(url)) || 
           youtubePatterns.some(pattern => pattern.test(url))
  }
  
  const getVideoType = (url: string): 'bilibili' | 'youtube' | null => {
    const bilibiliPatterns = [
      /^https?:\/\/www\.bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/bilibili\.com\/video\/[Bb][Vv][0-9A-Za-z]+/,
      /^https?:\/\/b23\.tv\/[0-9A-Za-z]+/,
      /^https?:\/\/www\.bilibili\.com\/video\/av\d+/,
      /^https?:\/\/bilibili\.com\/video\/av\d+/
    ]
    
    const youtubePatterns = [
      /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[a-zA-Z0-9_-]+/,
      /^https?:\/\/youtu\.be\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/embed\/[a-zA-Z0-9_-]+/,
      /^https?:\/\/(www\.)?youtube\.com\/v\/[a-zA-Z0-9_-]+/
    ]
    
    if (bilibiliPatterns.some(pattern => pattern.test(url))) {
      return 'bilibili'
    } else if (youtubePatterns.some(pattern => pattern.test(url))) {
      return 'youtube'
    }
    return null
  }

  const parseVideoInfo = async () => {
    if (!url.trim()) {
      setError('Por favor, insira um link de vídeo válido')
      return
    }

    const videoType = getVideoType(url.trim())
    if (!videoType) {
      setError('Por favor, insira um link de vídeo Bilibili ou YouTube correto')
      return
    }

    setParsing(true)
    setError('') // Limpar mensagens de erro anteriores
    
    try {
      let response
      if (videoType === 'bilibili') {
        response = await bilibiliApi.parseVideoInfo(url.trim(), selectedBrowser)
      } else if (videoType === 'youtube') {
        response = await bilibiliApi.parseYouTubeVideoInfo(url.trim(), selectedBrowser)
      }
      
      const parsedVideoInfo = response?.video_info
      
      setVideoInfo(parsedVideoInfo)
      setError('') // Análise bem-sucedida, limpar mensagem de erro
      
      // Preencher automaticamente o nome do projeto
      if (parsedVideoInfo && !projectName && parsedVideoInfo.title) {
        setProjectName(parsedVideoInfo.title)
      }
      
      return parsedVideoInfo
    } catch (error: any) {
      setError('Por favor, insira um link de vídeo válido')
      setVideoInfo(null)
    } finally {
      setParsing(false)
    }
  }

  const startPolling = (taskId: string, videoType: 'bilibili' | 'youtube') => {
    const interval = window.setInterval(async () => {
      try {
        let task
        if (videoType === 'bilibili') {
          task = await bilibiliApi.getTaskStatus(taskId)
        } else {
          task = await bilibiliApi.getYouTubeTaskStatus(taskId)
        }
        setCurrentTask(task)
        
        if (task.status === 'completed') {
          clearInterval(interval)
          setPollingInterval(null)
          setDownloading(false)
          message.success('Download do vídeo concluído!')
          
          if (task.project_id && onDownloadSuccess) {
            onDownloadSuccess(task.project_id)
          }
          
          // Redefinir status
          resetForm()
        } else if (task.status === 'failed') {
          clearInterval(interval)
          setPollingInterval(null)
          setDownloading(false)
          message.error(`Falha no download: ${task.error_message || 'Erro Desconhecido'}`)
          resetForm()
        }
      } catch (error) {
        console.error('Falha ao consultar status da tarefa:', error)
      }
    }, 2000)
    
    setPollingInterval(interval)
  }

  const handleDownload = async () => {
    if (!url.trim()) {
      message.error('Digite o link do vídeo')
      return
    }

    const videoType = getVideoType(url.trim())
    if (!videoType) {
      message.error('Por favor, insira um link de vídeo Bilibili ou YouTube válido')
      return
    }

    // Verificar configuração da API
    const hasValidApiConfig = await validateApiConfigBeforeProjectCreation()
    if (!hasValidApiConfig) {
      return
    }

    setDownloading(true)
    
    try {
      const requestBody: any = {
        url: url.trim(),
        video_category: selectedCategory
      }
      
      if (projectName.trim()) {
        requestBody.project_name = projectName.trim()
      }
      
      if (selectedBrowser) {
        requestBody.browser = selectedBrowser
      }

      let response
      if (videoType === 'bilibili') {
        response = await bilibiliApi.createDownloadTask(requestBody)
      } else {
        response = await bilibiliApi.createYouTubeDownloadTask(requestBody)
      }
      
      // Verifica se a resposta contém o ID do projeto (novo formato de resposta otimizado)
      if (response.project_id) {
        addProject({
          id: response.project_id,
          name: projectName.trim() || (videoInfo?.title ?? 'Novo Projeto'),
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        // Novo formato: Projeto criado, redefinir formulário imediatamente
        setCurrentTask(null)
        setDownloading(false)
        resetForm()
        
        // Exibir dica de sucesso unificada
        const platformName = videoType === 'bilibili' ? 'Bilibili' : 'YouTube'
        message.success(`${platformName}Projeto criado com sucesso, baixando em segundo plano. Você pode continuar adicionando outros projetos`)
        
        if (onDownloadSuccess) {
          onDownloadSuccess(response.project_id)
        }
      } else {
        // Formato antigo: continuar a sondar o status da tarefa
        setCurrentTask(response)
        startPolling(response.id, videoType)
      }
      
    } catch (error: any) {
      setDownloading(false)
      const errorMessage = error.response?.data?.detail || error.message || 'Falha ao criar tarefa de download'
      message.error(errorMessage)
    }
  }

  const resetForm = () => {
    setUrl('')
    setProjectName('')
    setCurrentTask(null)
    setVideoInfo(null)
    setError('')
    // Manter a seleção de categoria e navegador para que o usuário possa continuar adicionando projetos
    // setSelectedCategory(categories[0].value)
    // setSelectedBrowser('')
  }

  const stopDownload = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
      setPollingInterval(null)
    }
    setDownloading(false)
    setCurrentTask(null)
    message.info('Monitoramento de tarefas de download interrompido')
  }

  return (
    <div style={{
      width: '100%',
      margin: '0 auto'
    }}>

      {/* Formulário de Entrada */}
      <div style={{ marginBottom: '16px' }}>
        <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <div>
            <Input.TextArea
              placeholder="Por favor, cole o link do vídeo do Bilibili ou YouTube, suporta:&#10;• Bilibili: https://www.bilibili.com/video/BV1xx411c7mu&#10;• YouTube: https://www.youtube.com/watch?v=xxxxx"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                // Limpar resultados de análise e mensagens de erro anteriores
                if (videoInfo) {
                  setVideoInfo(null)
                  setProjectName('')
                }
                if (error) {
                  setError('')
                }
              }}
              onBlur={() => {
                // Analisar automaticamente ao perder o foco
                if (url.trim() && !videoInfo && validateVideoUrl(url.trim())) {
                  parseVideoInfo();
                }
              }}
              style={{
                background: 'var(--ac-line-2)',
                border: '1px solid rgba(79, 172, 254, 0.3)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '14px',
                resize: 'none'
              }}
              rows={4}
              disabled={downloading || parsing}
            />
            {parsing && (
               <div style={{
                 marginTop: '8px',
                 color: '#4facfe',
                 fontSize: '14px',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '8px'
               }}>
                 <span>Analisando informações do vídeo...</span>
               </div>
             )}
             {error && !parsing && (
               <div style={{
                 marginTop: '8px',
                 color: '#ff6b6b',
                 fontSize: '14px',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '8px'
               }}>
                 <span>{error}</span>
               </div>
             )}
          </div>
          
          {/* Exibir informações de vídeo analisadas com sucesso */}
          {videoInfo && (
            <div style={{
              background: 'rgba(102, 126, 234, 0.1)',
              border: '1px solid rgba(102, 126, 234, 0.3)',
              borderRadius: '8px',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <Text style={{ color: '#667eea', fontWeight: 600, fontSize: '16px', display: 'block', marginBottom: '8px' }}>
                Informações do vídeo analisadas com sucesso
              </Text>
              <Text style={{ color: '#ffffff', fontSize: '14px', display: 'block' }}>
                {videoInfo.title}
              </Text>
              <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px' }}>
                {getVideoType(url) === 'bilibili' ? 'Criador' : 'Canal'}: {videoInfo.uploader || 'Desconhecido'} • Duração: {videoInfo.duration ? `${Math.floor(videoInfo.duration / 60)}:${String(Math.floor(videoInfo.duration % 60)).padStart(2, '0')}` : 'Desconhecido'}
              </Text>
            </div>
          )}
          
          {/* Exibir nome e categoria do projeto somente após análise bem-sucedida */}
          {videoInfo && (
            <>
              <div>
                <Text style={{ color: '#ffffff', marginBottom: '12px', display: 'block', fontSize: '16px', fontWeight: 500 }}>Nome do projeto (opcional)</Text>
                <Input
                  placeholder="Deixe em branco para usar o título do vídeo como nome do projeto"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  style={{
                    background: 'var(--ac-line-2)',
                    border: '1px solid rgba(79, 172, 254, 0.3)',
                    borderRadius: '12px',
                    color: '#ffffff',
                    height: '48px',
                    fontSize: '14px'
                  }}
                  disabled={downloading}
                />
              </div>
              
              <div>
                <Text style={{ color: '#ffffff', marginBottom: '12px', display: 'block', fontSize: '16px', fontWeight: 500 }}>Seleção do navegador (necessário para obter legendas de IA)</Text>
                <Select
                  placeholder="Selecione o navegador para obter o cookie (opcional)"
                  value={selectedBrowser || undefined}
                  onChange={(value) => setSelectedBrowser(value || '')}
                  allowClear
                  style={{
                    width: '100%',
                    height: '48px'
                  }}
                  dropdownStyle={{
                    background: 'var(--ac-line-2)',
                    border: '1px solid rgba(79, 172, 254, 0.3)',
                    borderRadius: '12px'
                  }}
                  disabled={downloading}
                >
                  <Select.Option value="chrome">Chrome</Select.Option>
                  <Select.Option value="firefox">Firefox</Select.Option>
                  <Select.Option value="safari">Safari</Select.Option>
                  <Select.Option value="edge">Edge</Select.Option>
                </Select>
                <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
                  Selecione o navegador para obter o status de login, usado para baixar legendas de IA. Se não selecionar, apenas legendas públicas poderão ser baixadas.
                </Text>
              </div>
              
              <div>
                <Text style={{ color: '#ffffff', marginBottom: '12px', display: 'block', fontSize: '16px', fontWeight: 500 }}>Classificação de Vídeo</Text>
                {loadingCategories ? (
                  <Spin size="small" />
                ) : (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    {categories.map(category => {
                      const isSelected = selectedCategory === category.value
                      return (
                        <div
                          key={category.value}
                          onClick={() => setSelectedCategory(category.value)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            borderRadius: '6px',
                            border: isSelected 
                              ? `2px solid ${category.color}` 
                              : '2px solid var(--ac-line)',
                            background: isSelected 
                              ? `${category.color}25` 
                              : 'var(--ac-line)',
                            color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
                            boxShadow: isSelected 
                              ? `0 0 12px ${category.color}40` 
                              : 'none',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            fontSize: '13px',
                            fontWeight: isSelected ? 600 : 400,
                            userSelect: 'none'
                          }}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = 'var(--ac-line)'
                              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.background = 'var(--ac-line)'
                              e.currentTarget.style.borderColor = 'var(--ac-line)'
                            }
                          }}
                        >
                          <span style={{ fontSize: '14px' }}>{category.icon}</span>
                          <span>{category.name}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </Space>
      </div>

      {/* Botão de ação - Exibir somente após análise bem-sucedida */}
      {videoInfo && (
        <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', gap: '12px' }}>
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            loading={downloading}
            disabled={!url.trim()}
            size="large"
            style={{
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              border: 'none',
              borderRadius: '12px',
              height: '48px',
              padding: '0 32px',
              fontSize: '16px',
              fontWeight: 600,
              boxShadow: '0 4px 20px rgba(79, 172, 254, 0.3)',
              minWidth: '160px'
            }}
          >
            {downloading ? 'Importando...' : 'Iniciar Importação'}
          </Button>
          
          {downloading && (
            <Button
              onClick={stopDownload}
              size="large"
              style={{
                background: 'var(--ac-line)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: '#ffffff',
                borderRadius: '12px',
                height: '48px',
                padding: '0 24px',
                fontSize: '14px'
              }}
            >
              Parar Monitoramento
            </Button>
          )}
        </div>
      )}

      {/* Progresso do Download */}
      {currentTask && (
        <Card
          style={{
            background: 'var(--ac-line-2)',
            border: '1px solid rgba(79, 172, 254, 0.3)',
            borderRadius: '12px',
            marginTop: '16px',
            backdropFilter: 'blur(10px)'
          }}
          styles={{
            body: { padding: '16px' }
          }}
        >
          <div style={{ marginBottom: '16px' }}>
            <Text style={{ color: '#ffffff', fontWeight: 600, fontSize: '18px' }}>Progresso da Importação</Text>
          </div>
          
          {currentTask.video_info && (
            <div style={{ marginBottom: '16px' }}>
              <Text style={{ color: '#4facfe', fontWeight: 600, fontSize: '16px' }}>{currentTask.video_info.title}</Text>
            </div>
          )}
          
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <Text style={{ color: 'var(--ac-sub)', fontSize: '14px' }}>Status: {currentTask.status}</Text>
              <Text style={{ color: 'var(--ac-sub)', fontSize: '14px' }}>{Math.round(currentTask.progress)}%</Text>
            </div>
            
            <Progress
              percent={Math.round(currentTask.progress)}
              status={currentTask.status === 'failed' ? 'exception' : 'active'}
              strokeColor={{
                '0%': '#4facfe',
                '100%': '#00f2fe'
              }}
              trailColor="var(--ac-line)"
              strokeWidth={8}
              showInfo={false}
            />
          </div>
          
          {currentTask.error_message && (
            <div style={{ 
              marginTop: '16px',
              padding: '12px',
              background: 'rgba(255, 77, 79, 0.1)',
              border: '1px solid rgba(255, 77, 79, 0.3)',
              borderRadius: '8px'
            }}>
              <Text style={{ color: '#ff4d4f', fontSize: '14px' }}>Erro: {currentTask.error_message}</Text>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

export default BilibiliDownload
