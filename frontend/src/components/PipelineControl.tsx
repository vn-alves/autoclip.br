import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Typography, Alert, Spin, Progress, Tag, List, Modal, message } from 'antd';
import { resolveApiUrl } from '../utils/apiConfig';
import { 
  PlayCircleOutlined, 
  PauseCircleOutlined, 
  ReloadOutlined, 
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined
} from '@ant-design/icons';

const { Title, Text } = Typography;

interface PipelineControlProps {
  projectId: string;
  onStatusChange?: (status: string) => void;
}

interface TaskInfo {
  id: string;
  name: string;
  status: string;
  progress: number;
  current_step: string;
  realtime_progress?: number;
  realtime_step?: string;
  step_details?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

interface PipelineStatus {
  project_id: string;
  project_status: string;
  tasks: TaskInfo[];
  total_tasks: number;
  running_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
}

const PipelineControl: React.FC<PipelineControlProps> = ({ 
  projectId, 
  onStatusChange 
}) => {
  const [pipelineStatus, setPipelineStatus] = useState<PipelineStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusModalVisible, setStatusModalVisible] = useState(false);

  // Obter status do pipeline
  const fetchPipelineStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(resolveApiUrl(`/api/v1/pipeline/status/${projectId}`));
      if (!response.ok) {
        throw new Error('Falha ao obter status do pipeline');
      }
      
      const data = await response.json();
      setPipelineStatus(data);
      
