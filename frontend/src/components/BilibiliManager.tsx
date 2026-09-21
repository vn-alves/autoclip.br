import React, { useState, useEffect } from 'react'
import { Button, Modal, Form, Input, Table, Tag, Space, message, Popconfirm, Tabs, Alert, Typography, Select, Row, Col, Tooltip, Progress, Descriptions, Statistic, Card } from 'antd'
import { PlusOutlined, DeleteOutlined, UserOutlined, CheckCircleOutlined, CloseCircleOutlined, UploadOutlined, QuestionCircleOutlined, ReloadOutlined, EyeOutlined, RedoOutlined, StopOutlined, ExclamationCircleOutlined, ClockCircleOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { uploadApi, BilibiliAccount, BILIBILI_PARTITIONS, UploadRecord } from '../services/uploadApi'
import { resolveApiUrl } from '../utils/apiConfig'
import './BilibiliManager.css'

const { TextArea } = Input
const { Text } = Typography
const { Option } = Select
const { TabPane } = Tabs

interface BilibiliManagerProps {
  visible: boolean
  onClose: () => void
  projectId?: string
  clipIds?: string[]
  clipTitles?: string[]
  onUploadSuccess?: () => void
}

const BilibiliManager: React.FC<BilibiliManagerProps> = ({
  visible,
  onClose,
  projectId,
  clipIds = [],
  clipTitles = [],
  onUploadSuccess
}) => {
  const [activeTab, setActiveTab] = useState('upload')
  const [accounts, setAccounts] = useState<BilibiliAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [cookieForm] = Form.useForm()
  const [uploadForm] = Form.useForm()
  
  // Status relacionados ao envio
  const [uploadRecords, setUploadRecords] = useState<UploadRecord[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<UploadRecord | null>(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)

  // Obter lista de contas
  const fetchAccounts = async () => {
    try {
      setLoading(true)
      const data = await uploadApi.getAccounts()
      setAccounts(data)
    } catch (error: any) {
      message.error('Falha ao obter lista de contas: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Obter registros de envio
  const fetchUploadRecords = async () => {
    try {
      setRecordsLoading(true)
      const data = await uploadApi.getUploadRecords()
      setUploadRecords(data)
    } catch (error: any) {
      message.error('Falha ao obter registros de envio: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setRecordsLoading(false)
    }
  }

  // Tentar novamente o envio
  const handleRetry = async (recordId: string | number) => {
    try {
      await uploadApi.retryUpload(recordId)
      message.success('Tarefa de repetição enviada')
      fetchUploadRecords()
    } catch (error: any) {
      message.error('Falha ao tentar novamente: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Cancelar envio
  const handleCancel = async (recordId: string | number) => {
    try {
      await uploadApi.cancelUpload(recordId)
      message.success('Tarefa cancelada')
      fetchUploadRecords()
    } catch (error: any) {
      message.error('Falha ao cancelar: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Excluir envio
  const handleDelete = async (recordId: string | number) => {
    try {
      await uploadApi.deleteUpload(recordId)
      message.success('Tarefa excluída')
      fetchUploadRecords()
    } catch (error: any) {
      message.error('Falha ao excluir: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Ver detalhes
  const handleViewDetail = (record: UploadRecord) => {
    setSelectedRecord(record)
    setDetailModalVisible(true)
  }

  useEffect(() => {
    if (visible) {
      fetchAccounts()
      fetchUploadRecords()
      // Se houver dados de fatia, exibir a aba de upload por padrão
      if (clipIds.length > 0) {
        setActiveTab('upload')
      } else {
        setActiveTab('accounts')
      }
    }
  }, [visible, clipIds])

  // Login por importação de Cookie
  const handleCookieLogin = async (values: any) => {
    try {
      setLoading(true)
      
      // Analisar string de Cookie
      const cookieStr = values.cookies.trim()
      const cookies: Record<string, string> = {}
      
      cookieStr.split(';').forEach((cookie: string) => {
        const trimmedCookie = cookie.trim()
        const equalIndex = trimmedCookie.indexOf('=')
        if (equalIndex > 0) {
          const key = trimmedCookie.substring(0, equalIndex).trim()
          const value = trimmedCookie.substring(equalIndex + 1).trim()
          if (key && value) {
            cookies[key] = value
          }
        }
      })
      
      if (Object.keys(cookies).length === 0) {
        message.error('Formato de Cookie incorreto, verifique a entrada')
        return
      }
      
      await uploadApi.cookieLogin(cookies, values.nickname)
      message.success('Conta adicionada com sucesso!')
      setShowAddAccount(false)
      cookieForm.resetFields()
      fetchAccounts()
    } catch (error: any) {
      message.error('Falha ao adicionar conta: ' + (error.message || 'Erro Desconhecido'))
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

  // Enviar upload
  const handleUpload = async (values: any) => {
    // Exibir dica de em desenvolvimento
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3)
    return
    
    // Código original desativado
    if (!projectId || clipIds.length === 0) {
      message.error('Nenhum clipe selecionado para upload')
      return
    }

    try {
      setLoading(true)
      
      const uploadData = {
        account_id: values.account_id,
        clip_ids: clipIds,
        title: values.title,
        description: values.description || '',
        tags: values.tags ? values.tags.split(',').map((tag: string) => tag.trim()) : [],
        partition_id: values.partition_id
      }

      // Chamar API de upload
      const response = await fetch(resolveApiUrl(`/api/v1/upload/projects/${projectId}/upload`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(uploadData)
      })

      if (response.ok) {
        message.success('Tarefa de envio criada, processando em segundo plano...')
        onUploadSuccess?.()
        onClose()
      } else {
        const error = await response.json()
        message.error('Falha ao enviar: ' + (error.detail || 'Erro Desconhecido'))
      }
    } catch (error: any) {
      message.error('Falha ao enviar: ' + (error.message || 'Erro Desconhecido'))
    } finally {
      setLoading(false)
    }
  }

  // Obter tags de status
  const getStatusTag = (status: string) => {
    const statusConfig = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: 'Aguardando' },
      processing: { color: 'processing', icon: <PlayCircleOutlined />, text: 'Processando' },
      success: { color: 'success', icon: <CheckCircleOutlined />, text: 'Sucesso' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: 'Concluído' },
      failed: { color: 'error', icon: <ExclamationCircleOutlined />, text: 'Falha' },
      cancelled: { color: 'default', icon: <StopOutlined />, text: 'Cancelado' }
    }
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    )
  }

  // Obter nome da seção
  const getPartitionName = (partitionId: number) => {
    const partition = BILIBILI_PARTITIONS.find(p => p.id === partitionId)
    return partition ? partition.name : `Seção${partitionId}`
  }

  // Formatar tamanho do arquivo
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-'
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(1024))
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`
  }

  // Formatar duração
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-'
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}horas${minutes}minutos`
    } else if (minutes > 0) {
      return `${minutes}minutos${secs}s`
    } else {
      return `${secs}s`
    }
  }

  // Obter informações estatísticas
  const getStatistics = () => {
    const safeRecords = Array.isArray(uploadRecords) ? uploadRecords : []
    const total = safeRecords.length
    const success = safeRecords.filter(r => r.status === 'success' || r.status === 'completed').length
    const failed = safeRecords.filter(r => r.status === 'failed').length
    const processing = safeRecords.filter(r => r.status === 'processing').length
    const pending = safeRecords.filter(r => r.status === 'pending').length
    
    return { total, success, failed, processing, pending }
  }

  // Conteúdo do guia de obtenção de Cookie
  const cookieGuideContent = (
    <div style={{ maxWidth: 300 }}>
      <div style={{ marginBottom: 8, fontWeight: 'bold' }}>Etapas para obter o Cookie:</div>
      <ol style={{ margin: 0, paddingLeft: 16 }}>
        <li>Abra o site Bilibili e faça login</li>
        <li>Pressione F12 para abrir as ferramentas do desenvolvedor</li>
        <li>Clique na aba Network</li>
        <li>Atualizar Página</li>
        <li>Encontre qualquer solicitação, clique para visualizar</li>
        <li>Encontre o campo Cookie nos Request Headers</li>
        <li>Copiar valor do Cookie (não inclui"Cookie: "prefixo)</li>
      </ol>
    </div>
  )

  // Colunas da tabela de gerenciamento de contas
  const accountColumns = [
    {
      title: 'Apelido',
      dataIndex: 'nickname',
      key: 'nickname',
      render: (nickname: string, record: BilibiliAccount) => (
        <Space>
          <UserOutlined />
          <span>{nickname || record.username}</span>
        </Space>
      ),
    },
    {
      title: 'Nome de usuário',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'} icon={status === 'active' ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {status === 'active' ? 'Normal' : 'Anormal'}
        </Tag>
      ),
    },
    {
      title: 'Operação',
      key: 'action',
      render: (_: any, record: BilibiliAccount) => (
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
      ),
    },
  ]

  // Colunas da tabela de status de envio
  const uploadStatusColumns = [
    {
      title: 'ID da Tarefa',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string | number) => <Text code>{id}</Text>
    },
    {
      title: 'Título',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Tooltip title={title}>
          <Text>{title}</Text>
        </Tooltip>
      )
    },
    {
      title: 'Conta de Publicação',
      dataIndex: 'account_nickname',
      key: 'account_nickname',
      width: 120,
      render: (nickname: string, record: UploadRecord) => (
        <div>
          <div>{nickname || record.account_username}</div>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            {record.account_username}
          </Text>
        </div>
      )
    },
    {
      title: 'Seção',
      dataIndex: 'partition_id',
      key: 'partition_id',
      width: 100,
      render: (partitionId: number) => (
        <Tag>{getPartitionName(partitionId)}</Tag>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status)
    },
    {
      title: 'Progresso',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress: number, record: UploadRecord) => {
        if (record.status === 'success' || record.status === 'completed') {
          return <Progress percent={100} size="small" status="success" />
        } else if (record.status === 'failed') {
          return <Progress percent={progress} size="small" status="exception" />
        } else if (record.status === 'processing') {
          return <Progress percent={progress} size="small" status="active" />
        } else {
          return <Progress percent={progress} size="small" />
        }
      }
    },
    {
      title: 'Tamanho do Arquivo',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 100,
      render: (fileSize: number) => <span>{formatFileSize(fileSize)}</span>
    },
    {
      title: 'Hora de Criação',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => <span>{new Date(date).toLocaleString()}</span>
    },
    {
      title: 'Operação',
      key: 'actions',
      width: 200,
      render: (_: any, record: UploadRecord) => (
        <Space size="small">
          <Button 
            type="link" 
            icon={<EyeOutlined />} 
            onClick={() => handleViewDetail(record)}
            size="small"
          >
            Detalhes
          </Button>
          {record.status === 'failed' && (
            <Popconfirm
              title="Tem certeza de que deseja tentar novamente esta tarefa de envio?"
              onConfirm={() => handleRetry(record.id)}
              okText="Confirmar"
              cancelText="Cancelar"
            >
              <Button 
                type="link" 
                icon={<RedoOutlined />} 
                size="small"
              >
                Tentar Novamente
              </Button>
            </Popconfirm>
          )}
          {(record.status === 'pending' || record.status === 'processing') && (
            <Popconfirm
              title="Tem certeza de que deseja cancelar esta tarefa de envio?"
              onConfirm={() => handleCancel(record.id)}
              okText="Confirmar"
              cancelText="Cancelar"
            >
              <Button 
                type="link" 
                icon={<StopOutlined />} 
                danger
                size="small"
              >
                Cancelar
              </Button>
            </Popconfirm>
          )}
          {(record.status === 'success' || record.status === 'completed' || record.status === 'failed' || record.status === 'cancelled') && (
            <Popconfirm
              title="Tem certeza de que deseja excluir esta tarefa de envio? Não poderá ser recuperada após a exclusão."
              onConfirm={() => handleDelete(record.id)}
              okText="Confirmar"
              cancelText="Cancelar"
            >
              <Button 
                type="link" 
                icon={<DeleteOutlined />} 
                danger
                size="small"
              >
                Excluir
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  return (
    <Modal
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      destroyOnClose
      className="bilibili-manager-modal"
    >
      {/* Barra de título personalizada */}
      <div className="bilibili-manager-header">
        <div className="bilibili-manager-header-icon">
          <UploadOutlined />
        </div>
        <div className="bilibili-manager-header-content">
          <h2 className="bilibili-manager-header-title">Gerenciar Bilibili</h2>
          <p className="bilibili-manager-header-subtitle">
            {clipIds.length > 0 
              ? `Pronto para enviar ${clipIds.length} fatias para Bilibili` 
              : 'Gerencie sua conta Bilibili e configurações de envio'
            }
          </p>
        </div>
      </div>

      <div className="bilibili-manager-tabs">
        <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* Aba de upload */}
        {clipIds.length > 0 && (
          <TabPane 
            tab={
              <span>
                <UploadOutlined />
                Enviar postagem
              </span>
            } 
            key="upload"
          >
            <div className="bilibili-manager-content">
              <Alert
                message="Informações da postagem"
                description={`Pronto para enviar ${clipIds.length} fatias para Bilibili`}
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />

              <Form
              form={uploadForm}
              onFinish={handleUpload}
              layout="vertical"
              initialValues={{
                title: clipTitles.length === 1 ? clipTitles[0] : `${clipTitles[0]} etc.${clipIds.length}vídeos`,
                partition_id: 4 // Área de jogo padrão
              }}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    label="Selecionar conta"
                    name="account_id"
                    rules={[{ required: true, message: 'Selecione a conta Bilibili' }]}
                  >
                    <Select 
                      placeholder="Selecione a conta Bilibili a ser usada"
                      notFoundContent={
                        <div style={{ textAlign: 'center', padding: '20px' }}>
                          <p>Nenhuma conta disponível</p>
                          <Button 
                            type="link" 
                            icon={<PlusOutlined />}
                            onClick={() => setShowAddAccount(true)}
                          >
                            Adicionar Conta
                          </Button>
                        </div>
                      }
                    >
                      {(accounts || []).filter(acc => acc.status === 'active').map(account => (
                        <Option key={account.id} value={account.id}>
                          {account.nickname || account.username}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    label="Seção do vídeo"
                    name="partition_id"
                    rules={[{ required: true, message: 'Selecione a categoria do vídeo' }]}
                  >
                    <Select placeholder="Selecionar seção de vídeo" showSearch>
                      {BILIBILI_PARTITIONS.map(partition => (
                        <Option key={partition.id} value={partition.id}>
                          {partition.name}
                        </Option>
                      ))}
                    </Select>
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                label="Título"
                name="title"
                rules={[{ required: true, message: 'Digite o título do vídeo' }]}
              >
                <Input placeholder="Inserir título do vídeo" maxLength={80} showCount />
              </Form.Item>

              <Form.Item
                label="Descrição"
                name="description"
              >
                <TextArea
                  placeholder="Insira a descrição do vídeo (opcional)"
                  rows={3}
                  maxLength={2000}
                  showCount
                />
              </Form.Item>

              <Form.Item
                label="Etiqueta"
                name="tags"
              >
                <Input placeholder="Digite as tags, separadas por vírgulas (opcional)" />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button 
                    type="primary" 
                    onClick={() => message.info('Em desenvolvimento, aguarde', 3)}
                    icon={<UploadOutlined />}
                  >
                    Iniciar postagem
                  </Button>
                  <Button onClick={onClose}>
                    Cancelar
                  </Button>
                </Space>
              </Form.Item>
              </Form>
            </div>
          </TabPane>
        )}

        {/* Aba de gerenciamento de contas */}
        <TabPane 
          tab={
            <span>
              <UserOutlined />
              Gerenciamento de Contas
            </span>
          } 
          key="accounts"
        >
          <div className="bilibili-manager-content">
            <div style={{ marginBottom: 16 }}>
              <Button 
                type="primary" 
                icon={<PlusOutlined />} 
                onClick={() => setShowAddAccount(true)}
              >
                Adicionar Conta
              </Button>
            </div>

            <Table
              columns={accountColumns}
              dataSource={accounts}
              rowKey="id"
              loading={loading}
              pagination={false}
              size="small"
            />
          </div>
        </TabPane>

        {/* Aba de status de envio */}
        <TabPane 
          tab={
            <span>
              <ReloadOutlined />
              Status da postagem
            </span>
          } 
          key="status"
        >
          <div className="bilibili-manager-content">
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#ffffff' }}>Status da tarefa de envio</h3>
              <Button 
                type="primary" 
                icon={<ReloadOutlined />} 
                onClick={fetchUploadRecords}
                loading={recordsLoading}
              >
                Atualizar
              </Button>
            </div>

            {/* Estatísticas */}
            {(() => {
              const stats = getStatistics()
              return (
                <Row gutter={16} style={{ marginBottom: 24 }}>
                  <Col span={6}>
                    <Card style={{ background: '#262626', border: '1px solid #404040' }}>
                      <Statistic 
                        title={<span style={{ color: '#ffffff' }}>Total de tarefas</span>} 
                        value={stats.total} 
                        valueStyle={{ color: '#ffffff' }} 
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={{ background: '#262626', border: '1px solid #404040' }}>
                      <Statistic 
                        title={<span style={{ color: '#ffffff' }}>Sucesso</span>} 
                        value={stats.success} 
                        valueStyle={{ color: '#52c41a' }}
                        prefix={<CheckCircleOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={{ background: '#262626', border: '1px solid #404040' }}>
                      <Statistic 
                        title={<span style={{ color: '#ffffff' }}>Falha</span>} 
                        value={stats.failed} 
                        valueStyle={{ color: '#ff4d4f' }}
                        prefix={<ExclamationCircleOutlined />}
                      />
                    </Card>
                  </Col>
                  <Col span={6}>
                    <Card style={{ background: '#262626', border: '1px solid #404040' }}>
                      <Statistic 
                        title={<span style={{ color: '#ffffff' }}>Em andamento</span>} 
                        value={stats.processing + stats.pending} 
                        valueStyle={{ color: '#1890ff' }}
                        prefix={<PlayCircleOutlined />}
                      />
                    </Card>
                  </Col>
                </Row>
              )
            })()}

            {/* Lista de tarefas */}
            <Table
              columns={uploadStatusColumns}
              dataSource={uploadRecords}
              rowKey="id"
              loading={recordsLoading}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => `Nº ${range[0]}-${range[1]} itens, total ${total} item`
              }}
              scroll={{ x: 1200 }}
              size="small"
            />
          </div>
        </TabPane>
      </Tabs>
      </div>

      {/* Pop-up de adicionar conta */}
      <Modal
        title="Adicionar conta Bilibili"
        open={showAddAccount}
        onCancel={() => {
          setShowAddAccount(false)
          cookieForm.resetFields()
        }}
        footer={null}
        width={600}
      >
        <Alert
          message="Recomendado importar Cookie"
          description="A importação de Cookie é a forma de login mais segura e estável, não acionará o controle de risco do Bilibili."
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={cookieForm} onFinish={handleCookieLogin} layout="vertical">
          <Form.Item
            name="nickname"
            label="Apelido da conta"
            rules={[{ required: true, message: 'Digite o apelido da conta' }]}
          >
            <Input placeholder="Digite o apelido da conta para identificação" />
          </Form.Item>
          
          <Form.Item
            name="cookies"
            label={
              <Space>
                <span>Cookie</span>
                <Tooltip title={cookieGuideContent} placement="topLeft">
                  <Button 
                    type="link" 
                    size="small" 
                    icon={<QuestionCircleOutlined />}
                  >
                    Obter guia
                  </Button>
                </Tooltip>
              </Space>
            }
            rules={[
              { required: true, message: 'Por favor, insira o Cookie' },
              { min: 10, message: 'O comprimento do Cookie não pode ser inferior a 10 caracteres' }
            ]}
          >
            <TextArea
              rows={4}
              placeholder="Por favor, copie o Cookie das ferramentas de desenvolvedor do navegador, formato como: SESSDATA=xxx; bili_jct=xxx; DedeUserID=xxx"
            />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading}>
                Adicionar Conta
              </Button>
              <Button onClick={() => setShowAddAccount(false)}>
                Cancelar
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal de detalhes do status de envio */}
      <Modal
        title="Detalhes da tarefa de envio"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
        className="bilibili-manager-modal"
      >
        {selectedRecord && (
          <div>
            <Descriptions 
              column={2} 
              bordered
              labelStyle={{ 
                background: '#1f1f1f', 
                color: '#ffffff',
                fontWeight: 'bold',
                borderRight: '1px solid #303030'
              }}
              contentStyle={{ 
                background: '#262626', 
                color: '#ffffff',
                borderLeft: '1px solid #303030'
              }}
              style={{ 
                background: '#262626',
                border: '1px solid #303030'
              }}
            >
              <Descriptions.Item label="ID da Tarefa" span={1}>
                <Text code>{selectedRecord.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status" span={1}>
                {getStatusTag(selectedRecord.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Título" span={2}>
                <Text>{selectedRecord.title}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Conta de Publicação" span={1}>
                <Text>{selectedRecord.account_nickname || selectedRecord.account_username}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Seção" span={1}>
                <Tag>{getPartitionName(selectedRecord.partition_id)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Nome do projeto" span={1}>
                <Text>{selectedRecord.project_name || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="ID do clipe" span={1}>
                <Text code>{selectedRecord.clip_id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Progresso" span={2}>
                <Progress 
                  percent={selectedRecord.progress} 
                  status={
                    selectedRecord.status === 'failed' ? 'exception' :
                    selectedRecord.status === 'success' || selectedRecord.status === 'completed' ? 'success' :
                    selectedRecord.status === 'processing' ? 'active' : 'normal'
                  }
                />
              </Descriptions.Item>
              <Descriptions.Item label="Tamanho do Arquivo" span={1}>
                <Text>{formatFileSize(selectedRecord.file_size)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Duração do upload" span={1}>
                <Text>{formatDuration(selectedRecord.upload_duration)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Número BV" span={1}>
                {selectedRecord.bv_id ? <Text code>{selectedRecord.bv_id}</Text> : <Text>-</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Número AV" span={1}>
                {selectedRecord.av_id ? <Text code>{selectedRecord.av_id}</Text> : <Text>-</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Hora de Criação" span={1}>
                <Text>{new Date(selectedRecord.created_at).toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Hora da atualização" span={1}>
                <Text>{new Date(selectedRecord.updated_at).toLocaleString()}</Text>
              </Descriptions.Item>
            </Descriptions>

            {selectedRecord.description && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ color: '#ffffff' }}>Descrição</h4>
                <Text>{selectedRecord.description}</Text>
              </div>
            )}

            {selectedRecord.tags && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ color: '#ffffff' }}>Etiqueta</h4>
                <Text>{selectedRecord.tags}</Text>
              </div>
            )}

            {selectedRecord.error_message && (
              <div style={{ marginTop: '16px' }}>
                <h4 style={{ color: '#ffffff' }}>Mensagem de erro</h4>
                <Alert
                  message="Falha ao postar"
                  description={selectedRecord.error_message}
                  type="error"
                  showIcon
                />
              </div>
            )}

            <div style={{ marginTop: '24px', textAlign: 'right' }}>
              <Space>
                {selectedRecord.status === 'failed' && (
                  <Popconfirm
                    title="Tem certeza de que deseja tentar novamente esta tarefa de envio?"
                    onConfirm={() => {
                      handleRetry(selectedRecord.id)
                      setDetailModalVisible(false)
                    }}
                    okText="Confirmar"
                    cancelText="Cancelar"
                  >
                    <Button type="primary" icon={<RedoOutlined />}>
                      Tentar Novamente
                    </Button>
                  </Popconfirm>
                )}
                <Button onClick={() => setDetailModalVisible(false)}>
                  Fechar
                </Button>
              </Space>
            </div>
          </div>
        )}
      </Modal>
    </Modal>
  )
}

export default BilibiliManager
