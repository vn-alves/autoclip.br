import React, { useState, useEffect } from 'react'
import { Button, message, Space, Typography, Input, Progress } from 'antd'
import { InboxOutlined, VideoCameraOutlined, FileTextOutlined, SubnodeOutlined } from '@ant-design/icons'
import { useDropzone } from 'react-dropzone'
import { projectApi, VideoCategory } from '../services/api'
import { useProjectStore } from '../store/useProjectStore'
import { validateApiConfigBeforeProjectCreation } from '../utils/apiConfigCheck'
import { isTauri } from '../utils/isTauri'
import { canSaveSettings } from '../utils/desktopMode'
import { createWebProjectFromFile } from '../webstore/projects'

// Web sem servidor (IndexedDB) só entra em cena quando NÃO há backend nenhum por trás —
// isTauri() sozinho não basta: localhost com o backend rodando (ver conversa) é navegador
// comum, mas com um servidor de verdade atrás, então deve se comportar como desktop.
// canSaveSettings() já faz exatamente essa pergunta (backend responde?), reaproveitado aqui.
const hasRealBackend = async (): Promise<boolean> => isTauri() || canSaveSettings()

// Web (sem servidor): não há endpoint /video-categories pra consultar, então usa essa
// lista fixa mínima — só "Padrão" mesmo, já que a Fase 2 (corte por IA) ainda não roda
// sem servidor e a categoria só é usada pra escolher o prompt do LLM no backend.
const WEB_DEFAULT_CATEGORIES: VideoCategory[] = [
  { value: 'default', name: 'Padrão', description: '', icon: '🎬', color: '#4facfe' },
]

const { Text } = Typography

interface FileUploadProps {
  onUploadSuccess?: (projectId: string) => void
}

