import React, { useState, useEffect } from 'react'
import { Card, Button, Modal, Form, Input, Table, Tag, Space, message, Popconfirm, Tabs, Alert, Typography, Divider, Tooltip, Statistic } from 'antd'
import { PlusOutlined, DeleteOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined, QrcodeOutlined, ExclamationCircleOutlined, QuestionCircleOutlined, HeartOutlined, TrophyOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons'
import { uploadApi, BilibiliAccount } from '../services/uploadApi'
import CookieHelper from './CookieHelper'
import AccountHealthMonitor from './AccountHealthMonitor'

const { TextArea } = Input
const { Text, Paragraph } = Typography
const { TabPane } = Tabs

interface AccountHealth {
  score: number
  status: 'excellent' | 'good' | 'warning' | 'poor'
  lastActive: string
  uploadCount: number
  successRate: number
}

const BilibiliAccountManager: React.FC = () => {
  const [accounts, setAccounts] = useState<BilibiliAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [activeTab, setActiveTab] = useState('cookie')
  const [cookieHelperVisible, setCookieHelperVisible] = useState(false)
  const [accountsHealth, setAccountsHealth] = useState<Record<string, AccountHealth>>({})
  const [refreshing, setRefreshing] = useState(false)
  
  // Status relacionado ao formulário
  const [passwordForm] = Form.useForm()
  const [cookieForm] = Form.useForm()
  const [qrSessionId, setQrSessionId] = useState<string>('')
  const [qrLoginStatus, setQrLoginStatus] = useState<string>('')
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('')
  const [statusCheckInterval, setStatusCheckInterval] = useState<number | null>(null)

  // Obter lista de contas
  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const data = await uploadApi.getAccounts()
      setAccounts(data)
      // Obter o status de saúde da conta ao mesmo tempo
      await fetchAccountsHealth(data)
    } catch (error: any) {
      message.error('Falha ao obter lista de contas: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Obter status de saúde da conta
  const fetchAccountsHealth = async (accountList?: BilibiliAccount[]) => {
    try {
      const targetAccounts = accountList || accounts
      const healthData: Record<string, AccountHealth> = {}
      
      for (const account of targetAccounts) {
        // Simular dados de status de saúde, deve ser obtido da API na realidade
        const score = Math.floor(Math.random() * 40) + 60 // 60-100 pontos
        const uploadCount = Math.floor(Math.random() * 50) + 10
        const successRate = Math.floor(Math.random() * 30) + 70
        
        let status: AccountHealth['status'] = 'good'
        if (score >= 90) status = 'excellent'
        else if (score >= 75) status = 'good'
        else if (score >= 60) status = 'warning'
        else status = 'poor'
        
        healthData[account.id] = {
          score,
          status,
          lastActive: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
          uploadCount,
          successRate
        }
      }
      
      setAccountsHealth(healthData)
    } catch (error: any) {
      console.error('Falha ao obter status de saúde da conta:', error)
    }
  }

  // Atualizar status de saúde da conta
  const refreshAccountsHealth = async () => {
    try {
      setRefreshing(true)
      await fetchAccountsHealth()
      message.success('Status de saúde atualizado')
    } catch (error: any) {
      message.error('Falha ao atualizar: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
    
    // Limpar temporizador
    return () => {
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval)
      }
    }
  }, [])

  // Login com conta e senha
  const handlePasswordLogin = async (values: any) => {
    try {
      setLoading(true)
      await uploadApi.passwordLogin(values.username, values.password, values.nickname)
      message.success('Login com conta e senha bem-sucedido!')
      setModalVisible(false)
      passwordForm.resetFields()
      fetchAccounts()
    } catch (error: any) {
      message.error('Falha no login com conta e senha: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Login por importação de Cookie
  const handleCookieLogin = async (values: any) => {
    try {
      setLoading(true)
      
      // Analisar string de Cookie
      const cookieStr = values.cookies.trim()
      const cookies: Record<string, string> = {}
      
      cookieStr.split(';').forEach((cookie: string) => {
        const [key, value] = cookie.trim().split('=')
        if (key && value) {
          cookies[key] = value
        }
      })
      
      if (Object.keys(cookies).length === 0) {
        message.error('Formato de Cookie incorreto, verifique a entrada')
        return
      }
      
      await uploadApi.cookieLogin(cookies, values.nickname)
      message.success('Cookie importado com sucesso!')
      setModalVisible(false)
      cookieForm.resetFields()
      fetchAccounts()
    } catch (error: any) {
      message.error('Falha ao importar Cookie: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Iniciar login por QR code
  const startQRLogin = async (nickname?: string) => {
    try {
      setLoading(true)
      
      // Limpar sondagem anterior
      if (statusCheckInterval) {
        clearInterval(statusCheckInterval)
        setStatusCheckInterval(null)
      }
      
      const response = await uploadApi.startQRLogin(nickname)
      setQrSessionId(response.session_id)
      setQrLoginStatus(response.status)
      
      // Iniciar pesquisa de status de login
      let pollCount = 0
      const maxPolls = 60
      
      const interval = window.setInterval(async () => {
        try {
          pollCount++
          if (pollCount > maxPolls) {
            message.error('Login por QR code expirou, por favor, tente novamente')
            setQrSessionId('')
            setQrLoginStatus('')
            setQrCodeUrl('')
            clearInterval(interval)
            return
          }
          
          const statusResponse = await uploadApi.checkQRLoginStatus(response.session_id)
          setQrLoginStatus(statusResponse.status)
          
          if (statusResponse.qr_code) {
            setQrCodeUrl(statusResponse.qr_code)
          }
          
          if (statusResponse.status === 'success') {
            message.success('Login por QR code bem-sucedido!')
            clearInterval(interval)
            setModalVisible(false)
            fetchAccounts()
          } else if (statusResponse.status === 'failed') {
            message.error('Falha no login por QR code, por favor, tente novamente')
            clearInterval(interval)
          }
        } catch (error: any) {
          console.error('Falha ao verificar status de login:', error)
        }
      }, 1000)
      
      setStatusCheckInterval(interval)
      
    } catch (error: any) {
      message.error('Falha ao iniciar login por QR code: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Excluir conta
  const handleDeleteAccount = async (accountId: string) => {
    try {
      await uploadApi.deleteAccount(accountId)
      message.success('Conta excluída com sucesso')
      fetchAccounts()
    } catch (error: any) {
      message.error('Falha ao excluir conta: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Obter etiqueta e cor do status de saúde
  const getHealthStatusTag = (health?: AccountHealth) => {
    if (!health) return <Tag>Desconhecido</Tag>
    
    const statusConfig = {
      excellent: { color: 'green', text: 'Excelente', icon: <TrophyOutlined /> },
      good: { color: 'blue', text: 'Bom', icon: <CheckCircleOutlined /> },
      warning: { color: 'orange', text: 'Aviso', icon: <ExclamationCircleOutlined /> },
      poor: { color: 'red', text: 'Ruim', icon: <CloseCircleOutlined /> }
    }
    
    const config = statusConfig[health.status]
    return (
      <Tooltip title={`Pontuação de saúde: ${health.score}/100`}>
        <Tag color={config.color} icon={config.icon}>
          {config.text} ({health.score})
        </Tag>
      </Tooltip>
    )
  }

  // Formatar última atividade
  const formatLastActive = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    
    if (diffDays === 0) return 'Hoje'
    if (diffDays === 1) return 'Ontem'
    if (diffDays < 7) return `${diffDays}dias atrás`
    return date.toLocaleDateString()
  }

  const columns = [
    {
      title: 'Nome de usuário',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <span>{username}</span>
        </Space>
      ),
    },
    {
      title: 'Apelido',
      dataIndex: 'nickname',
      key: 'nickname',
    },
    {
      title: 'Status da Conta',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'} icon={status === 'active' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {status === 'active' ? 'Normal' : 'Anormal'}
        </Tag>
      ),
    },
    {
      title: 'Status de saúde',
      key: 'health',
      render: (_: any, record: BilibiliAccount) => getHealthStatusTag(accountsHealth[record.id]),
    },
    {
      title: 'Atividade',
      key: 'activity',
      render: (_: any, record: BilibiliAccount) => {
        const health = accountsHealth[record.id]
        if (!health) return '-'
        
        return (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <EyeOutlined style={{ color: '#1890ff' }} />
              <span style={{ fontSize: '12px' }}>Uploads: {health.uploadCount}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HeartOutlined style={{ color: '#52c41a' }} />
              <span style={{ fontSize: '12px' }}>Taxa de Sucesso: {health.successRate}%</span>
            </div>
            <div style={{ fontSize: '11px', color: '#999' }}>
              Última atividade: {formatLastActive(health.lastActive)}
            </div>
          </Space>
        )
      },
    },
    {
      title: 'Operação',
      key: 'action',
      render: (_: any, record: BilibiliAccount) => (
        <Space size="middle">
          <Tooltip title="Ver Detalhes">
            <Button type="text" icon={<EyeOutlined />} size="small">
              Detalhes
            </Button>
          </Tooltip>
          <Popconfirm
            title="Tem certeza de que deseja excluir esta conta?"
            description="Após a exclusão, não será possível recuperar, opere com cautela."
            onConfirm={() => handleDeleteAccount(record.id)}
            okText="Confirmar"
            cancelText="Cancelar"
          >
            <Button type="text" danger icon={<DeleteOutlined />} size="small">
              Excluir
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  // Calcular estatísticas gerais
  const getTotalStats = () => {
    const safeAccounts = Array.isArray(accounts) ? accounts : []
    const totalAccounts = safeAccounts.length
    const activeAccounts = safeAccounts.filter(acc => acc.status === 'active').length
    const healthScores = Object.values(accountsHealth).map(h => h.score)
    const avgHealth = healthScores.length > 0 ? Math.round(healthScores.reduce((a, b) => a + b, 0) / healthScores.length) : 0
    const excellentCount = Object.values(accountsHealth).filter(h => h.status === 'excellent').length
    
    return { totalAccounts, activeAccounts, avgHealth, excellentCount }
  }

  const stats = getTotalStats()

  return (
    <div>
      <Tabs
        defaultActiveKey="accounts"
        items={[
          {
            key: 'accounts',
            label: (
              <span>
                <UserOutlined />
                Gerenciamento de Contas
              </span>
            ),
            children: (
              <div>
                {/* Cartão de estatísticas */}
                <div style={{ marginBottom: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <Card size="small">
                    <Statistic
                      title="Total de contas"
                      value={stats.totalAccounts}
                      prefix={<UserOutlined />}
                      valueStyle={{ color: '#1890ff' }}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Contas Ativas"
                      value={stats.activeAccounts}
                      suffix={`/ ${stats.totalAccounts}`}
                      prefix={<CheckCircleOutlined />}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Pontuação média de saúde"
                      value={stats.avgHealth}
                      suffix="min"
                      prefix={<HeartOutlined />}
                      valueStyle={{ color: stats.avgHealth >= 80 ? '#52c41a' : stats.avgHealth >= 60 ? '#faad14' : '#ff4d4f' }}
                    />
                  </Card>
                  <Card size="small">
                    <Statistic
                      title="Contas Excelentes"
                      value={stats.excellentCount}
                      prefix={<TrophyOutlined />}
                      valueStyle={{ color: '#722ed1' }}
                    />
                  </Card>
                </div>

                <Card 
                  title="Gerenciamento de contas Bilibili" 
                  extra={
                    <Space>
                      <Tooltip title="Atualizar status de saúde">
                        <Button 
                          icon={<ReloadOutlined />} 
                          onClick={refreshAccountsHealth}
                          loading={refreshing}
                          size="small"
                        >
                          Atualizar
                        </Button>
                      </Tooltip>
                      <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalVisible(true)}>
                        Adicionar Conta
                      </Button>
                    </Space>
                  }
                >
                  <Table
                    columns={columns}
                    dataSource={accounts}
                    rowKey="id"
                    loading={loading}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) => `Nº ${range[0]}-${range[1]} itens, total ${total} item`
                    }}
                    scroll={{ x: 800 }}
                  />
                </Card>
              </div>
            ),
          },
          {
            key: 'health',
            label: (
              <span>
                <HeartOutlined />
                Monitoramento de Saúde
              </span>
            ),
            children: <AccountHealthMonitor onRefresh={fetchAccounts} />,
          },
        ]}
      />

      <Modal
        title="Adicionar conta Bilibili"
        open={modalVisible}
        onCancel={() => {
          setModalVisible(false)
          setQrSessionId('')
          setQrLoginStatus('')
          setQrCodeUrl('')
          if (statusCheckInterval) {
            clearInterval(statusCheckInterval)
            setStatusCheckInterval(null)
          }
        }}
        footer={null}
        width={600}
      >
        <Alert
          message="Instruções de login"
          description="Para evitar o controle de risco do Bilibili, é recomendável usar o método de importação de Cookie. O login por QR code pode acionar mecanismos de controle de risco."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Tabs activeKey={activeTab} onChange={setActiveTab}>
          <TabPane tab="Importação de Cookie" key="cookie">
            <Form form={cookieForm} onFinish={handleCookieLogin} layout="vertical">
              <Form.Item
                name="nickname"
                label="Apelido"
                rules={[{ required: true, message: 'Por favor, insira o apelido' }]}
              >
                <Input placeholder="Digite o apelido da conta" />
              </Form.Item>
              
                             <Form.Item
                 name="cookies"
                 label={
                   <Space>
                     <span>Cookie</span>
                     <Button 
                       type="link" 
                       size="small" 
                       icon={<QuestionCircleOutlined />}
                       onClick={() => setCookieHelperVisible(true)}
                     >
                       Obter Ajuda
                     </Button>
                   </Space>
                 }
                 rules={[{ required: true, message: 'Por favor, insira o Cookie' }]}
               >
                 <TextArea
                   rows={6}
                   placeholder="Por favor, copie o Cookie das ferramentas de desenvolvedor do navegador, formato como: SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"
                 />
               </Form.Item>
              
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  Importar Cookie
                </Button>
              </Form.Item>
            </Form>
            
                         <Divider />
             <Paragraph type="secondary" style={{ fontSize: '12px' }}>
               <Text strong>Obter Cookie rapidamente:</Text>
               <br />
               Clique acima"Obter Ajuda"Botão, ver guia detalhado de como obter Cookie
             </Paragraph>
          </TabPane>

          <TabPane tab="Senha da Conta" key="password">
            <Form form={passwordForm} onFinish={handlePasswordLogin} layout="vertical">
              <Form.Item
                name="username"
                label="Nome de usuário"
                rules={[{ required: true, message: 'Por favor, insira o nome de usuário' }]}
              >
                <Input placeholder="Digite o nome de usuário ou número de celular do Bilibili" />
              </Form.Item>
              
              <Form.Item
                name="password"
                label="Senha"
                rules={[{ required: true, message: 'Por favor, insira a senha' }]}
              >
                <Input.Password placeholder="Por favor, insira a senha" />
              </Form.Item>
              
              <Form.Item
                name="nickname"
                label="Apelido"
                rules={[{ required: true, message: 'Por favor, insira o apelido' }]}
              >
                <Input placeholder="Digite o apelido da conta" />
              </Form.Item>
              
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading} block>
                  Login
                </Button>
              </Form.Item>
            </Form>
            
            <Alert
              message="Atenção"
              description="O login com nome de usuário e senha pode exigir a resolução de um CAPTCHA; se encontrar problemas, é recomendável usar o método de importação de Cookie."
              type="warning"
              showIcon
            />
          </TabPane>

          <TabPane tab="Login por QR Code" key="qr">
            <div style={{ textAlign: 'center' }}>
              {!qrSessionId ? (
                <div>
                  <Form.Item label="Apelido">
                    <Input placeholder="Digite o apelido da conta (opcional)" />
                  </Form.Item>
                  <Button 
                    type="primary" 
                    icon={<QrcodeOutlined />}
                    onClick={() => startQRLogin()}
                    loading={loading}
                    block
                  >
                    Iniciar login por QR code
                  </Button>
                </div>
              ) : (
                <div>
                  {qrCodeUrl && (
                    <div style={{ marginBottom: '16px' }}>
                      <img src={qrCodeUrl} alt="Código QR" style={{ maxWidth: '200px' }} />
                    </div>
                  )}
                  
                  {qrLoginStatus === 'pending' && (
                    <p>Gerando QR code...</p>
                  )}
                  
                  {qrLoginStatus === 'processing' && (
                    <p>Por favor, use o aplicativo Bilibili para escanear o código QR</p>
                  )}
                  
                  {qrLoginStatus === 'success' && (
                    <p style={{ color: '#52c41a' }}>✅ Login bem-sucedido!</p>
                  )}
                  
                  {qrLoginStatus === 'failed' && (
                    <p style={{ color: '#ff4d4f' }}>❌ Falha no login, por favor, tente novamente</p>
                  )}
                </div>
              )}
            </div>
            
            <Alert
              message="Alerta de Risco"
              description="O login por QR code pode acionar o mecanismo de controle de risco do Bilibili, é recomendado priorizar o método de importação de Cookie."
              type="error"
              showIcon
            />
          </TabPane>
        </Tabs>
      </Modal>

      <CookieHelper 
        visible={cookieHelperVisible}
        onClose={() => setCookieHelperVisible(false)}
      />
    </div>
  )
 }

export default BilibiliAccountManager
