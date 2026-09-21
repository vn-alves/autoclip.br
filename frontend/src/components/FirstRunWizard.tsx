import React, { useState, useEffect } from 'react'
import { Card, Button, Typography, Space, Alert, message, Form, Input, Select } from 'antd'
import { 
  SoundOutlined, 
  ApiOutlined, 
  CheckCircleOutlined,
  LoadingOutlined,
  LinkOutlined,
  InfoCircleOutlined
} from '@ant-design/icons'
import { ExternalLink } from '../utils/externalLinks'
import { settingsApi } from '../services/api'
import { isDesktopMode } from '../utils/desktopMode'
import { resolveApiUrl } from '../utils/apiConfig'

const { Title, Text } = Typography
const { Option } = Select

interface FirstRunWizardProps {
  onComplete: () => void
}

interface ConfigForm {
  // Configuração de reconhecimento de voz
  speechMethod: string
  whisperModel: string
  openaiApiKey: string
  
  // Configuração LLM
  llmProvider: string
  llmApiKey: string
  azureApiKey?: string
  azureRegion?: string
  googleApiKey?: string
  aliyunApiKey?: string
  customApiKey?: string
  customEndpoint?: string
}

const FirstRunWizard: React.FC<FirstRunWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [form] = Form.useForm<ConfigForm>()
  
  const [config, setConfig] = useState<ConfigForm>({
    speechMethod: 'whisper_local',
    whisperModel: 'base',
    openaiApiKey: '',
    llmProvider: 'dashscope',
    llmApiKey: ''
  })

  // Garantir que o formulário seja inicializado corretamente na montagem do componente
  useEffect(() => {
    form.setFieldsValue(config)
    console.log('Inicialização do formulário concluída, valores iniciais:', config)
  }, [form])

  const handleNext = () => {
    if (currentStep === 0) {
      // Validar configuração do primeiro passo
      const values = form.getFieldsValue()
      console.log('Clique no botão Próximo - Valores do formulário:', values)
      console.log('llmProvider:', values.llmProvider)
      console.log('llmApiKey:', values.llmApiKey)
      
      if (!values.llmProvider || !values.llmApiKey || values.llmApiKey.trim() === '') {
        message.error('Por favor, selecione um provedor LLM e insira a API Key')
        return
      }
      setConfig({ ...config, ...values })
      setCurrentStep(1)
    } else {
      handleComplete()
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      const values = form.getFieldsValue()
      const finalConfig = { ...config, ...values }
      
      // Validar configuração de reconhecimento de voz
      if (!finalConfig.speechMethod) {
        message.error('Por favor, selecione a solução de reconhecimento de voz')
        setLoading(false)
        return
      }
      
      // Salvar configuração LLM apenas se o usuário inseriu a chave API
      if (finalConfig.llmApiKey && finalConfig.llmApiKey.trim()) {
        try {
          await saveLLMConfig(finalConfig)
          console.log('Configuração LLM salva com sucesso')
        } catch (error) {
          console.error('Falha ao salvar configuração LLM:', error)
          message.error('Falha ao salvar a configuração LLM, tente novamente')
          setLoading(false)
          return
        }
      }
      
      // Salvar configuração de reconhecimento de fala - adicionar tratamento de erro
      try {
        await saveSpeechConfig(finalConfig)
      } catch (error) {
        console.warn('Falha ao salvar a configuração de reconhecimento de voz, usando a configuração padrão:', error)
        // Não lançar erro, permitir que o usuário continue a concluir o assistente
      }
      
      // Se for Whisper local, baixar o modelo
      if (finalConfig.speechMethod === 'whisper_local') {
        await downloadWhisperModel(finalConfig.whisperModel)
      }
      
      // Configuração salva, ir diretamente para a página inicial da ferramenta
      message.success('Configuração concluída! Bem-vindo ao AutoClip')
      onComplete()
    } catch (error) {
      console.error('Falha ao salvar configuração:', error)
      const errorMessage = error instanceof Error ? error.message : 'Falha ao salvar configuração, tente novamente'
      message.error(`Falha ao salvar configuração: ${errorMessage}`)
    } finally {
      setLoading(false)
    }
  }

  // Pular etapa atual, configurar mais tarde
  const handleSkip = async () => {
    if (currentStep === 0) {
      // Pular configuração do modelo de IA, ir para configuração de reconhecimento de fala
      setCurrentStep(1)
      message.info('A configuração do modelo de IA foi ignorada, por favor, configure-a na página de configurações mais tarde', 3)
    } else {
      // Pular configuração de reconhecimento de voz, concluir assistente
      // Garantir que nenhuma configuração de API vazia seja salva
      try {
        // Salvar apenas a configuração de reconhecimento de voz, não a configuração LLM
        const values = form.getFieldsValue()
        const finalConfig = { ...config, ...values }
        try {
          await saveSpeechConfig(finalConfig)
        } catch (error) {
          console.warn('Falha ao salvar a configuração de reconhecimento de voz, usando a configuração padrão:', error)
        }
        
        message.info('A configuração de reconhecimento de voz foi ignorada, por favor, configure-a na página de configurações mais tarde', 3)
        onComplete()
      } catch (error) {
        message.error('Falha ao salvar configuração, tente novamente')
        console.error('Falha ao salvar configuração:', error)
      }
    }
  }

  const saveLLMConfig = async (config: ConfigForm) => {
    try {
      // No modo Web, também é permitido salvar configurações para teste e desenvolvimento
      const isDesktop = await isDesktopMode()
      console.log('Resultado da detecção do modo desktop:', isDesktop)

      console.log('Iniciando salvamento da configuração LLM:', {
        provider: config.llmProvider,
        apiKeyLength: config.llmApiKey?.length || 0
      })

      // Primeiro, obtenha as configurações existentes para evitar limpar a chave API existente
      let existingSettings = null
      try {
        existingSettings = await settingsApi.getSettings()
      } catch (error) {
        console.warn('Falha ao obter a configuração existente, será usada a configuração padrão:', error)
      }

      // Obtém as chaves de API existentes, atualiza apenas a chave do provedor atual
      const existingApiKeys = existingSettings?.api?.api_keys || {}
      
      const settings = {
        basic: {
          app_name: "AutoClip Desktop",
          app_version: "1.0.0",
          debug_mode: false,
          auto_start: true
        },
        service: {
          host: "127.0.0.1",
          port: 8000,
          max_memory_usage: 2048
        },
        api: {
          api_keys: {
            // Atualiza apenas a chave de API do provedor atual, mantendo os valores dos outros provedores
            dashscope: config.llmProvider === 'dashscope' ? config.llmApiKey : (existingApiKeys.dashscope || ''),
            openai: config.llmProvider === 'openai' ? config.llmApiKey : (existingApiKeys.openai || ''),
            gemini: config.llmProvider === 'gemini' ? config.llmApiKey : (existingApiKeys.gemini || ''),
            siliconflow: config.llmProvider === 'siliconflow' ? config.llmApiKey : (existingApiKeys.siliconflow || ''),
            jimeng_access: existingApiKeys.jimeng_access || '',
            jimeng_secret: existingApiKeys.jimeng_secret || ''
          },
          api_model: config.llmProvider === 'dashscope' ? 'qwen-plus' : 
                     config.llmProvider === 'openai' ? 'gpt-3.5-turbo' :
                     config.llmProvider === 'gemini' ? 'gemini-pro' : 'qwen-plus',
          api_max_tokens: 4000,
          api_timeout: 30
        },
        processing: {
          processing_chunk_size: 5000,
          processing_min_score: 0.7,
          processing_max_clips: 5,
          processing_max_retries: 3
        },
        logs: {
          log_level: "INFO",
          log_file_path: "",
          log_file_max_size: 10,
          log_file_backup_count: 5
        }
      }
      
      console.log('Enviar configurações para o backend:', settings)
      const result = await settingsApi.updateSettings(settings)
      console.log('Configuração LLM salva com sucesso, resposta do backend:', result)
    } catch (error) {
      console.error('Falha ao salvar configuração LLM:', error)
      const detail = error instanceof Error ? error.message : 'Erro Desconhecido'
      throw new Error(`Falha ao salvar configuração LLM: ${detail}`)
    }
  }

  const saveSpeechConfig = async (config: ConfigForm) => {
    try {
      // Verificar se está no modo desktop
      const isDesktop = await isDesktopMode()
      if (!isDesktop) {
        console.warn('Modo não desktop, pular salvamento da configuração de voz')
        return
      }

      const values = form.getFieldsValue()
      const speechConfig = {
        method: config.speechMethod,
        whisper_config: {
          model_name: config.whisperModel || 'base',
          language: 'auto',
          enable_timestamps: true,
          enable_punctuation: true
        },
        openai_config: {
          api_key: values.openaiApiKey || '',
          language: 'auto',
          enable_timestamps: true
        },
        azure_config: {
          api_key: values.azureApiKey || '',
          region: values.azureRegion || '',
          language: 'auto',
          enable_timestamps: true,
          enable_punctuation: true
        },
        google_config: {
          api_key: values.googleApiKey || '',
          language: 'auto',
          enable_timestamps: true,
          enable_punctuation: true
        },
        aliyun_config: {
          api_key: values.aliyunApiKey || '',
          language: 'auto',
          enable_timestamps: true,
          enable_punctuation: true
        },
        custom_api_config: {
          api_key: values.customApiKey || '',
          endpoint: values.customEndpoint || '',
          language: 'auto',
          enable_timestamps: true,
          enable_punctuation: true
        },
        enable_fallback: true,
        fallback_method: 'whisper_local',
        output_format: 'srt'
      }
      
      const response = await fetch(resolveApiUrl('/api/v1/speech-recognition/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(speechConfig)
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Falha ao salvar configuração de reconhecimento de voz: ${response.status} ${errorText}`)
      }
      
      console.log('Configuração de reconhecimento de voz salva com sucesso')
    } catch (error) {
      console.error('Falha ao salvar configuração de reconhecimento de voz:', error)
      if (error instanceof Error) {
        throw new Error(`Falha ao salvar configuração de reconhecimento de voz: ${error.message}`)
      } else {
        throw new Error('Falha ao salvar configuração de reconhecimento de voz')
      }
    }
  }

  const downloadWhisperModel = async (modelName: string) => {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/speech-recognition/whisper-models/download'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      })
      
      if (!response.ok) {
        throw new Error('Falha ao baixar modelo')
      }
    } catch (error) {
      console.error('Falha no download do modelo Whisper:', error)
      // Não impedir a conclusão do assistente
    }
  }


  const testApiConnection = async (provider: string, apiKey: string) => {
    // Obter o valor mais recente da chave da API do formulário
    const formValues = form.getFieldsValue()
    const currentApiKey = formValues.llmApiKey || apiKey
    
    console.log('Parâmetros de chamada testApiConnection:', { provider, apiKey })
    console.log('Valores do formulário testApiConnection:', formValues)
    console.log('testApiConnection API Key atual:', currentApiKey)
    
    if (!currentApiKey || currentApiKey.trim() === '') {
      message.warning('Insira a API Key')
      return
    }
    
    try {
      const response = await fetch(resolveApiUrl('/api/v1/settings/test-api'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, api_key: currentApiKey })
      })
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      
      const result = await response.json()
      if (result.success) {
        message.success('Teste de conexão da API bem-sucedido!')
      } else {
        message.error(`Falha no teste de conexão da API: ${result.error || 'Erro Desconhecido'}`)
      }
    } catch (error) {
      console.error('Erro no teste da API:', error)
      const detail = error instanceof Error ? error.message : 'Erro de Rede'
      message.error(`Falha no teste de conexão da API: ${detail}`)
    }
  }

  // Dica inteligente sobre como obter a chave da API
  const getApiKeyHelp = (provider: string) => {
    const helpMap: Record<string, { name: string; url: string; description: string }> = {
      dashscope: {
        name: 'Alibaba Cloud Tongyi Qianwen',
        url: 'https://dashscope.aliyun.com',
        description: 'Registre uma conta Alibaba Cloud, ative o serviço DashScope, crie uma API Key'
      },
      openai: {
        name: 'OpenAI',
        url: 'https://platform.openai.com',
        description: 'Registre uma conta OpenAI, crie uma nova chave na página API Keys'
      },
      gemini: {
        name: 'Google Gemini',
        url: 'https://makersuite.google.com',
        description: 'Faça login com sua conta Google, crie uma chave na página API Keys'
      },
      siliconflow: {
        name: 'SiliconFlow',
        url: 'https://cloud.siliconflow.cn',
        description: 'Registre uma conta SiliconFlow, crie uma API Key no console'
      }
    }
    return helpMap[provider] || helpMap.dashscope
  }

  return (
    <div style={{ 
      maxWidth: '600px', 
      margin: '0 auto', 
      padding: '24px 16px',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center'
    }}>
      {/* Área do título do cabeçalho - Mais compacta */}
      <div style={{ textAlign: 'center', marginBottom: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <img src="/favicon.png" alt="AutoClip" style={{ width: 40, height: 40, marginBottom: '8px', display: 'block' }} />
        <Title level={2} style={{ color: '#1890ff', marginBottom: '8px' }}>
          Bem-vindo ao AutoClip
        </Title>
        <Text type="secondary" style={{ fontSize: '14px' }}>
          Vamos configurar rapidamente sua ferramenta de corte de vídeo com IA
        </Text>
      </div>

      {/* Cartão de configuração principal - Espaçamento mais compacto */}
      <Card style={{ marginBottom: '16px' }}>
        {/* Título da Etapa - Mais Compacto */}
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '4px'
          }}>
            {currentStep === 0 ? <ApiOutlined style={{ color: '#1890ff' }} /> : <SoundOutlined style={{ color: '#1890ff' }} />}
            <Title level={4} style={{ margin: 0 }}>
              {currentStep === 0 ? 'Configurar modelo de IA' : 'Configurar reconhecimento de voz'}
            </Title>
          </div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {currentStep === 0 
              ? 'Selecione o provedor do modelo de linguagem grande e insira a chave da API' 
              : 'Selecionar solução de reconhecimento de voz'
            }
          </Text>
        </div>

        <Form 
          form={form} 
          layout="vertical" 
          initialValues={config}
          onValuesChange={(changedValues, allValues) => {
            console.log('Mudança de valor do formulário:', { changedValues, allValues })
          }}
        >
          {currentStep === 0 ? (
            // Etapa de configuração LLM - layout mais compacto
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form.Item
                name="llmProvider"
                label="Selecionar provedor de modelo de IA"
                rules={[{ required: true, message: 'Selecione o provedor do modelo de IA' }]}
                style={{ marginBottom: '12px' }}
              >
                <Select size="middle" placeholder="Selecionar provedor">
                  <Option value="dashscope">
                    <Space>
                      <Text strong>Alibaba Cloud Tongyi Qianwen</Text>
                      <Text type="secondary">(Recomendado para usuários domésticos)</Text>
                    </Space>
                  </Option>
                  <Option value="openai">
                    <Space>
                      <Text strong>OpenAI GPT</Text>
                      <Text type="secondary">(Requer VPN)</Text>
                    </Space>
                  </Option>
                  <Option value="gemini">
                    <Space>
                      <Text strong>Google Gemini</Text>
                      <Text type="secondary">(Requer VPN)</Text>
                    </Space>
                  </Option>
                  <Option value="siliconflow">
                    <Space>
                      <Text strong>SiliconFlow</Text>
                      <Text type="secondary">(Alternativa doméstica)</Text>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>

              {/* Campo de entrada da API Key e botão de teste - layout horizontal */}
              <Form.Item
                name="llmApiKey"
                label="API Key"
                rules={[{ required: true, message: 'Digite a API Key' }]}
                style={{ marginBottom: '12px' }}
              >
                <div style={{ display: 'flex', gap: '8px' }}>
                  <Input.Password 
                    size="middle" 
                    placeholder="Digite sua API Key"
                    style={{ 
                      flex: 1,
                      backgroundColor: '#fafafa',
                      borderColor: '#d9d9d9'
                    }}
                  />
                  <Button 
                    type="default"
                    size="middle"
                    onClick={() => {
                      const values = form.getFieldsValue()
                      console.log('Clique no botão de teste - Valores do formulário:', values)
                      testApiConnection(values.llmProvider || 'dashscope', values.llmApiKey || '')
                    }}
                    style={{ width: '80px' }}
                    icon={<LinkOutlined />}
                  >
                    Testar
                  </Button>
                </div>
              </Form.Item>

              {/* Dica de como obter a Chave API inteligente */}
              <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.llmProvider !== currentValues.llmProvider}>
                {({ getFieldValue }) => {
                  const provider = getFieldValue('llmProvider') || 'dashscope'
                  const help = getApiKeyHelp(provider)
                  return (
                    <Alert
                      message={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <InfoCircleOutlined />
                          <span>{help.name} Como obter a API Key</span>
                        </div>
                      }
                      description={
                        <div>
                          <p style={{ margin: '4px 0', fontSize: '12px' }}>{help.description}</p>
                          <p style={{ margin: '4px 0', fontSize: '12px' }}>
                            Acessar: <ExternalLink url={help.url} text={help.url} />
                          </p>
                        </div>
                      }
                      type="info"
                      showIcon={false}
                      style={{ fontSize: '12px' }}
                    />
                  )
                }}
              </Form.Item>
            </Space>
          ) : (
            // Etapas de configuração de reconhecimento de fala - layout mais compacto
            <Space direction="vertical" size="middle" style={{ width: '100%' }}>
              <Form.Item
                name="speechMethod"
                label="Selecionar solução de reconhecimento de voz"
                rules={[{ required: true, message: 'Por favor, selecione a solução de reconhecimento de voz' }]}
                style={{ marginBottom: '12px' }}
              >
                <Select size="middle" placeholder="Selecionar Plano">
                  <Option value="whisper_local">
                    <Space>
                      <span>🆓</span>
                      <Text strong>Modelo Whisper Local</Text>
                      <Text type="secondary">(Gratuito offline, recomendado para iniciantes)</Text>
                    </Space>
                  </Option>
                  <Option value="openai_api">
                    <Space>
                      <span>🤖</span>
                      <Text strong>OpenAI Whisper API</Text>
                      <Text type="secondary">(Processamento em nuvem, maior precisão)</Text>
                    </Space>
                  </Option>
                  <Option value="azure_speech">
                    <Space>
                      <span>☁️</span>
                      <Text strong>Azure Speech Services</Text>
                      <Text type="secondary">(Serviço empresarial)</Text>
                    </Space>
                  </Option>
                  <Option value="google_speech">
                    <Space>
                      <span>🌐</span>
                      <Text strong>Google Speech-to-Text</Text>
                      <Text type="secondary">(Suporte a múltiplos idiomas)</Text>
                    </Space>
                  </Option>
                  <Option value="aliyun_speech">
                    <Space>
                      <span>☁️</span>
                      <Text strong>Reconhecimento de voz Alibaba Cloud</Text>
                      <Text type="secondary">(Otimização em chinês)</Text>
                    </Space>
                  </Option>
                  <Option value="custom_api">
                    <Space>
                      <span>⚙️</span>
                      <Text strong>API personalizada</Text>
                      <Text type="secondary">(Endpoint de serviço personalizado)</Text>
                    </Space>
                  </Option>
                </Select>
              </Form.Item>

              <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.speechMethod !== currentValues.speechMethod} noStyle>
                {({ getFieldValue }) => {
                  const speechMethod = getFieldValue('speechMethod')
                  
                  if (speechMethod === 'whisper_local') {
                    return (
                      <Form.Item
                        name="whisperModel"
                        label="Selecionar tamanho do modelo"
                        style={{ marginBottom: '12px' }}
                      >
                        <Select size="middle" placeholder="Selecionar Modelo">
                          <Option value="tiny">Tiny (39MB) - Velocidade mais rápida</Option>
                          <Option value="base">Base (74MB) - Escolha equilibrada (recomendado)</Option>
                          <Option value="small">Pequeno (244MB) - Precisão razoável</Option>
                          <Option value="medium">Médio (769MB) - Alta precisão</Option>
                          <Option value="large">Grande (1550MB) - Maior precisão</Option>
                        </Select>
                      </Form.Item>
                    )
                  }
                  
                  if (speechMethod === 'openai_api') {
                    return (
                      <Form.Item
                        name="openaiApiKey"
                        label="OpenAI API Key"
                        rules={[{ required: true, message: 'Por favor, insira a OpenAI API Key' }]}
                        style={{ marginBottom: '12px' }}
                      >
                        <Input.Password 
                          size="middle" 
                          placeholder="Por favor, insira a OpenAI API Key"
                        />
                      </Form.Item>
                    )
                  }
                  
                  if (speechMethod === 'azure_speech') {
                    return (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Form.Item
                          name="azureApiKey"
                          label="Azure API Key"
                          rules={[{ required: true, message: 'Por favor, insira a Chave de API do Azure' }]}
                          style={{ marginBottom: '8px' }}
                        >
                          <Input.Password 
                            size="middle" 
                            placeholder="Por favor, insira a chave da API Azure Speech"
                          />
                        </Form.Item>
                        <Form.Item
                          name="azureRegion"
                          label="Região do Azure"
                          style={{ marginBottom: '12px' }}
                        >
                          <Input 
                            size="middle" 
                            placeholder="Exemplo: eastus, westus2"
                          />
                        </Form.Item>
                      </Space>
                    )
                  }
                  
                  if (speechMethod === 'google_speech') {
                    return (
                      <Form.Item
                        name="googleApiKey"
                        label="Google API Key"
                        rules={[{ required: true, message: 'Por favor, insira a Google API Key' }]}
                        style={{ marginBottom: '12px' }}
                      >
                        <Input.Password 
                          size="middle" 
                          placeholder="Por favor, insira a chave da API do Google Speech-to-Text"
                        />
                      </Form.Item>
                    )
                  }
                  
                  if (speechMethod === 'aliyun_speech') {
                    return (
                      <Form.Item
                        name="aliyunApiKey"
                        label="API Key da Alibaba Cloud"
                        rules={[{ required: true, message: 'Por favor, insira a Chave API da Alibaba Cloud' }]}
                        style={{ marginBottom: '12px' }}
                      >
                        <Input.Password 
                          size="middle" 
                          placeholder="Digite a API Key de reconhecimento de voz do Alibaba Cloud"
                        />
                      </Form.Item>
                    )
                  }
                  
                  if (speechMethod === 'custom_api') {
                    return (
                      <Space direction="vertical" size="small" style={{ width: '100%' }}>
                        <Form.Item
                          name="customApiKey"
                          label="API Key personalizada"
                          rules={[{ required: true, message: 'Por favor, insira a Chave API personalizada' }]}
                          style={{ marginBottom: '8px' }}
                        >
                          <Input.Password 
                            size="middle" 
                            placeholder="Por favor, insira a Chave API personalizada"
                          />
                        </Form.Item>
                        <Form.Item
                          name="customEndpoint"
                          label="Endpoint da API"
                          rules={[{ required: true, message: 'Por favor, insira o endpoint da API' }]}
                          style={{ marginBottom: '12px' }}
                        >
                          <Input 
                            size="middle" 
                            placeholder="Exemplo: https://api.example.com/speech"
                          />
                        </Form.Item>
                      </Space>
                    )
                  }
                  
                  return null
                }}
              </Form.Item>

              {/* Descrição da configuração inteligente - Exibe a descrição correspondente de acordo com o plano selecionado */}
              <Form.Item shouldUpdate={(prevValues, currentValues) => prevValues.speechMethod !== currentValues.speechMethod} style={{ marginBottom: '8px' }}>
                {({ getFieldValue }) => {
                  const speechMethod = getFieldValue('speechMethod')
                  
                  const getMethodDescription = (method: string) => {
                    const descriptions: Record<string, { icon: string; name: string; description: string }> = {
                      whisper_local: {
                        icon: '🆓',
                        name: 'Modelo Whisper Local',
                        description: 'Uso offline gratuito, o modelo será baixado automaticamente no primeiro uso, sem necessidade de conexão com a internet posteriormente. Recomendado para usuários iniciantes.'
                      },
                      openai_api: {
                        icon: '🤖',
                        name: 'OpenAI Whisper API',
                        description: 'Processamento em nuvem, maior precisão de reconhecimento, cobrado por uso. Requer conexão de rede estável.'
                      },
                      azure_speech: {
                        icon: '☁️',
                        name: 'Azure Speech Services',
                        description: 'Serviço de reconhecimento de voz de nível empresarial, suporta múltiplos idiomas e dialetos, adequado para uso comercial.'
                      },
                      google_speech: {
                        icon: '🌐',
                        name: 'Google Speech-to-Text',
                        description: 'Suporte a múltiplos idiomas, alta precisão de reconhecimento, suporte a reconhecimento de voz em tempo real.'
                      },
                      aliyun_speech: {
                        icon: '☁️',
                        name: 'Reconhecimento de voz Alibaba Cloud',
                        description: 'Otimizado para chinês, acesso rápido na China, suporta reconhecimento de vários dialetos chineses.'
                      },
                      custom_api: {
                        icon: '⚙️',
                        name: 'API personalizada',
                        description: 'Suporta endpoint de serviço personalizado, pode integrar seu próprio serviço de reconhecimento de fala.'
                      }
                    }
                    return descriptions[method] || descriptions.whisper_local
                  }
                  
                  const methodInfo = getMethodDescription(speechMethod)
                  
                  return (
                    <Alert
                      message={
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span>{methodInfo.icon}</span>
                          <span>{methodInfo.name} Descrição da Config.</span>
                        </div>
                      }
                      description={
                        <div style={{ fontSize: '12px' }}>
                          <p style={{ margin: '4px 0' }}>{methodInfo.description}</p>
                        </div>
                      }
                      type="info"
                      showIcon={false}
                      style={{ fontSize: '12px', marginTop: '8px' }}
                    />
                  )
                }}
              </Form.Item>
            </Space>
          )}
        </Form>
      </Card>

      {/* Área do botão inferior - remover indicador de etapa, unificar estilo dos botões */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
      }}>
        <div>
          {currentStep > 0 && (
            <Button 
              size="middle"
              onClick={() => setCurrentStep(0)}
              disabled={loading}
            >
              Anterior
            </Button>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button 
            type="default"
            size="middle"
            onClick={handleSkip}
            disabled={loading}
          >
            Configurar mais tarde
          </Button>
          <Button 
            type="primary" 
            size="middle"
            onClick={handleNext}
            loading={loading}
            icon={loading ? <LoadingOutlined /> : <CheckCircleOutlined />}
          >
            {currentStep === 0 ? 'Próximo' : 'Começar a Usar'}
          </Button>
        </div>
      </div>

      {loading && (
        <div style={{ 
          textAlign: 'center', 
          marginTop: '20px',
          padding: '20px',
          background: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <LoadingOutlined style={{ fontSize: '24px', marginRight: '8px' }} />
          <Text>Salvando configuração e criando projeto de exemplo...</Text>
        </div>
      )}
    </div>
  )
}

export default FirstRunWizard