const FileUpload: React.FC<FileUploadProps> = ({ onUploadSuccess }) => {
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [projectName, setProjectName] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [categories, setCategories] = useState<VideoCategory[]>([])
  const [, setLoadingCategories] = useState(false)
  const [files, setFiles] = useState<{
    video?: File
    srt?: File
  }>({})
  
  const { addProject } = useProjectStore()

  // Carregar configuração de categoria de vídeo — na Web sem servidor não existe esse
  // endpoint, usa a lista fixa mínima (ver WEB_DEFAULT_CATEGORIES).
  useEffect(() => {
    let alive = true
    const loadCategories = async () => {
      if (!(await hasRealBackend())) {
        if (alive) {
          setCategories(WEB_DEFAULT_CATEGORIES)
          setSelectedCategory(WEB_DEFAULT_CATEGORIES[0].value)
        }
        return
      }
      setLoadingCategories(true)
      try {
        const response = await projectApi.getVideoCategories()
        setCategories(response.categories)
        // Definir a opção [Padrão] como selecionada por padrão
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
    return () => { alive = false }
  }, [])

  const onDrop = (acceptedFiles: File[]) => {
    const newFiles = { ...files }
    
    acceptedFiles.forEach(file => {
      const extension = file.name.split('.').pop()?.toLowerCase()
      
      if (['mp4', 'avi', 'mov', 'mkv', 'webm'].includes(extension || '')) {
        newFiles.video = file
        // Define automaticamente o nome do projeto como o nome do arquivo de vídeo (sem extensão)
        // Atualizar o nome do projeto cada vez que um novo arquivo de vídeo for selecionado
        setProjectName(file.name.replace(/\.[^/.]+$/, ''))
      } else if (extension === 'srt') {
        newFiles.srt = file
      }
    })
    
    setFiles(newFiles)
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'video/*': ['.mp4', '.avi', '.mov', '.mkv', '.webm'],
      'application/x-subrip': ['.srt']
    },
    multiple: true
  })

  const handleUpload = async () => {
    if (!files.video) {
      message.error('Por favor, selecione o arquivo de vídeo')
      return
    }

    if (!projectName.trim()) {
      message.error('Por favor, insira o nome do projeto')
      return
    }

    const useApi = await hasRealBackend()

    // Verificar configuração da API — só faz sentido quando há backend de verdade. Na Web
    // sem servidor ainda não há corte por IA rodando (ver webstore/projects.ts), então não
    // há chave pra checar.
    if (useApi) {
      const hasValidApiConfig = await validateApiConfigBeforeProjectCreation()
      if (!hasValidApiConfig) {
        return
      }
    }

    setUploading(true)
    setUploadProgress(0)

    // Web sem servidor: salva o vídeo no navegador (IndexedDB) e para por aqui — ainda
    // não há corte automático por IA rodando sem servidor (isso é a próxima etapa do
    // plano). Fluxo totalmente separado do upload por API do desktop, abaixo.
    if (!useApi) {
      try {
        const newProject = await createWebProjectFromFile(files.video, projectName.trim())
        addProject(newProject)
        message.success('Vídeo salvo no navegador. Corte automático por IA ainda não está disponível na versão Web.')
        setFiles({})
        setProjectName('')
        setUploadProgress(0)
        if (categories.length > 0) setSelectedCategory(categories[0].value)
        if (onUploadSuccess) onUploadSuccess(newProject.id)
      } catch (err: any) {
        console.error('Falha ao salvar vídeo local:', err)
        message.error('Não foi possível salvar esse vídeo (o navegador pode estar sem espaço de armazenamento).')
      } finally {
        setUploading(false)
      }
      return
    }

    try {
      // Simular o progresso do upload, exibição de progresso mais realista
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 85) {
            clearInterval(progressInterval)
            return prev
          }
          // Usar incrementos decrescentes para simular o progresso real do upload
          const increment = Math.max(1, Math.floor((90 - prev) / 10))
          return prev + increment
        })
      }, 300)

      console.log('Iniciando upload do arquivo:', {
        video_file: files.video.name,
        srt_file: files.srt?.name || '(Será gerado usando reconhecimento de voz)',
        project_name: projectName.trim(),
        video_category: selectedCategory
      })

      const newProject = await projectApi.uploadFiles({
        video_file: files.video,
        srt_file: files.srt,
        project_name: projectName.trim(),
        video_category: selectedCategory
      })
      
      console.log('Upload bem-sucedido, informações do projeto:', newProject)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      addProject(newProject)
      message.success('Projeto criado com sucesso! Processando em segundo plano, por favor, aguarde...')
      
      // Redefinir status
      setFiles({})
      setProjectName('')
      setUploadProgress(0)
      setUploading(false)
      // Redefinir para categoria padrão
      if (categories.length > 0) {
        setSelectedCategory(categories[0].value)
      }
      
      if (onUploadSuccess) {
        onUploadSuccess(newProject.id)
      }
      
    } catch (error: any) {
      console.error('Falha no upload, erro detalhado:', error)
      
      let errorMessage = 'Falha no upload, tente novamente'
      let errorType = 'error'
      
      // Fornecer mensagens de erro mais amigáveis com base no tipo de erro
      if (error.response?.status === 413) {
        errorMessage = 'Arquivo muito grande, selecione um arquivo de vídeo menor'
        errorType = 'warning'
      } else if (error.response?.status === 415) {
        errorMessage = 'Formato de arquivo não suportado, por favor, selecione vídeos nos formatos MP4, AVI, MOV, MKV ou WEBM'
        errorType = 'warning'
      } else if (error.response?.status === 400) {
        if (error.response?.data?.detail) {
          errorMessage = error.response.data.detail
        } else {
          errorMessage = 'Formato ou conteúdo do arquivo problemático, verifique e tente novamente'
        }
      } else if (error.response?.status === 500) {
        errorMessage = 'Erro ao processar o arquivo no servidor, tente novamente mais tarde'
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Upload excedeu o tempo limite, verifique a conexão de rede e tente novamente'
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail
      } else if (error.userMessage) {
        errorMessage = error.userMessage
      } else if (error.message) {
        errorMessage = error.message
      }
      
      // Exibir mensagem de erro
      if (errorType === 'warning') {
        message.warning(errorMessage)
      } else {
        message.error(errorMessage)
      }
      
      // Se for um erro de rede, sugerir tentar novamente
      if (error.code === 'ECONNABORTED' || error.response?.status >= 500) {
        message.info('Se o problema persistir, verifique sua conexão de rede ou entre em contato com o suporte técnico', 5)
      }
    } finally {
      setUploading(false)
    }
  }

  const removeFile = (type: 'video' | 'srt') => {
    setFiles(prev => {
      const newFiles = { ...prev }
      delete newFiles[type]
      return newFiles
    })
  }

  return (
    <div style={{
      borderRadius: '16px',
      padding: '0',
      transition: 'all 0.3s ease',
      position: 'relative',
      overflow: 'hidden',
      width: '100%',
      margin: '0 auto'
    }}>
      {/* Decoração de Fundo */}
      <div style={{
        position: 'absolute',
        top: '-50%',
        right: '-50%',
        width: '200%',
        height: '200%',
        background: 'radial-gradient(circle, rgba(79, 172, 254, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />
      

      
      <div 
        {...getRootProps()} 
        className={`upload-area ${isDragActive ? 'dragover' : ''}`}
        style={{
          padding: '24px 16px',
          textAlign: 'center',
          marginBottom: '16px',
          background: isDragActive ? 'rgba(79, 172, 254, 0.15)' : 'var(--ac-line-2)',
          border: `2px dashed ${isDragActive ? '#4facfe' : 'rgba(79, 172, 254, 0.3)'}`,
          borderRadius: '16px',
          cursor: 'pointer',
          transition: 'all 0.3s ease',
          position: 'relative',
          backdropFilter: 'blur(10px)'
        }}
      >
        <input {...getInputProps()} />
        <div style={{
          width: '48px',
          height: '48px',
          margin: '0 auto 12px',
          background: isDragActive ? 'rgba(79, 172, 254, 0.3)' : 'rgba(79, 172, 254, 0.1)',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          border: '1px solid rgba(79, 172, 254, 0.2)'
        }}>
          <InboxOutlined style={{ 
            fontSize: '20px', 
            color: isDragActive ? '#4facfe' : '#4facfe'
          }} />
        </div>
        <div>
          <Text strong style={{ 
            color: '#ffffff',
            fontSize: '16px',
            display: 'block',
            marginBottom: '8px',
            fontWeight: 600
          }}>
            {isDragActive ? 'Solte o mouse para importar o arquivo' : 'Clique ou arraste arquivos para esta área'}
          </Text>
          <Text style={{ color: 'var(--ac-sub)', fontSize: '14px', lineHeight: '1.5' }}>
            Suporta formatos MP4, AVI, MOV, MKV, WebM,<Text style={{ color: '#52c41a', fontWeight: 600 }}>Opcional: importar arquivo de legenda (.srt) ou usar IA para gerar automaticamente</Text>
          </Text>
        </div>
      </div>

      {/* Entrada do nome do projeto - exibida apenas após a seleção do arquivo */}
      {files.video && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '8px', display: 'block' }}>
            Nome do projeto
          </Text>
          <Input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Digite o nome do projeto, usado para identificar seu projeto de vídeo"
            style={{ 
              height: '40px',
              borderRadius: '12px',
              fontSize: '14px',
              background: 'var(--ac-line-2)',
              border: '1px solid rgba(79, 172, 254, 0.3)',
              color: '#ffffff'
            }}
          />
        </div>
      )}

      {/* Seleção de categoria de vídeo - exibida apenas após a seleção do arquivo */}
      {files.video && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '8px', display: 'block' }}>
            Classificação de Vídeo
          </Text>
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
        </div>
      )}

      {/* Lista de Arquivos */}
      {Object.keys(files).length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <Text strong style={{ color: '#ffffff', fontSize: '14px', marginBottom: '12px', display: 'block' }}>
            Arquivo selecionado
          </Text>
          <Space direction="vertical" style={{ width: '100%' }} size="small">
            {files.video && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--ac-line-2)',
                borderRadius: '12px',
                border: '1px solid rgba(79, 172, 254, 0.2)',
                backdropFilter: 'blur(10px)'
              }}>
                <Space size="middle">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(79, 172, 254, 0.3)'
                  }}>
                    <VideoCameraOutlined style={{ color: '#ffffff', fontSize: '16px' }} />
                  </div>
                  <div>
                    <Text style={{ color: '#ffffff', fontWeight: 600, display: 'block', fontSize: '14px' }}>
                      {files.video.name}
                    </Text>
                    <Text style={{ color: 'var(--ac-sub)', fontSize: '13px' }}>
                      {(files.video.size / 1024 / 1024).toFixed(2)} MB
                    </Text>
                  </div>
                </Space>
                <Button 
                  size="small" 
                  type="text" 
                  onClick={() => removeFile('video')}
                  style={{ 
                    color: '#ff6b6b',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '12px'
                  }}
                >
                  Remover
                </Button>
              </div>
            )}
            {files.srt && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                padding: '16px',
                background: 'var(--ac-line-2)',
                borderRadius: '12px',
                border: '1px solid rgba(82, 196, 26, 0.3)',
                backdropFilter: 'blur(10px)'
              }}>
                <Space size="middle">
                  <div style={{
                    width: '36px',
                    height: '36px',
                    background: 'linear-gradient(135deg, #52c41a 0%, #73d13d 100%)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(82, 196, 26, 0.3)'
                  }}>
                    <FileTextOutlined style={{ color: '#ffffff', fontSize: '16px' }} />
                  </div>
                  <div>
                    <Text style={{ color: '#ffffff', fontWeight: 600, display: 'block', fontSize: '14px' }}>
                      {files.srt.name}
                    </Text>
                    <Text style={{ color: 'var(--ac-sub)', fontSize: '13px' }}>
                      Arquivo de Legenda
                    </Text>
                  </div>
                </Space>
                <Button 
                  size="small" 
                  type="text" 
                  onClick={() => removeFile('srt')}
                  style={{ 
                    color: '#ff6b6b',
                    borderRadius: '8px',
                    padding: '4px 12px',
                    fontSize: '12px'
                  }}
                >
                  Remover
                </Button>
              </div>
            )}
          </Space>
          
          {/* Dicas de geração de legendas por IA */}
          {files.video && !files.srt && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              background: 'rgba(82, 196, 26, 0.1)',
              border: '1px solid rgba(82, 196, 26, 0.3)',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <SubnodeOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
              <Text style={{ color: '#52c41a', fontSize: '14px', fontWeight: 500 }}>
                Gerará automaticamente arquivos de legenda usando reconhecimento de voz por IA
              </Text>
            </div>
          )}
        </div>
      )}

      {/* Progresso da Importação */}
      {uploading && (
        <div style={{ 
          marginBottom: '16px',
          padding: '20px',
          background: 'var(--ac-line-2)',
          borderRadius: '16px',
          border: '1px solid rgba(79, 172, 254, 0.3)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <Text style={{ color: '#ffffff', fontWeight: 600, fontSize: '14px' }}>Progresso da Importação</Text>
            <Text style={{ color: '#4facfe', float: 'right', fontWeight: 600, fontSize: '14px' }}>
              {uploadProgress}%
            </Text>
          </div>
          <Progress 
            percent={uploadProgress} 
            status="active"
            strokeColor={{
              '0%': '#4facfe',
              '100%': '#00f2fe',
            }}
            trailColor="var(--ac-line)"
            strokeWidth={6}
            showInfo={false}
            style={{ marginBottom: '8px' }}
          />
          <Text style={{ color: 'var(--ac-sub)', fontSize: '13px', marginTop: '8px', display: 'block', textAlign: 'center' }}>
            Importando arquivo, aguarde...
          </Text>
        </div>
      )}

      {/* Botão de upload - só aparece depois de selecionar um arquivo */}
      {files.video && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <Button 
            type="primary" 
            size="large"
            loading={uploading}
            disabled={!files.video || !projectName.trim()}
            onClick={handleUpload}
            style={{
              height: '48px',
              padding: '0 32px',
              borderRadius: '24px',
              background: uploading ? '#666666' : 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              border: 'none',
              fontSize: '16px',
              fontWeight: 600,
              boxShadow: uploading ? 'none' : '0 4px 20px rgba(79, 172, 254, 0.4)',
              transition: 'all 0.3s ease'
            }}
          >
            {uploading ? 'Importando...' : 'Iniciando importação e processamento'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default FileUpload