      // Notificar o componente pai sobre a mudança de status
      if (onStatusChange) {
        onStatusChange(data.project_status);
      }
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro Desconhecido');
    } finally {
      setLoading(false);
    }
  };

  // Iniciar pipeline
  const startPipeline = async () => {
    try {
      setActionLoading(true);
      
      const response = await fetch(resolveApiUrl(`/api/v1/pipeline/start/${projectId}`), {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao iniciar o pipeline');
      }
      
      const result = await response.json();
      message.success(result.message);
      
      // Atualizar status
      await fetchPipelineStatus();
      
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Falha ao Iniciar');
    } finally {
      setActionLoading(false);
    }
  };

  // Parar pipeline
  const stopPipeline = async () => {
    try {
      setActionLoading(true);
      
      const response = await fetch(resolveApiUrl(`/api/v1/pipeline/stop/${projectId}`), {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao parar o pipeline');
      }
      
      const result = await response.json();
      message.success(result.message);
      
      // Atualizar status
      await fetchPipelineStatus();
      
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Falha ao Parar');
    } finally {
      setActionLoading(false);
    }
  };

  // Reiniciar pipeline
  const restartPipeline = async () => {
    try {
      setActionLoading(true);
      
      const response = await fetch(resolveApiUrl(`/api/v1/pipeline/restart/${projectId}`), {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error('Falha ao reiniciar o pipeline');
      }
      
      const result = await response.json();
      message.success(result.message);
      
      // Atualizar status
      await fetchPipelineStatus();
      
    } catch (err) {
      message.error(err instanceof Error ? err.message : 'Falha ao Reiniciar');
    } finally {
      setActionLoading(false);
    }
  };

  // Atualizar status periodicamente
  useEffect(() => {
    if (projectId) {
      fetchPipelineStatus();
      
      // Atualizar a cada 10 segundos
      const interval = setInterval(fetchPipelineStatus, 10000);
      return () => clearInterval(interval);
    }
  }, [projectId]);

  // Obter configuração de status
  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'processing':
        return { color: 'processing', text: 'Processando', icon: <PlayCircleOutlined /> };
      case 'completed':
        return { color: 'success', text: 'Concluído', icon: <CheckCircleOutlined /> };
      case 'failed':
        return { color: 'error', text: 'Falha', icon: <CloseCircleOutlined /> };
      case 'pending':
        return { color: 'default', text: 'Aguardando', icon: <ClockCircleOutlined /> };
      case 'paused':
        return { color: 'warning', text: 'Pausado', icon: <PauseCircleOutlined /> };
      default:
        return { color: 'default', text: status, icon: <ClockCircleOutlined /> };
    }
  };

  // Obter configuração de status da tarefa
  const getTaskStatusConfig = (status: string) => {
    switch (status) {
      case 'running':
        return { color: 'processing', text: 'Em execução' };
      case 'completed':
        return { color: 'success', text: 'Concluído' };
      case 'failed':
        return { color: 'error', text: 'Falha' };
      case 'pending':
        return { color: 'default', text: 'Aguardando' };
      case 'cancelled':
        return { color: 'warning', text: 'Cancelado' };
      default:
        return { color: 'default', text: status };
    }
  };

  if (loading) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text>Obtendo status do pipeline...</Text>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card size="small" style={{ marginBottom: 16 }}>
        <Alert
          message="Falha ao obter status do pipeline"
          description={error}
          type="error"
          showIcon
          action={
            <Button size="small" onClick={fetchPipelineStatus}>
              Tentar Novamente
            </Button>
          }
        />
      </Card>
    );
  }

  if (!pipelineStatus) {
    return null;
  }

  const statusConfig = getStatusConfig(pipelineStatus.project_status);
  const canStart = pipelineStatus.project_status === 'pending' || pipelineStatus.project_status === 'failed';
  const canStop = pipelineStatus.project_status === 'processing';
  const canRestart = pipelineStatus.project_status === 'processing' || pipelineStatus.project_status === 'failed';

  return (
    <>
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
          <Space>
            {statusConfig.icon}
            <Title level={5} style={{ margin: 0 }}>
              Controle de pipeline
            </Title>
            <Tag color={statusConfig.color}>
              {statusConfig.text}
            </Tag>
          </Space>
        </div>

        {/* Botões de Controle */}
        <Space style={{ marginBottom: 16 }}>
          {canStart && (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={startPipeline}
              loading={actionLoading}
            >
              Iniciar pipeline
            </Button>
          )}
          
          {canStop && (
            <Button
              danger
              icon={<PauseCircleOutlined />}
              onClick={stopPipeline}
              loading={actionLoading}
            >
              Parar pipeline
            </Button>
          )}
          
          {canRestart && (
            <Button
              icon={<ReloadOutlined />}
              onClick={restartPipeline}
              loading={actionLoading}
            >
              Reiniciar pipeline
            </Button>
          )}
          
          <Button
            icon={<EyeOutlined />}
            onClick={() => setStatusModalVisible(true)}
          >
            Ver Detalhes
          </Button>
        </Space>

        {/* Estatísticas da Tarefa */}
        <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 16 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1890ff' }}>
              {pipelineStatus.total_tasks}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Total de tarefas</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#52c41a' }}>
              {pipelineStatus.running_tasks}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Em execução</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#faad14' }}>
              {pipelineStatus.completed_tasks}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Concluído</div>
          </div>
          
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#ff4d4f' }}>
              {pipelineStatus.failed_tasks}
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>Falha</div>
          </div>
        </div>

        {/* Progresso da tarefa atual */}
        {pipelineStatus.tasks.length > 0 && (
          <div>
            <Text strong>Tarefa atual:</Text>
            {pipelineStatus.tasks.map((task) => (
              <div key={task.id} style={{ marginTop: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text>{task.name}</Text>
                  <Tag color={getTaskStatusConfig(task.status).color}>
                    {getTaskStatusConfig(task.status).text}
                  </Tag>
                </div>
                
                <Progress
                  percent={task.realtime_progress || task.progress}
                  size="small"
                  status={task.status === 'failed' ? 'exception' : 'normal'}
                />
                
                <div style={{ fontSize: '12px', color: '#666', marginTop: 4 }}>
                  Etapas: {task.realtime_step || task.current_step}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary">Status atualizado automaticamente a cada 10 segundos</Text>
        </div>
      </Card>

      {/* Modal de detalhes do status */}
      <Modal
        title="Detalhes do status do pipeline"
        open={statusModalVisible}
        onCancel={() => setStatusModalVisible(false)}
        footer={null}
        width={800}
      >
        {pipelineStatus && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <Text strong>Status do projeto: </Text>
              <Tag color={statusConfig.color}>{statusConfig.text}</Tag>
            </div>
            
            <List
              header={<Text strong>Lista de tarefas</Text>}
              dataSource={pipelineStatus.tasks}
              renderItem={(task) => (
                <List.Item>
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text>{task.name}</Text>
                        <Tag color={getTaskStatusConfig(task.status).color}>
                          {getTaskStatusConfig(task.status).text}
                        </Tag>
                      </div>
                    }
                    description={
                      <div>
                        <div>Etapas: {task.realtime_step || task.current_step}</div>
                        {task.step_details && <div>Detalhes: {task.step_details}</div>}
                        <div>Hora de criação: {new Date(task.created_at).toLocaleString()}</div>
                        {task.started_at && (
                          <div>Hora de início: {new Date(task.started_at).toLocaleString()}</div>
                        )}
                        {task.completed_at && (
                          <div>Hora de conclusão: {new Date(task.completed_at).toLocaleString()}</div>
                        )}
                      </div>
                    }
                  />
                  
                  <div style={{ width: 200 }}>
                    <Progress
                      percent={task.realtime_progress || task.progress}
                      status={task.status === 'failed' ? 'exception' : 'normal'}
                    />
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </Modal>
    </>
  );
};

export default PipelineControl;
