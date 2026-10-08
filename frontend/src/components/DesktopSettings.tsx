import React, { useState, useEffect } from 'react';
import { resolveApiUrl } from '../utils/apiConfig';
import { 
  Card, 
  Tabs, 
  Form, 
  Input, 
  InputNumber, 
  Switch, 
  Button, 
  message, 
  Space,
  Typography,
  Divider,
  Row,
  Col,
  Statistic
} from 'antd';
import { 
  SettingOutlined, 
  ApiOutlined, 
  DatabaseOutlined, 
  ToolOutlined,
  SaveOutlined,
  ReloadOutlined
} from '@ant-design/icons';

const { Title } = Typography;
const { TabPane } = Tabs;

interface DesktopConfig {
  app_name: string;
  app_version: string;
  debug_mode: boolean;
  host: string;
  port: number;
  max_memory_usage: number;
  database_url: string;
  celery_broker_url: string;
  celery_result_backend: string;
  celery_worker_concurrency: number;
  dashscope_api_key: string;
  openai_api_key: string;
  gemini_api_key: string;
  siliconflow_api_key: string;
  default_model: string;
  max_tokens: number;
  timeout: number;
  chunk_size: number;
  min_score_threshold: number;
  max_clips_per_collection: number;
  max_retries: number;
  log_level: string;
  log_retention_days: number;
}

interface SystemInfo {
  platform: string;
  platform_version: string;
  architecture: string;
  processor: string;
  memory_total: number;
  memory_available: number;
  memory_usage_percent: number;
  disk_usage_percent: number;
  python_version: string;
  app_version: string;
}

interface ServiceStatus {
  is_running: boolean;
  port: number;
  uptime: string;
  memory_usage: number;
  cpu_usage: number;
  last_health_check: string;
}

