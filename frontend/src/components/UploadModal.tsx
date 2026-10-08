import React, { useState, useEffect } from 'react'
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  Space,
  Tag,
  Progress,
  message,
  Divider,
  Row,
  Col,
  Typography,
  Alert,
  Spin
} from 'antd'
import {
  UploadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import { uploadApi } from '../services/uploadApi'
import { BILIBILI_PARTITIONS } from '../services/uploadApi'

const { Option } = Select
const { TextArea } = Input
const { Text } = Typography

interface UploadModalProps {
  visible: boolean
  onCancel: () => void
  projectId: string
  clipIds: string[]
  clipTitles: string[]
  onSuccess?: () => void
}

interface UploadProgress {
  status: 'pending' | 'processing' | 'success' | 'failed'
  message: string
  progress: number
  bvid?: string
  error?: string
}

const UploadModal: React.FC<UploadModalProps> = ({
  visible,
  onCancel,
  projectId,
  clipIds,
  clipTitles,
  onSuccess
}) => {
  const [form] = Form.useForm()
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    status: 'pending',
    message: 'Preparando para upload...',
    progress: 0
  })
  const [uploadRecordId, setUploadRecordId] = useState<string>('')
  const [pollingInterval, setPollingInterval] = useState<ReturnType<typeof setInterval> | null>(null)

  // Valores iniciais do formulário
  const initialValues = {
    title: clipTitles.length === 1 ? clipTitles[0] : `${clipTitles[0]} etc.${clipIds.length}vídeos`,
    description: '',
    tags: [],
    partition_id: undefined,
    account_id: undefined
  }

  // Obter lista de contas Bilibili
  const [accounts, setAccounts] = useState<any[]>([])
  useEffect(() => {
    if (visible) {
      // Chamar API para obter lista de contas Bilibili
      uploadApi.getBilibiliAccounts()
        .then(data => {
          setAccounts(data)
        })
        .catch(error => {
          console.error('Falha ao obter lista de contas Bilibili:', error)
          // Se a chamada da API falhar, usar a conta padrão
          setAccounts([
            { id: '1', name: 'Conta principal', username: 'main_account' }
          ])
        })
    }
  }, [visible])

  // Enviar contribuição
  const handleSubmit = async (values: any) => {
    // Exibir dica de em desenvolvimento
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3)
    return
    
    // Código original desativado
    if (!values.account_id) {
      message.error('Selecione a conta Bilibili')
      return
    }

    setUploading(true)
    setUploadProgress({
      status: 'pending',
      message: 'Criando tarefa de envio...',
      progress: 10
    })

    try {
      // Criar tarefa de envio
      const response = await uploadApi.createUploadTask(projectId, {
        clip_ids: clipIds,
        account_id: values.account_id,
        title: values.title,
        description: values.description,
        tags: values.tags,
        partition_id: values.partition_id
      })

      setUploadRecordId(response.record_id)
      setUploadProgress({
        status: 'processing',
        message: `Tarefa de envio criada, processando ${response.clip_count} vídeos...`,
        progress: 30
      })

      // Iniciar pesquisa de status de upload
      startPolling(response.record_id)

      message.success('Tarefa de envio criada com sucesso!')
    } catch (error: any) {
      console.error('Falha ao criar tarefa de envio:', error)
      setUploadProgress({
        status: 'failed',
        message: `Falha ao criar tarefa de envio: ${error.message || 'Erro Desconhecido'}`,
        progress: 0,
        error: error.message
      })
      setUploading(false)
    }
  }

  // Iniciar pesquisa de status de upload
  const startPolling = (recordId: string) => {
    const interval = setInterval(async () => {
      try {
        const status = await uploadApi.getUploadRecord(recordId)
        
        if (status.status === 'success') {
          setUploadProgress({
            status: 'success',
            message: 'Envio bem-sucedido!',
            progress: 100,
            bvid: status.bvid
          })
          setUploading(false)
          clearInterval(interval)
          
          // Atrasar o fechamento do pop-up para que o usuário veja o status de sucesso
          setTimeout(() => {
            onSuccess?.()
            onCancel()
          }, 2000)
        } else if (status.status === 'failed') {
          setUploadProgress({
            status: 'failed',
            message: `Falha ao enviar: ${status.error_message || 'Erro Desconhecido'}`,
            progress: 0,
            error: status.error_message
          })
          setUploading(false)
          clearInterval(interval)
        } else if (status.status === 'processing') {
          setUploadProgress({
            status: 'processing',
            message: 'Enviando para Bilibili...',
            progress: 60
          })
        } else if (status.status === 'pending') {
          setUploadProgress({
            status: 'processing',
            message: 'Tarefa na fila, aguarde...',
            progress: 40
          })
        } else {
          // Outros estados, aumentar o progresso gradualmente
          setUploadProgress(prev => ({
            ...prev,
            message: `Status da tarefa: ${status.status}`,
            progress: Math.min(prev.progress + 5, 90)
          }))
        }
      } catch (error) {
        console.error('Falha ao obter status de upload:', error)
        setUploadProgress({
          status: 'failed',
          message: 'Falha ao obter status de upload',
          progress: 0,
          error: 'Erro de Rede'
        })
        setUploading(false)
        clearInterval(interval)
      }
    }, 2000)

    setPollingInterval(interval)
  }

  // Limpar pesquisa
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  // Limpar status ao fechar o pop-up
  const handleCancel = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }
    setUploading(false)
    setUploadProgress({
      status: 'pending',
      message: 'Preparando para upload...',
      progress: 0
    })
    setUploadRecordId('')
    form.resetFields()
    onCancel()
  }

  // Cancelar tarefa de envio
  const handleCancelUpload = async () => {
    if (!uploadRecordId) {
      handleCancel()
      return
    }

    try {
      // Chamar API de cancelamento de envio
      await uploadApi.cancelUploadTask(uploadRecordId)
      
      // Limpar status
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
      setUploading(false)
      setUploadProgress({
        status: 'pending',
        message: 'Preparando para upload...',
        progress: 0
      })
      setUploadRecordId('')
      form.resetFields()
      
      // Exibir mensagem de cancelamento bem-sucedido
      message.success('Tarefa de contribuição cancelada')
      onCancel()
    } catch (error) {
      console.error('Falha ao cancelar contribuição:', error)
      message.error('Falha ao cancelar o envio, por favor, tente novamente')
    }
  }

  // Obter ícone de status
  const getStatusIcon = () => {
    switch (uploadProgress.status) {
      case 'pending':
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />
      case 'processing':
        return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'failed':
        return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
      default:
        return <ClockCircleOutlined style={{ color: '#1890ff' }} />
    }
  }

  // Obter status da barra de progresso
  const getProgressStatus = () => {
    if (uploadProgress.status === 'failed') return 'exception'
    if (uploadProgress.status === 'success') return 'success'
    return 'active'
  }

  return (
    <Modal
      title={
        <Space>
          <UploadOutlined style={{ color: '#1890ff' }} />
          <span>Enviar para Bilibili</span>
          {clipIds.length > 1 && (
            <Tag color="blue">{clipIds.length} vídeos</Tag>
          )}
        </Space>
      }
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={700}
      destroyOnClose
      maskClosable={!uploading}
      closable={!uploading}
    >
      {!uploading ? (
        // Formulário de contribuição
        <Form
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={handleSubmit}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Conta Bilibili"
                name="account_id"
                rules={[{ required: true, message: 'Selecione a conta Bilibili' }]}
              >
                <Select placeholder="Selecione a conta Bilibili a ser usada">
                  {accounts.map(account => (
                    <Option key={account.id} value={account.id}>
                      {account.nickname || account.username} ({account.username})
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Seção"
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
            rules={[{ required: true, message: 'Por favor, insira a descrição do vídeo' }]}
          >
            <TextArea
              placeholder="Inserir descrição do vídeo"
              rows={4}
              maxLength={250}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="Etiqueta"
            name="tags"
            extra="Adicione no máximo 10 tags, separadas por vírgulas"
          >
            <Select
              mode="tags"
              placeholder="Digite as tags e pressione Enter para confirmar"
              maxTagCount={10}
              maxTagTextLength={20}
            />
          </Form.Item>

          <Divider />

          <div style={{ textAlign: 'right' }}>
            <Space>
              <Button onClick={handleCancel}>
                Cancelar
              </Button>
              <Button
                type="primary"
                onClick={() => message.info('Em desenvolvimento, aguarde', 3)}
                icon={<UploadOutlined />}
              >
                Iniciar postagem
              </Button>
            </Space>
          </div>
        </Form>
      ) : (
        // Progresso do upload
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ marginBottom: '24px' }}>
            {getStatusIcon()}
            <Text style={{ marginLeft: '8px', fontSize: '16px' }}>
              {uploadProgress.message}
            </Text>
          </div>

          <Progress
            percent={uploadProgress.progress}
            status={getProgressStatus()}
            strokeWidth={8}
            style={{ marginBottom: '24px' }}
          />

          {uploadProgress.status === 'success' && uploadProgress.bvid && (
            <Alert
              message="Envio bem-sucedido!"
              description={`Número BV: ${uploadProgress.bvid}`}
              type="success"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          )}

          {uploadProgress.status === 'failed' && uploadProgress.error && (
            <Alert
              message="Falha ao postar"
              description={uploadProgress.error}
              type="error"
              showIcon
              style={{ marginBottom: '16px' }}
            />
          )}

          {uploadProgress.status === 'processing' && (
            <div style={{ color: '#666', fontSize: '14px' }}>
              <Spin size="small" style={{ marginRight: '8px' }} />
              Processando, aguarde...
              {uploadRecordId && (
                <div style={{ marginTop: '8px', fontSize: '12px', color: '#999' }}>
                  ID da tarefa: {uploadRecordId}
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: '16px' }}>
            {uploadProgress.status === 'failed' && (
              <Button
                type="primary"
                onClick={() => {
                  setUploading(false)
                  setUploadProgress({
                    status: 'pending',
                    message: 'Preparando para upload...',
                    progress: 0
                  })
                }}
                style={{ marginRight: '8px' }}
              >
                Republicar
              </Button>
            )}
            
            <Button
              onClick={handleCancelUpload}
              disabled={uploadProgress.status === 'success'}
            >
              {uploadProgress.status === 'success' ? 'Fechar' : 'Cancelar Publicação'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}

export default UploadModal
