import React, { useState, useEffect } from 'react'
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Progress,
  Modal,
  Form,
  Select,
  DatePicker,
  Input,
  message,
  Popconfirm,
  Row,
  Col,
  Statistic,
  Divider
} from 'antd'
import {
  ReloadOutlined,
  EyeOutlined,
  StopOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import { uploadApi, BILIBILI_PARTITIONS, UploadRecord } from '../services/uploadApi'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker
const { Option } = Select
interface UploadTask {
  id: string
  project_id: string
  account_id: string
  clip_id: string
  title: string
  description: string
  tags: string
  partition_id: number
  bvid?: string
  status: string
  error_message?: string
  created_at: string
  updated_at: string
  progress?: number
  current_step?: string
}

const mapRecordToTask = (record: UploadRecord): UploadTask => ({
  id: String(record.id),
  project_id: record.project_id ? String(record.project_id) : '',
  account_id: String(record.account_id),
  clip_id: record.clip_id || '',
  title: record.title || 'Tarefa sem nome',
  description: record.description || '',
  tags: record.tags || '[]',
  partition_id: record.partition_id,
  bvid: record.bv_id,
  status: record.status,
  error_message: record.error_message,
  created_at: record.created_at,
  updated_at: record.updated_at,
  progress: record.progress,
})

interface UploadTaskManagerProps {
  projectId?: string
}

const UploadTaskManager: React.FC<UploadTaskManagerProps> = ({ projectId }) => {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [loading, setLoading] = useState(false)
  const [filteredTasks, setFilteredTasks] = useState<UploadTask[]>([])
  const [selectedTask, setSelectedTask] = useState<UploadTask | null>(null)
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [filters, setFilters] = useState({
    status: '',
    accountId: '',
    dateRange: null as any,
    keyword: ''
  })

  // Obter lista de tarefas de envio
  const fetchTasks = async () => {
    try {
      setLoading(true)
      const records = await uploadApi.getUploadRecords(projectId)
      const safeRecords = Array.isArray(records) ? records.map(mapRecordToTask) : []
      setTasks(safeRecords)
      setFilteredTasks(safeRecords)
    } catch (error: any) {
      message.error('Falha ao obter tarefa de envio: ' + (error.message || 'Erro Desconhecido'))
      setTasks([])
      setFilteredTasks([])
    } finally {
      setLoading(false)
    }
  }

  // Tentar novamente tarefas falhas
  const retryTask = async (_taskId: string) => {
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3);
    return;
    
    // Código original desativado
    try {
      // É necessário chamar a API de repetição aqui
      message.success('Tentativa de tarefa iniciada')
      fetchTasks() // Atualizar lista
    } catch (error: any) {
      message.error('Falha ao tentar novamente tarefa: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Cancelar tarefa em andamento
  const cancelTask = async (_taskId: string) => {
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3);
    return;
    
    // Código original desativado
    try {
      // É necessário chamar a API de cancelamento aqui
      message.success('Tarefa cancelada')
      fetchTasks() // Atualizar lista
    } catch (error: any) {
      message.error('Falha ao cancelar tarefa: ' + (error.message || 'Erro Desconhecido'))
    }
  }

  // Ver detalhes da tarefa
  const showTaskDetail = (task: UploadTask) => {
    setSelectedTask(task)
    setDetailModalVisible(true)
  }

  // Aplicar filtros
  const applyFilters = () => {
    const safeTasks = Array.isArray(tasks) ? tasks : []
    let filtered = safeTasks

    if (filters.status) {
      filtered = filtered.filter(task => task.status === filters.status)
    }

    if (filters.accountId) {
      filtered = filtered.filter(task => task.account_id === filters.accountId)
    }

    if (filters.keyword) {
      filtered = filtered.filter(task => 
        task.title.toLowerCase().includes(filters.keyword.toLowerCase()) ||
        task.description.toLowerCase().includes(filters.keyword.toLowerCase())
      )
    }

    if (filters.dateRange && filters.dateRange.length === 2) {
      const startDate = filters.dateRange[0].startOf('day')
      const endDate = filters.dateRange[1].endOf('day')
      filtered = filtered.filter(task => {
        const taskDate = dayjs(task.created_at)
        return taskDate.isAfter(startDate) && taskDate.isBefore(endDate)
      })
    }

    setFilteredTasks(filtered)
  }

  // Redefinir filtros
  const resetFilters = () => {
    setFilters({
      status: '',
      accountId: '',
      dateRange: null,
      keyword: ''
    })
    setFilteredTasks(Array.isArray(tasks) ? tasks : [])
  }

  // Obter cor do rótulo de status
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'orange'
      case 'processing':
        return 'blue'
      case 'success':
        return 'green'
      case 'failed':
        return 'red'
      default:
        return 'default'
    }
  }

  // Obter ícone de status
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ClockCircleOutlined />
      case 'processing':
        return <ExclamationCircleOutlined />
      case 'success':
        return <CheckCircleOutlined />
      case 'failed':
        return <CloseCircleOutlined />
      default:
        return null
    }
  }

  // Obter texto de status
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pendente'
      case 'processing':
        return 'Processando'
      case 'success':
        return 'Sucesso'
      case 'failed':
        return 'Falha'
      default:
        return status
    }
  }

  // Calcular estatísticas
  const getStatistics = () => {
    const safeTasks = Array.isArray(tasks) ? tasks : []
    const total = safeTasks.length
    const pending = safeTasks.filter(t => t.status === 'pending').length
    const processing = safeTasks.filter(t => t.status === 'processing').length
    const success = safeTasks.filter(t => t.status === 'success').length
    const failed = safeTasks.filter(t => t.status === 'failed').length

    return { total, pending, processing, success, failed }
  }

  useEffect(() => {
    fetchTasks()
  }, [projectId])

  useEffect(() => {
    applyFilters()
  }, [filters, tasks])

  const columns = [
    {
      title: 'Informações da Tarefa',
      key: 'task_info',
      render: (record: UploadTask) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{record.title}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            ID do projeto: {record.project_id.slice(0, 8)}...
          </div>
        </div>
      )
    },
    {
      title: 'Número de Segmentos',
      key: 'clip_count',
      render: (record: UploadTask) => {
        const clipCount = record.clip_id.split(',').filter(id => id.trim()).length
        return <Tag>{clipCount} fatias</Tag>
      }
    },
    {
      title: 'Seção',
      key: 'partition',
      render: (record: UploadTask) => {
        const partition = BILIBILI_PARTITIONS.find(p => p.id === record.partition_id)
        return partition ? partition.name : `Seção${record.partition_id}`
      }
    },
    {
      title: 'Status',
      key: 'status',
      render: (record: UploadTask) => (
        <Tag color={getStatusColor(record.status)} icon={getStatusIcon(record.status)}>
          {getStatusText(record.status)}
        </Tag>
      )
    },
    {
      title: 'Progresso',
      key: 'progress',
      render: (record: UploadTask) => {
        if (record.status === 'processing' && record.progress !== undefined) {
          return <Progress percent={record.progress} size="small" />
        } else if (record.status === 'success') {
          return <Progress percent={100} size="small" status="success" />
        } else if (record.status === 'failed') {
          return <Progress percent={0} size="small" status="exception" />
        }
        return <Progress percent={0} size="small" />
      }
    },
    {
      title: 'Hora de Criação',
      key: 'created_at',
      render: (record: UploadTask) => dayjs(record.created_at).format('YYYY-MM-DD HH:mm')
    },
    {
      title: 'Operação',
      key: 'actions',
      render: (record: UploadTask) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => showTaskDetail(record)}
          >
            Detalhes
          </Button>
          
          {record.status === 'failed' && (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => retryTask(record.id)}
            >
              Tentar Novamente
            </Button>
          )}
          
          {record.status === 'processing' && (
            <Popconfirm
              title="Tem certeza de que deseja cancelar esta tarefa?"
              onConfirm={() => cancelTask(record.id)}
              okText="Confirmar"
              cancelText="Cancelar"
            >
              <Button
                type="link"
                size="small"
                danger
                icon={<StopOutlined />}
              >
                Cancelar
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ]

  const stats = getStatistics()

  return (
    <div style={{ padding: '24px' }}>
      {/* Cartão de estatísticas */}
      <Row gutter={16} style={{ marginBottom: '24px' }}>
        <Col span={4}>
          <Card>
            <Statistic title="Total de tarefas" value={stats.total} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Pendente" value={stats.pending} valueStyle={{ color: '#faad14' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Processando" value={stats.processing} valueStyle={{ color: '#1890ff' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Sucesso" value={stats.success} valueStyle={{ color: '#52c41a' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic title="Falha" value={stats.failed} valueStyle={{ color: '#ff4d4f' }} />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic 
              title="Taxa de sucesso" 
              value={stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}
              suffix="%" 
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* Barra de filtro */}
      <Card style={{ marginBottom: '16px' }}>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Form.Item label="Status" style={{ marginBottom: 0 }}>
              <Select
                placeholder="Selecionar Status"
                value={filters.status}
                onChange={(value) => setFilters({ ...filters, status: value })}
                allowClear
              >
                <Option value="pending">Pendente</Option>
                <Option value="processing">Processando</Option>
                <Option value="success">Sucesso</Option>
                <Option value="failed">Falha</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Período" style={{ marginBottom: 0 }}>
              <RangePicker
                value={filters.dateRange}
                onChange={(dates) => setFilters({ ...filters, dateRange: dates })}
                placeholder={['Data de Início', 'Data de Término']}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item label="Palavra-chave" style={{ marginBottom: 0 }}>
              <Input
                placeholder="Pesquisar título ou descrição"
                value={filters.keyword}
                onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Space>
              <Button type="primary" onClick={applyFilters}>
                Filtrar
              </Button>
              <Button onClick={resetFilters}>
                Redefinir
              </Button>
              <Button icon={<ReloadOutlined />} onClick={fetchTasks}>
                Atualizar
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Lista de tarefas */}
      <Card title={`Lista de tarefas de envio (${filteredTasks.length})`}>
        <Table
          columns={columns}
          dataSource={filteredTasks}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `Nº ${range[0]}-${range[1]} itens, total ${total} item`
          }}
        />
      </Card>

      {/* Pop-up de detalhes da tarefa */}
      <Modal
        title="Detalhes da Tarefa"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDetailModalVisible(false)}>
            Fechar
          </Button>
        ]}
        width={800}
      >
        {selectedTask && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <div><strong>ID da tarefa:</strong> {selectedTask.id}</div>
                <div><strong>ID do projeto:</strong> {selectedTask.project_id}</div>
                <div><strong>Título:</strong> {selectedTask.title}</div>
                <div><strong>Descrição:</strong> {selectedTask.description}</div>
              </Col>
              <Col span={12}>
                <div><strong>Status:</strong> 
                  <Tag color={getStatusColor(selectedTask.status)} style={{ marginLeft: 8 }}>
                    {getStatusText(selectedTask.status)}
                  </Tag>
                </div>
                <div><strong>Seção:</strong> 
                  {(() => {
                    const partition = BILIBILI_PARTITIONS.find(p => p.id === selectedTask.partition_id)
                    return partition ? partition.name : `Seção${selectedTask.partition_id}`
                  })()}
                </div>
                <div><strong>Hora de criação:</strong> {dayjs(selectedTask.created_at).format('YYYY-MM-DD HH:mm:ss')}</div>
                <div><strong>Hora da atualização:</strong> {dayjs(selectedTask.updated_at).format('YYYY-MM-DD HH:mm:ss')}</div>
              </Col>
            </Row>
            
            <Divider />
            
            <div>
              <strong>Informações do clipe:</strong>
              <div style={{ marginTop: 8 }}>
                {selectedTask.clip_id.split(',').filter(id => id.trim()).map((clipId, index) => (
                  <Tag key={index} style={{ marginBottom: 4 }}>{clipId.trim()}</Tag>
                ))}
              </div>
            </div>
            
            {selectedTask.tags && (
              <>
                <Divider />
                <div>
                  <strong>Tags:</strong>
                  <div style={{ marginTop: 8 }}>
                    {JSON.parse(selectedTask.tags).map((tag: string, index: number) => (
                      <Tag key={index} color="blue">{tag}</Tag>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {selectedTask.bvid && (
              <>
                <Divider />
                <div>
                  <strong>Número BV:</strong> {selectedTask.bvid}
                </div>
              </>
            )}
            
            {selectedTask.error_message && (
              <>
                <Divider />
                <div>
                  <strong>Mensagem de erro:</strong>
                  <div style={{ marginTop: 8, color: '#ff4d4f', backgroundColor: '#fff2f0', padding: 8, borderRadius: 4 }}>
                    {selectedTask.error_message}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default UploadTaskManager



