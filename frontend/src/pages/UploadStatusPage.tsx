import React, { useState, useEffect } from 'react';
import { 
  Card, 
  Table, 
  Tag, 
  Button, 
  Space, 
  message, 
  Progress, 
  Tooltip, 
  Modal, 
  Descriptions,
  Typography,
  Row,
  Col,
  Statistic,
  Alert,
  Popconfirm
} from 'antd';
import { 
  ReloadOutlined, 
  EyeOutlined, 
  RedoOutlined, 
  StopOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  PlayCircleOutlined
} from '@ant-design/icons';
import { uploadApi, UploadRecord } from '../services/uploadApi';
import { BILIBILI_PARTITIONS } from '../services/uploadApi';

const { Title, Text } = Typography;

interface UploadStatusPageProps {}

const UploadStatusPage: React.FC<UploadStatusPageProps> = () => {
  const [records, setRecords] = useState<UploadRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<UploadRecord | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // Obter registros de envio
  const fetchRecords = async () => {
    setLoading(true);
    try {
      const data = await uploadApi.getUploadRecords();
      setRecords(data);
    } catch (error) {
      message.error('Falha ao obter registros de envio');
      console.error('Falha ao obter registros de envio:', error);
    } finally {
      setLoading(false);
    }
  };

  // Tentar novamente o envio
  const handleRetry = async (recordId: string | number) => {
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3);
    return;
    
    // Código original desativado
    try {
      await uploadApi.retryUpload(recordId);
      message.success('Tarefa de repetição enviada');
      fetchRecords();
    } catch (error) {
      message.error('Retentar falha');
      console.error('Falha ao tentar novamente:', error);
    }
  };

  // Cancelar envio
  const handleCancel = async (recordId: string | number) => {
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3);
    return;
    
    // Código original desativado
    try {
      await uploadApi.cancelUpload(recordId);
      message.success('Tarefa cancelada');
      fetchRecords();
    } catch (error) {
      message.error('Cancelar falha');
      console.error('Falha ao cancelar:', error);
    }
  };

  // Excluir envio
  const handleDelete = async (recordId: string | number) => {
    message.info('A função de upload para Bilibili está em desenvolvimento, aguarde!', 3);
    return;
    
    // Código original desativado
    try {
      await uploadApi.deleteUpload(recordId);
      message.success('Tarefa excluída');
      fetchRecords();
    } catch (error) {
      message.error('Falha na Exclusão');
      console.error('Falha ao excluir:', error);
    }
  };

  // Ver detalhes
  const handleViewDetail = (record: UploadRecord) => {
    setSelectedRecord(record);
    setDetailModalVisible(true);
  };

  // Obter tags de status
  const getStatusTag = (status: string) => {
    const statusConfig = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: 'Aguardando' },
      processing: { color: 'processing', icon: <PlayCircleOutlined />, text: 'Processando' },
      success: { color: 'success', icon: <CheckCircleOutlined />, text: 'Sucesso' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: 'Concluído' },
      failed: { color: 'error', icon: <ExclamationCircleOutlined />, text: 'Falha' },
      cancelled: { color: 'default', icon: <StopOutlined />, text: 'Cancelado' }
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // Obter nome da seção
  const getPartitionName = (partitionId: number) => {
    const partition = BILIBILI_PARTITIONS.find(p => p.id === partitionId);
    return partition ? partition.name : `Seção${partitionId}`;
  };

  // Formatar tamanho do arquivo
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Formatar duração
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '-';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}horas${minutes}minutos`;
    } else if (minutes > 0) {
      return `${minutes}minutos${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  // Definição de coluna da tabela
  const columns = [
    {
      title: 'ID da Tarefa',
      dataIndex: 'id',
      key: 'id',
      width: 80,
      render: (id: string | number) => <Text code style={{ color: '#ffffff' }}>{id}</Text>
    },
    {
      title: 'Título',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true,
      render: (title: string) => (
        <Tooltip title={title}>
          <Text style={{ color: '#ffffff' }}>{title}</Text>
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
          <div style={{ color: '#ffffff' }}>{nickname || record.account_username}</div>
          <Text type="secondary" style={{ fontSize: '12px', color: '#cccccc' }}>
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
        <Tag style={{ color: '#ffffff' }}>{getPartitionName(partitionId)}</Tag>
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
          return <Progress percent={100} size="small" status="success" />;
        } else if (record.status === 'failed') {
          return <Progress percent={progress} size="small" status="exception" />;
        } else if (record.status === 'processing') {
          return <Progress percent={progress} size="small" status="active" />;
        } else {
          return <Progress percent={progress} size="small" />;
        }
      }
    },
    {
      title: 'Tamanho do Arquivo',
      dataIndex: 'file_size',
      key: 'file_size',
      width: 100,
      render: (fileSize: number) => <span style={{ color: '#ffffff' }}>{formatFileSize(fileSize)}</span>
    },
    {
      title: 'Hora de Criação',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 150,
      render: (date: string) => <span style={{ color: '#ffffff' }}>{new Date(date).toLocaleString()}</span>
    },
    {
      title: 'Operação',
      key: 'actions',
      width: 200,
      render: (_unused: unknown, record: UploadRecord) => (
        <Space size="small">
          <Button 
            type="link" 
            icon={<EyeOutlined style={{ color: '#4facfe' }} />} 
            onClick={() => handleViewDetail(record)}
            size="small"
            style={{ color: '#4facfe' }}
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
                icon={<RedoOutlined style={{ color: '#4facfe' }} />} 
                size="small"
                style={{ color: '#4facfe' }}
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
                icon={<StopOutlined style={{ color: '#ff4d4f' }} />} 
                danger
                size="small"
                style={{ color: '#ff4d4f' }}
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
                icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />} 
                danger
                size="small"
                style={{ color: '#ff4d4f' }}
              >
                Excluir
              </Button>
            </Popconfirm>
          )}
        </Space>
      )
    }
  ];

  // Estatísticas
  const getStatistics = () => {
    const safeRecords = Array.isArray(records) ? records : [];
    const total = safeRecords.length;
    const success = safeRecords.filter(r => r.status === 'success' || r.status === 'completed').length;
    const failed = safeRecords.filter(r => r.status === 'failed').length;
    const processing = safeRecords.filter(r => r.status === 'processing').length;
    const pending = safeRecords.filter(r => r.status === 'pending').length;
    
    return { total, success, failed, processing, pending };
  };

  const stats = getStatistics();

  useEffect(() => {
    fetchRecords();
    // Atualizar automaticamente a cada 30 segundos
    const interval = setInterval(fetchRecords, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ padding: '24px', background: '#141414', minHeight: '100vh' }}>
      <style>
        {`
          .dark-table .ant-table-thead > tr > th {
            background: #262626 !important;
            color: #ffffff !important;
            border-bottom: 1px solid #404040 !important;
            font-weight: 600 !important;
          }
          .dark-table .ant-table-tbody > tr > td {
            background: #1f1f1f !important;
            color: #ffffff !important;
            border-bottom: 1px solid #303030 !important;
          }
          .dark-table .ant-table-tbody > tr:hover > td {
            background: #262626 !important;
          }
          .dark-table .ant-pagination .ant-pagination-item {
            background: #262626 !important;
            border-color: #404040 !important;
          }
          .dark-table .ant-pagination .ant-pagination-item a {
            color: #ffffff !important;
          }
          .dark-table .ant-pagination .ant-pagination-item-active {
            background: #1890ff !important;
          }
          .dark-table .ant-pagination .ant-pagination-item-active a {
            color: #ffffff !important;
          }
          /* Garantir que todo o texto seja branco */
          .dark-table .ant-typography,
          .dark-table .ant-typography-caption,
          .dark-table .ant-typography-text,
          .dark-table .ant-typography-paragraph {
            color: #ffffff !important;
          }
          /* Garantir que o texto do botão de link esteja visível */
          .dark-table .ant-btn-link {
            color: #4facfe !important;
          }
          .dark-table .ant-btn-link:hover {
            color: #00a8ff !important;
          }
          .dark-table .ant-btn-link.ant-btn-dangerous {
            color: #ff4d4f !important;
          }
          .dark-table .ant-btn-link.ant-btn-dangerous:hover {
            color: #ff7875 !important;
          }
          /* Garantir cor correta do ícone */
          .dark-table .anticon {
            color: inherit !important;
          }
          /* Garantir visibilidade do texto da etiqueta */
          .dark-table .ant-tag {
            color: #ffffff !important;
          }
          .dark-table .ant-tag-blue {
            color: #4facfe !important;
          }
          .dark-table .ant-tag-green {
            color: #52c41a !important;
          }
          .dark-table .ant-tag-red {
            color: #ff4d4f !important;
          }
          .dark-table .ant-tag-orange {
            color: #faad14 !important;
          }
          /* Garantir que o texto da barra de progresso esteja visível */
          .dark-table .ant-progress-text {
            color: #ffffff !important;
          }
          /* Garantir que todos os elementos do paginador estejam visíveis */
          .dark-table .ant-pagination-prev,
          .dark-table .ant-pagination-next {
            color: #ffffff !important;
          }
          .dark-table .ant-pagination-prev:hover,
          .dark-table .ant-pagination-next:hover {
            color: #4facfe !important;
          }
          .dark-table .ant-pagination-options .ant-select-selector {
            color: #ffffff !important;
          }
          .dark-table .ant-pagination-options .ant-select-selection-item {
            color: #ffffff !important;
          }
          /* Estilo do modal */
          .dark-modal .ant-modal-content {
            background: #1f1f1f !important;
            border: 1px solid #303030 !important;
          }
          .dark-modal .ant-modal-header {
            background: #1f1f1f !important;
            border-bottom: 1px solid #303030 !important;
          }
          .dark-modal .ant-modal-title {
            color: #ffffff !important;
          }
          .dark-modal .ant-modal-body {
            background: #1f1f1f !important;
            color: #ffffff !important;
          }
          .dark-modal .ant-modal-close {
            color: #ffffff !important;
          }
          .dark-modal .ant-modal-close:hover {
            color: #4facfe !important;
          }
        `}
      </style>
      <Card style={{ background: '#1f1f1f', border: '1px solid #303030' }}>
        <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={3} style={{ margin: 0, color: '#ffffff' }}>Status da tarefa de envio</Title>
          <Button 
            type="primary" 
            icon={<ReloadOutlined />} 
            onClick={fetchRecords}
            loading={loading}
          >
            Atualizar
          </Button>
        </div>

        {/* Estatísticas */}
        <Row gutter={16} style={{ marginBottom: '24px' }}>
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

        {/* Lista de tarefas */}
        <Table
          columns={columns}
          dataSource={records}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `Nº ${range[0]}-${range[1]} itens, total ${total} item`
          }}
          scroll={{ x: 1200 }}
          style={{ background: '#1f1f1f' }}
          className="dark-table"
        />
      </Card>

      {/* Modal de detalhes */}
      <Modal
        title="Detalhes da tarefa de envio"
        open={detailModalVisible}
        onCancel={() => setDetailModalVisible(false)}
        footer={null}
        width={800}
        style={{ background: '#1f1f1f' }}
        styles={{
          body: { background: '#1f1f1f', color: '#ffffff' },
          header: { background: '#1f1f1f', color: '#ffffff', borderBottom: '1px solid #303030' }
        }}
        className="dark-modal"
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
                <Text code style={{ color: '#ffffff' }}>{selectedRecord.id}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Status" span={1}>
                {getStatusTag(selectedRecord.status)}
              </Descriptions.Item>
              <Descriptions.Item label="Título" span={2}>
                <Text style={{ color: '#ffffff' }}>{selectedRecord.title}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Conta de Publicação" span={1}>
                <Text style={{ color: '#ffffff' }}>{selectedRecord.account_nickname || selectedRecord.account_username}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Seção" span={1}>
                <Tag>{getPartitionName(selectedRecord.partition_id)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="Nome do projeto" span={1}>
                <Text style={{ color: '#ffffff' }}>{selectedRecord.project_name || '-'}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="ID do clipe" span={1}>
                <Text code style={{ color: '#ffffff' }}>{selectedRecord.clip_id}</Text>
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
                <Text style={{ color: '#ffffff' }}>{formatFileSize(selectedRecord.file_size)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Duração do upload" span={1}>
                <Text style={{ color: '#ffffff' }}>{formatDuration(selectedRecord.upload_duration)}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Número BV" span={1}>
                {selectedRecord.bv_id ? <Text code style={{ color: '#ffffff' }}>{selectedRecord.bv_id}</Text> : <Text style={{ color: '#ffffff' }}>-</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Número AV" span={1}>
                {selectedRecord.av_id ? <Text code style={{ color: '#ffffff' }}>{selectedRecord.av_id}</Text> : <Text style={{ color: '#ffffff' }}>-</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="Hora de Criação" span={1}>
                <Text style={{ color: '#ffffff' }}>{new Date(selectedRecord.created_at).toLocaleString()}</Text>
              </Descriptions.Item>
              <Descriptions.Item label="Hora da atualização" span={1}>
                <Text style={{ color: '#ffffff' }}>{new Date(selectedRecord.updated_at).toLocaleString()}</Text>
              </Descriptions.Item>
            </Descriptions>

            {selectedRecord.description && (
              <div style={{ marginTop: '16px' }}>
                <Title level={5} style={{ color: '#ffffff' }}>Descrição</Title>
                <Text style={{ color: '#ffffff' }}>{selectedRecord.description}</Text>
              </div>
            )}

            {selectedRecord.tags && (
              <div style={{ marginTop: '16px' }}>
                <Title level={5} style={{ color: '#ffffff' }}>Etiqueta</Title>
                <Text style={{ color: '#ffffff' }}>{selectedRecord.tags}</Text>
              </div>
            )}

            {selectedRecord.error_message && (
              <div style={{ marginTop: '16px' }}>
                <Title level={5} style={{ color: '#ffffff' }}>Mensagem de erro</Title>
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
                      handleRetry(selectedRecord.id);
                      setDetailModalVisible(false);
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
    </div>
  );
};

export default UploadStatusPage;