const DesktopSettings: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<DesktopConfig | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null);

  // Carregar configuração
  const loadConfig = async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/desktop/config'));
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config);
        form.setFieldsValue(data.config);
      } else {
        message.error('Falha ao carregar configuração');
      }
    } catch (error) {
      console.error('Erro ao carregar configuração:', error);
      message.error('Falha ao carregar configuração');
    }
  };

  // Carregar informações do sistema
  const loadSystemInfo = async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/desktop/system/info'));
      if (response.ok) {
        const data = await response.json();
        setSystemInfo(data);
      }
    } catch (error) {
      console.error('Falha ao carregar informações do sistema:', error);
    }
  };

  // Carregar status do serviço
  const loadServiceStatus = async () => {
    try {
      const response = await fetch(resolveApiUrl('/api/v1/desktop/service/status'));
      if (response.ok) {
        const data = await response.json();
        setServiceStatus(data);
      }
    } catch (error) {
      console.error('Falha ao carregar status do serviço:', error);
    }
  };

  // Salvar configuração
  const saveConfig = async (values: DesktopConfig) => {
    setLoading(true);
    try {
      // Converte a estrutura plana para a estrutura DesktopConfig esperada pelo backend
      const configData = {
        app_name: values.app_name || "AutoClip Desktop",
        app_version: values.app_version || "1.0.0",
        debug_mode: values.debug_mode || false,
        host: values.host || "127.0.0.1",
        port: values.port || 8000,
        max_memory_usage: values.max_memory_usage || 2048,
        database_url: values.database_url || "sqlite:///data/autoclip.db",
        celery_broker_url: values.celery_broker_url || "db+sqlite:///data/celery_broker.db",
        celery_result_backend: values.celery_result_backend || "db+sqlite:///data/celery_results.db",
        celery_worker_concurrency: values.celery_worker_concurrency || 1,
        dashscope_api_key: values.dashscope_api_key || "",
        openai_api_key: values.openai_api_key || "",
        gemini_api_key: values.gemini_api_key || "",
        siliconflow_api_key: values.siliconflow_api_key || "",
        default_model: values.default_model || "qwen-plus",
        max_tokens: values.max_tokens || 4000,
        timeout: values.timeout || 30,
        chunk_size: values.chunk_size || 5000,
        min_score_threshold: values.min_score_threshold || 0.7,
        max_clips_per_collection: values.max_clips_per_collection || 5,
        max_retries: values.max_retries || 3,
        log_level: values.log_level || "INFO",
        log_retention_days: values.log_retention_days || 7
      };

      const response = await fetch(resolveApiUrl('/api/v1/desktop/config'), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configData),
      });

      if (response.ok) {
        message.success('Configuração salva com sucesso');
        setConfig(configData);
      } else {
        const errorData = await response.json();
        message.error(`Falha ao salvar configuração: ${errorData.detail || 'Erro Desconhecido'}`);
      }
    } catch (error) {
      console.error('Erro ao salvar configuração:', error);
      message.error('Falha ao salvar configuração');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
    loadSystemInfo();
    loadServiceStatus();
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>
        <SettingOutlined /> Configurações da Área de Trabalho
      </Title>
      
      <Tabs defaultActiveKey="basic">
        {/* Configurações Básicas */}
        <TabPane tab={<span><SettingOutlined />Configurações Básicas</span>} key="basic">
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={saveConfig}
              initialValues={config ?? undefined}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="app_name"
                    label="Nome do Aplicativo"
                    rules={[{ required: true, message: 'Por favor, insira o nome do aplicativo' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="app_version"
                    label="Versão do Aplicativo"
                    rules={[{ required: true, message: 'Por favor, insira a versão do aplicativo' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="debug_mode"
                label="Modo de Depuração"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Divider />

              <Title level={4}>Configuração do Serviço</Title>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="host"
                    label="Endereço do Host"
                    rules={[{ required: true, message: 'Por favor, insira o endereço do host' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="port"
                    label="Porta"
                    rules={[{ required: true, message: 'Por favor, insira a porta' }]}
                  >
                    <InputNumber min={1} max={65535} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="max_memory_usage"
                label="Uso máximo de memória (MB)"
                rules={[{ required: true, message: 'Por favor, insira o uso máximo de memória' }]}
              >
                <InputNumber min={512} max={8192} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Space>
                  <Button 
                    type="primary" 
                    htmlType="submit" 
                    loading={loading}
                    icon={<SaveOutlined />}
                  >
                    Salvar Configuração
                  </Button>
                  <Button 
                    icon={<ReloadOutlined />}
                    onClick={loadConfig}
                  >
                    Recarregar
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        {/* Configurações da API */}
        <TabPane tab={<span><ApiOutlined />Configurações da API</span>} key="api">
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={saveConfig}
              initialValues={config ?? undefined}
            >
              <Title level={4}>Chave da API</Title>
              <Form.Item
                name="dashscope_api_key"
                label="DashScope API Key"
              >
                <Input.Password placeholder="Por favor, insira a chave da API DashScope" />
              </Form.Item>

              <Form.Item
                name="openai_api_key"
                label="OpenAI API Key"
              >
                <Input.Password placeholder="Por favor, insira a OpenAI API Key" />
              </Form.Item>

              <Form.Item
                name="gemini_api_key"
                label="Gemini API Key"
              >
                <Input.Password placeholder="Por favor, insira a Gemini API Key" />
              </Form.Item>

              <Form.Item
                name="siliconflow_api_key"
                label="SiliconFlow API Key"
              >
                <Input.Password placeholder="Por favor, insira a chave da API SiliconFlow" />
              </Form.Item>

              <Divider />

              <Title level={4}>Configuração do Modelo</Title>
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="default_model"
                    label="Modelo Padrão"
                    rules={[{ required: true, message: 'Por favor, insira o modelo padrão' }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="max_tokens"
                    label="Número máximo de Tokens"
                    rules={[{ required: true, message: 'Digite o número máximo de Tokens' }]}
                  >
                    <InputNumber min={100} max={8000} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="timeout"
                label="Tempo limite (segundos)"
                rules={[{ required: true, message: 'Por favor, insira o tempo limite' }]}
              >
                <InputNumber min={10} max={300} style={{ width: '100%' }} />
              </Form.Item>

              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  icon={<SaveOutlined />}
                >
                  Salvar Configuração
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        {/* Configurações de Processamento */}
        <TabPane tab={<span><ToolOutlined />Configurações de Processamento</span>} key="processing">
          <Card>
            <Form
              form={form}
              layout="vertical"
              onFinish={saveConfig}
              initialValues={config ?? undefined}
            >
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="chunk_size"
                    label="Tamanho do bloco"
                    rules={[{ required: true, message: 'Por favor, insira o tamanho do bloco' }]}
                  >
                    <InputNumber min={1000} max={10000} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="min_score_threshold"
                    label="Limite mínimo de pontuação"
                    rules={[{ required: true, message: 'Por favor, insira o limite mínimo de pontuação' }]}
                  >
                    <InputNumber min={0.1} max={1.0} step={0.1} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="max_clips_per_collection"
                    label="Máx. de segmentos por coleção"
                    rules={[{ required: true, message: 'Por favor, insira o número máximo de segmentos' }]}
                  >
                    <InputNumber min={1} max={20} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="max_retries"
                    label="Número máximo de tentativas"
                    rules={[{ required: true, message: 'Por favor, insira o número máximo de tentativas' }]}
                  >
                    <InputNumber min={1} max={10} style={{ width: '100%' }} />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  loading={loading}
                  icon={<SaveOutlined />}
                >
                  Salvar Configuração
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </TabPane>

        {/* Informações do Sistema */}
        <TabPane tab={<span><DatabaseOutlined />Informações do Sistema</span>} key="system">
          <Card>
            {systemInfo && (
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic
                    title="Sistema Operacional"
                    value={systemInfo.platform}
                    suffix={systemInfo.platform_version}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Arquitetura"
                    value={systemInfo.architecture}
                  />
                </Col>
                <Col span={8}>
                  <Statistic
                    title="Versão Python"
                    value={systemInfo.python_version}
                  />
                </Col>
              </Row>
            )}

            {systemInfo && (
              <>
                <Divider />
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="Memória total"
                      value={formatBytes(systemInfo.memory_total)}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Memória Disponível"
                      value={formatBytes(systemInfo.memory_available)}
                    />
                  </Col>
                </Row>
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="Uso de memória"
                      value={systemInfo.memory_usage_percent}
                      suffix="%"
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="Uso de disco"
                      value={systemInfo.disk_usage_percent}
                      suffix="%"
                    />
                  </Col>
                </Row>
              </>
            )}

            {serviceStatus && (
              <>
                <Divider />
                <Title level={4}>Status do Serviço</Title>
                <Row gutter={16}>
                  <Col span={8}>
                    <Statistic
                      title="Status do Serviço"
                      value={serviceStatus.is_running ? "Em execução" : "Parado"}
                      valueStyle={{ color: serviceStatus.is_running ? '#3f8600' : '#cf1322' }}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="Porta"
                      value={serviceStatus.port}
                    />
                  </Col>
                  <Col span={8}>
                    <Statistic
                      title="Tempo de Atividade"
                      value={serviceStatus.uptime}
                    />
                  </Col>
                </Row>
              </>
            )}

            <Divider />
            <Button 
              icon={<ReloadOutlined />}
              onClick={() => {
                loadSystemInfo();
                loadServiceStatus();
              }}
            >
              Atualizar Informações
            </Button>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default DesktopSettings;
