import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Progress,
  Tag,
  Space,
  Modal,
  Form,
  Input,
  Select,
  message,
  Tooltip,
  Statistic,
  Row,
  Col,
  Badge
} from 'antd';
import {
  ReloadOutlined,
  PlusOutlined,
  UploadOutlined,
  EyeOutlined,
  StopOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

const { TextArea } = Input;
const { Option } = Select;

interface UploadTask {
  task_id: string;
  video_path: string;
  title: string;
  description: string;
  tags: string;
  account_id?: number;
  priority: number;
  status: string;
  created_at: string;
  updated_at: string;
  progress: number;
  error_message?: string;
  retry_count: number;
  max_retries: number;
  celery_task_id?: string;
  bv_id?: string;
}

interface QueueStatus {
  queued_tasks: number;
  processing_tasks: number;
  max_concurrent: number;
  queue_details: Array<{
    task_id: string;
    title: string;
    priority: number;
    created_at: string;
  }>;
  processing_details: Array<{
    task_id: string;
    title: string;
    progress: number;
    account_id: number;
  }>;
}

interface BilibiliAccount {
  id: number;
  username: string;
  nickname?: string;
  status: string;
  is_vip: boolean;
  level: number;
  can_upload: boolean;
}

const UploadQueueManager: React.FC = () => {
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [accounts, setAccounts] = useState<BilibiliAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [addTaskModalVisible, setAddTaskModalVisible] = useState(false);
  const [batchUploadModalVisible, setBatchUploadModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [batchForm] = Form.useForm();

  // Obter status da fila
  const fetchQueueStatus = async () => {
    try {
      const response = await fetch('/api/upload-queue/status');
      if (response.ok) {
        const data = await response.json();
        setQueueStatus(data);
      }
    } catch (error) {
      console.error('Falha ao obter status da fila:', error);
    }
  };

  // Obter histórico de upload
  const fetchUploadHistory = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/upload-queue/history?limit=50');
      if (response.ok) {
        const data = await response.json();
        setTasks(data.records || []);
      }
    } catch (error) {
      console.error('Falha ao obter histórico de upload:', error);
      message.error('Falha ao obter histórico de upload');
    } finally {
      setLoading(false);
    }
  };

  // Obter lista de contas Bilibili
  const fetchAccounts = async () => {
    try {
      const response = await fetch('/bilibili/accounts');
      if (response.ok) {
        const data = await response.json();
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Falha ao obter lista de contas:', error);
    }
  };

  // Adicionar tarefa individual
  const handleAddTask = async (values: any) => {
    try {
      const response = await fetch('/api/upload-queue/add-task', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(values),
      });

      if (response.ok) {
        const data = await response.json();
        message.success(`Tarefa adicionada: ${data.task_id}`);
        setAddTaskModalVisible(false);
        form.resetFields();
        fetchQueueStatus();
        fetchUploadHistory();
      } else {
        const error = await response.json();
        message.error(`Falha ao adicionar tarefa: ${error.detail}`);
      }
    } catch (error) {
      console.error('Falha ao adicionar tarefa:', error);
      message.error('Falha ao adicionar tarefa');
    }
  };

  // Adicionar tarefas em lote
  const handleBatchUpload = async (values: any) => {
    try {
      const tasks = values.tasks.split('\n').filter((line: string) => line.trim()).map((line: string) => {
        const [video_path, title, description = '', tags = ''] = line.split('|').map((s: string) => s.trim());
        return {
          video_path,
          title,
          description,
          tags,
          priority: values.priority || 'normal'
        };
      });

      const response = await fetch('/api/upload-queue/add-batch-tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tasks }),
      });

      if (response.ok) {
        const data = await response.json();
        message.success(`Adicionado em lote ${data.count} tarefas`);
        setBatchUploadModalVisible(false);
        batchForm.resetFields();
        fetchQueueStatus();
        fetchUploadHistory();
      } else {
        const error = await response.json();
        message.error(`Falha ao adicionar em lote: ${error.detail}`);
      }
    } catch (error) {
      console.error('Falha ao adicionar em lote:', error);
      message.error('Falha ao adicionar em lote');
    }
  };

  // Cancelar tarefa
  const handleCancelTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/upload-queue/task/${taskId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        message.success('Tarefa cancelada');
        fetchQueueStatus();
        fetchUploadHistory();
      } else {
        const error = await response.json();
        message.error(`Falha ao cancelar tarefa: ${error.detail}`);
      }
    } catch (error) {
      console.error('Falha ao cancelar tarefa:', error);
      message.error('Falha ao cancelar tarefa');
    }
  };

  // Tentar novamente tarefa
  const handleRetryTask = async (taskId: string) => {
    try {
      const response = await fetch(`/api/upload-queue/retry/${taskId}`, {
        method: 'POST',
      });

      if (response.ok) {
        const data = await response.json();
        message.success(`Tarefa adicionada novamente: ${data.new_task_id}`);
        fetchQueueStatus();
        fetchUploadHistory();
      } else {
        const error = await response.json();
        message.error(`Falha ao tentar novamente tarefa: ${error.detail}`);
      }
    } catch (error) {
      console.error('Falha ao tentar novamente tarefa:', error);
      message.error('Falha ao tentar novamente a tarefa');
    }
  };

  // Obter tags de status
  const getStatusTag = (status: string) => {
    const statusConfig: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: 'Aguardando' },
      queued: { color: 'blue', text: 'Na fila' },
      processing: { color: 'orange', text: 'Processando' },
      completed: { color: 'green', text: 'Concluído' },
      failed: { color: 'red', text: 'Falha' },
      cancelled: { color: 'gray', text: 'Cancelado' }
    };
    
    const config = statusConfig[status] || { color: 'default', text: status };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // Obter tags de prioridade
  const getPriorityTag = (priority: number) => {
    const priorityConfig: Record<number, { color: string; text: string }> = {
      1: { color: 'default', text: 'Baixo' },
      2: { color: 'blue', text: 'Normal' },
      3: { color: 'orange', text: 'Alto' },
      4: { color: 'red', text: 'Urgente' }
    };
    
    const config = priorityConfig[priority] || { color: 'default', text: 'Normal' };
    return <Tag color={config.color}>{config.text}</Tag>;
  };

  // Definição de coluna da tabela
  const columns: ColumnsType<UploadTask> = [
    {
      title: 'ID da Tarefa',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 120,
      render: (text: string) => (
        <Tooltip title={text}>
          <span>{text.substring(0, 8)}...</span>
        </Tooltip>
      ),
    },
    {
      title: 'Título',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Prioridade',
      dataIndex: 'priority',
      key: 'priority',
      width: 80,
      render: (priority: number) => getPriorityTag(priority),
    },
    {
      title: 'Progresso',
      dataIndex: 'progress',
      key: 'progress',
      width: 120,
      render: (progress: number, record: UploadTask) => (
        <Progress 
          percent={progress} 
          size="small" 
          status={record.status === 'failed' ? 'exception' : 'active'}
        />
      ),
    },
    {
      title: 'ID da Conta',
      dataIndex: 'account_id',
      key: 'account_id',
      width: 80,
    },
    {
      title: 'Número BV',
      dataIndex: 'bv_id',
      key: 'bv_id',
      width: 120,
      render: (bvId: string) => bvId ? (
        <a href={`https://www.bilibili.com/video/${bvId}`} target="_blank" rel="noopener noreferrer">
          {bvId}
        </a>
      ) : '-',
    },
    {
      title: 'Hora de Criação',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: 'Operação',
      key: 'action',
      width: 150,
      render: (_, record: UploadTask) => (
        <Space size="small">
          {record.status === 'failed' && (
            <Button
              type="link"
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => handleRetryTask(record.task_id)}
            >
              Tentar Novamente
            </Button>
          )}
          {(record.status === 'queued' || record.status === 'processing') && (
            <Button
              type="link"
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => handleCancelTask(record.task_id)}
            >
              Cancelar
            </Button>
          )}
          {record.error_message && (
            <Tooltip title={record.error_message}>
              <Button type="link" size="small" icon={<EyeOutlined />}>
                Erro
              </Button>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  useEffect(() => {
    fetchQueueStatus();
    fetchUploadHistory();
    fetchAccounts();

    // Atualizar status periodicamente
    const interval = setInterval(() => {
      fetchQueueStatus();
      fetchUploadHistory();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="upload-queue-manager">
      {/* Estatísticas da fila */}
      {queueStatus && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card>
              <Statistic
                title="Tarefas na fila"
                value={queueStatus.queued_tasks}
                prefix={<Badge status="processing" />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Tarefas em processamento"
                value={queueStatus.processing_tasks}
                prefix={<Badge status="success" />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Concorrência máxima"
                value={queueStatus.max_concurrent}
                prefix={<Badge status="default" />}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Contas Disponíveis"
                value={(accounts || []).filter(acc => acc.status === 'active' && acc.can_upload).length}
                prefix={<Badge status="success" />}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Botão de ação */}
      <Card style={{ marginBottom: 16 }}>
        <Space>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setAddTaskModalVisible(true)}
          >
            Adicionar Tarefa
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={() => setBatchUploadModalVisible(true)}
          >
            Upload em Lote
          </Button>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              fetchQueueStatus();
              fetchUploadHistory();
            }}
          >
            Atualizar
          </Button>
        </Space>
      </Card>

      {/* Lista de tarefas */}
      <Card title="Tarefa de Upload">
        <Table
          columns={columns}
          dataSource={tasks}
          rowKey="task_id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Total ${total} registros`,
          }}
          scroll={{ x: 1200 }}
        />
      </Card>

      {/* Modal de adicionar tarefa */}
      <Modal
        title="Adicionar tarefa de upload"
        open={addTaskModalVisible}
        onCancel={() => setAddTaskModalVisible(false)}
        onOk={() => form.submit()}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleAddTask}
        >
          <Form.Item
            name="video_path"
            label="Caminho do arquivo de vídeo"
            rules={[{ required: true, message: 'Por favor, insira o caminho do arquivo de vídeo' }]}
          >
            <Input placeholder="/path/to/video.mp4" />
          </Form.Item>
          
          <Form.Item
            name="title"
            label="Título do Vídeo"
            rules={[{ required: true, message: 'Digite o título do vídeo' }]}
          >
            <Input placeholder="Título do Vídeo" maxLength={80} />
          </Form.Item>
          
          <Form.Item
            name="description"
            label="Descrição do Vídeo"
          >
            <TextArea rows={4} placeholder="Descrição do Vídeo" maxLength={2000} />
          </Form.Item>
          
          <Form.Item
            name="tags"
            label="Etiqueta"
          >
            <Input placeholder="Tag1,Tag2,Tag3" />
          </Form.Item>
          
          <Form.Item
            name="account_id"
            label="Especificar Conta"
          >
            <Select placeholder="Selecionar automaticamente a melhor conta" allowClear>
              {(accounts || []).filter(acc => acc.status === 'active' && acc.can_upload).map(account => (
                <Option key={account.id} value={account.id}>
                  {account.nickname || account.username} 
                  {account.is_vip && <Tag color="gold">VIP</Tag>}
                  <Tag color="blue">Lv.{account.level}</Tag>
                </Option>
              ))}
            </Select>
          </Form.Item>
          
          <Form.Item
            name="priority"
            label="Prioridade"
            initialValue="normal"
          >
            <Select>
              <Option value="low">Baixo</Option>
              <Option value="normal">Normal</Option>
              <Option value="high">Alto</Option>
              <Option value="urgent">Urgente</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* Modal de upload em lote */}
      <Modal
        title="Tarefas de upload em lote"
        open={batchUploadModalVisible}
        onCancel={() => setBatchUploadModalVisible(false)}
        onOk={() => batchForm.submit()}
        width={800}
      >
        <Form
          form={batchForm}
          layout="vertical"
          onFinish={handleBatchUpload}
        >
          <Form.Item
            name="tasks"
            label="Lista de tarefas"
            rules={[{ required: true, message: 'Por favor, insira a lista de tarefas' }]}
            extra="Uma tarefa por linha, formato: caminho do vídeo|Título|Descrição|Etiqueta"
          >
            <TextArea
              rows={10}
              placeholder={`/path/to/video1.mp4|Título do vídeo 1|Descrição do vídeo 1|Tag1,Tag2
/path/to/video2.mp4|Título do vídeo 2|Descrição do vídeo 2|Tag3,Tag4`}
            />
          </Form.Item>
          
          <Form.Item
            name="priority"
            label="Prioridade em lote"
            initialValue="normal"
          >
            <Select>
              <Option value="low">Baixo</Option>
              <Option value="normal">Normal</Option>
              <Option value="high">Alto</Option>
              <Option value="urgent">Urgente</Option>
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UploadQueueManager;