import React, { useState, useEffect } from 'react'
import { 
  Layout, 
  Card, 
  Button, 
  Typography, 
  Space, 
  Alert, 
  Row, 
  Col, 
  Form, 
  Input, 
  message,
  Tag,
  Descriptions,
  Collapse
} from 'antd'
import { 
  BugOutlined, 
  ApiOutlined, 
  SettingOutlined, 
  CheckCircleOutlined,
  CloseCircleOutlined,
  ReloadOutlined
} from '@ant-design/icons'
import { settingsApi } from '../services/api'
import { isDesktopMode } from '../utils/desktopMode'

const { Content } = Layout
const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

interface DebugInfo {
  desktopMode: {
    isDesktop: boolean
    source: string
    environment?: any
  }
  apiStatus: {
    settings: boolean
    desktopMode: boolean
    testApi: boolean
  }
  currentSettings: any
  errors: string[]
}

const DebugPage: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    desktopMode: { isDesktop: false, source: 'unknown' },
    apiStatus: { settings: false, desktopMode: false, testApi: false },
    currentSettings: null,
    errors: []
  })
  const [form] = Form.useForm()

  // Testar detecção de modo desktop
  const testDesktopMode = async () => {
    try {
      setLoading(true)
      const isDesktop = await isDesktopMode()
      const info = {
        isDesktop,
        source: 'frontend_check',
        environment: {
          userAgent: navigator.userAgent,
          hasTauri: Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__),
          location: window.location.href,
        }
      }
      setDebugInfo(prev => ({
        ...prev,
        desktopMode: info
      }))
      message.success('Detecção de modo desktop concluída')
    } catch (error: any) {
      const errorMsg = `Falha na detecção do modo desktop: ${error.message}`
      setDebugInfo(prev => ({
        ...prev,
        errors: [...prev.errors, errorMsg]
      }))
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Testar conexão da API
  const testApiConnections = async () => {
    const errors: string[] = []
    const apiStatus = { settings: false, desktopMode: false, testApi: false }

    try {
      setLoading(true)
      
      // Testar configuração da API
      try {
        const settings = await settingsApi.getSettings()
        apiStatus.settings = true
        setDebugInfo(prev => ({
          ...prev,
          currentSettings: settings
        }))
      } catch (error: any) {
        errors.push(`Falha ao definir API: ${error.message}`)
      }

      // Testar API do modo desktop
      try {
        const desktopMode = await settingsApi.checkDesktopMode()
        apiStatus.desktopMode = true
        console.log('Resposta da API no modo desktop:', desktopMode)
      } catch (error: any) {
        errors.push(`API do modo desktop falhou: ${error.message}`)
      }

      // Testar interface de teste da API Key
      try {
        const testResult = await settingsApi.testApiKey('dashscope', 'test-key')
        apiStatus.testApi = true
        console.log('Resposta do teste da API:', testResult)
      } catch (error: any) {
        errors.push(`Teste da API falhou: ${error.message}`)
      }

      setDebugInfo(prev => ({
        ...prev,
        apiStatus,
        errors: [...prev.errors, ...errors]
      }))

      if (errors.length === 0) {
        message.success('Todos os testes de conexão da API passaram')
      } else {
        message.warning(`Alguns testes de API falharam: ${errors.length}erros`)
      }
    } catch (error: any) {
      const errorMsg = `Falha no teste de conexão da API: ${error.message}`
      setDebugInfo(prev => ({
        ...prev,
        errors: [...prev.errors, errorMsg]
      }))
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Testar salvamento da Chave API
  const testApiKeySave = async () => {
    try {
      setLoading(true)
      const values = form.getFieldsValue()
      
      if (!values.apiKey || !values.provider) {
        message.error('Por favor, preencha a API Key e o provedor')
        return
      }

      const testSettings = {
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
            dashscope: values.provider === 'dashscope' ? values.apiKey : '',
            openai: values.provider === 'openai' ? values.apiKey : '',
            gemini: values.provider === 'gemini' ? values.apiKey : '',
            siliconflow: values.provider === 'siliconflow' ? values.apiKey : '',
            jimeng_access: '',
            jimeng_secret: ''
          },
          api_model: values.provider === 'dashscope' ? 'qwen-plus' : 
                     values.provider === 'openai' ? 'gpt-3.5-turbo' :
                     values.provider === 'gemini' ? 'gemini-pro' : 'qwen-plus',
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
          log_retention_days: 7
        }
      }

      await settingsApi.updateSettings(testSettings)
      message.success('API Key salva e testada com sucesso!')
    } catch (error: any) {
      const errorMsg = `Falha ao salvar a chave API: ${error.message}`
      setDebugInfo(prev => ({
        ...prev,
        errors: [...prev.errors, errorMsg]
      }))
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // Limpar cache e detectar novamente
  const refreshAll = async () => {
    await testDesktopMode()
    await testApiConnections()
  }

  // Detectar automaticamente ao carregar a página
  useEffect(() => {
    testDesktopMode()
    testApiConnections()
  }, [])

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      <Content style={{ padding: '24px' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <Title level={2}>
            <BugOutlined /> Página de depuração do AutoClip
          </Title>
          
          <Paragraph>
            Esta página é para depurar a detecção do modo desktop e a função de salvar a chave de API. Por favor, teste cada função em ordem.
          </Paragraph>

          <Row gutter={[16, 16]}>
            {/* Detecção de modo desktop */}
            <Col span={24}>
              <Card title="Detecção de modo desktop" extra={
                <Space>
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={testDesktopMode}
                    loading={loading}
                  >
                    Detectar Novamente
                  </Button>
                  <Button 
                    icon={<ReloadOutlined />} 
                    onClick={refreshAll}
                    loading={loading}
                  >
                    Atualizar Tudo
                  </Button>
                </Space>
              }>
                <Descriptions bordered column={2}>
                  <Descriptions.Item label="Status do modo desktop">
                    <Tag color={debugInfo.desktopMode.isDesktop ? 'green' : 'red'}>
                      {debugInfo.desktopMode.isDesktop ? 'Sim' : 'Não'}
                    </Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Detectar Fonte">
                    <Tag color="blue">{debugInfo.desktopMode.source}</Tag>
                  </Descriptions.Item>
                  <Descriptions.Item label="Informações do Ambiente" span={2}>
                    <pre style={{ margin: 0, fontSize: '12px' }}>
                      {JSON.stringify(debugInfo.desktopMode.environment, null, 2)}
                    </pre>
                  </Descriptions.Item>
                </Descriptions>
              </Card>
            </Col>

            {/* Teste de conexão da API */}
            <Col span={24}>
              <Card title="Teste de conexão da API" extra={
                <Button 
                  icon={<ApiOutlined />} 
                  onClick={testApiConnections}
                  loading={loading}
                >
                  Testar Conexão
                </Button>
              }>
                <Row gutter={16}>
                  <Col span={8}>
                    <Card size="small">
                      <Space>
                        {debugInfo.apiStatus.settings ? 
                          <CheckCircleOutlined style={{ color: 'green' }} /> : 
                          <CloseCircleOutlined style={{ color: 'red' }} />
                        }
                        <Text>Configurar API</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Space>
                        {debugInfo.apiStatus.desktopMode ? 
                          <CheckCircleOutlined style={{ color: 'green' }} /> : 
                          <CloseCircleOutlined style={{ color: 'red' }} />
                        }
                        <Text>API do modo desktop</Text>
                      </Space>
                    </Card>
                  </Col>
                  <Col span={8}>
                    <Card size="small">
                      <Space>
                        {debugInfo.apiStatus.testApi ? 
                          <CheckCircleOutlined style={{ color: 'green' }} /> : 
                          <CloseCircleOutlined style={{ color: 'red' }} />
                        }
                        <Text>Interface de teste da API</Text>
                      </Space>
                    </Card>
                  </Col>
                </Row>
              </Card>
            </Col>

            {/* Teste de salvamento da API Key */}
            <Col span={24}>
              <Card title="Teste de salvamento da API Key" extra={
                <Button 
                  type="primary"
                  icon={<SettingOutlined />} 
                  onClick={testApiKeySave}
                  loading={loading}
                >
                  Testar Salvamento
                </Button>
              }>
                <Form form={form} layout="vertical">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Form.Item
                        name="provider"
                        label="Provedor de API"
                        rules={[{ required: true, message: 'Selecione o provedor' }]}
                      >
                        <Input placeholder="dashscope, openai, gemini, siliconflow" />
                      </Form.Item>
                    </Col>
                    <Col span={12}>
                      <Form.Item
                        name="apiKey"
                        label="API Key"
                        rules={[{ required: true, message: 'Digite a API Key' }]}
                      >
                        <Input.Password placeholder="Digite a API Key" />
                      </Form.Item>
                    </Col>
                  </Row>
                </Form>
              </Card>
            </Col>

            {/* Informações de configuração atuais */}
            {debugInfo.currentSettings && (
              <Col span={24}>
                <Card title="Informações de configuração atuais">
                  <Collapse>
                    <Panel header="Ver configurações completas" key="1">
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: '16px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        maxHeight: '400px',
                        overflow: 'auto'
                      }}>
                        {JSON.stringify(debugInfo.currentSettings, null, 2)}
                      </pre>
                    </Panel>
                  </Collapse>
                </Card>
              </Col>
            )}

            {/* Mensagem de erro */}
            {debugInfo.errors.length > 0 && (
              <Col span={24}>
                <Card title="Mensagem de erro" style={{ borderColor: '#ff4d4f' }}>
                  {debugInfo.errors.map((error, index) => (
                    <Alert
                      key={index}
                      message={error}
                      type="error"
                      showIcon
                      style={{ marginBottom: '8px' }}
                    />
                  ))}
                </Card>
              </Col>
            )}

            {/* Instruções de Uso */}
            <Col span={24}>
              <Card title="Instruções de Uso">
                <Alert
                  message="Etapas de Depuração"
                  description={
                    <div>
                      <p>1. Primeiro verifique"Detecção de modo desktop"Exibir como"Sim"</p>
                      <p>2. Em seguida, teste"Teste de conexão da API", certifique-se de que todas as conexões estejam verdes</p>
                      <p>3. Por fim, em"Teste de salvamento da API Key"insira a API Key real para testar</p>
                      <p>4. Se ocorrer um erro, verifique"Mensagem de erro"Parte</p>
                    </div>
                  }
                  type="info"
                  showIcon
                />
              </Card>
            </Col>
          </Row>
        </div>
      </Content>
    </Layout>
  )
}

export default DebugPage