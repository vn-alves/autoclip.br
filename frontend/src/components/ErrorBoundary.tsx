/**
 * Componente de limite de erro React
 * Captura erros JavaScript em componentes filhos, registra informações de erro e exibe uma UI de fallback
 */

import { Component, ErrorInfo, ReactNode } from 'react'
import { Result, Button, Card, Typography, Space, Collapse } from 'antd'
import { ReloadOutlined, BugOutlined, HomeOutlined } from '@ant-design/icons'
import { errorHandler } from '../utils/errorHandler'

const { Title, Text, Paragraph } = Typography
const { Panel } = Collapse

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
  showDetails?: boolean
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorId: string
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Atualiza o state para que a próxima renderização possa exibir a UI degradada
    return {
      hasError: true,
      error,
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Registrar informações de erro
    this.setState({ errorInfo })
    
    // Usar manipulador de erros para tratar erros
    errorHandler.handleError(error, 'ReactErrorBoundary')
    
    // Chamar função de tratamento de erro personalizada
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }
    
    // Registrar informações detalhadas de erro
    console.group('🚨 React Error Boundary')
    console.error('Error:', error)
    console.error('Error Info:', errorInfo)
    console.error('Error ID:', this.state.errorId)
    console.groupEnd()
  }

  handleReload = () => {
    // Limpar estado de erro
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    })
    
    // Atualizar página
    window.location.reload()
  }

  handleGoHome = () => {
    // Limpar estado de erro
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: ''
    })
    
    // Ir para a página inicial
    window.location.href = '/'
  }

  handleReportError = () => {
    const { error, errorInfo, errorId } = this.state
    
    if (!error) return
    
    // Criar relatório de erro
    const errorReport = {
      id: errorId,
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo?.componentStack,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      userId: localStorage.getItem('userId') || 'anonymous'
    }
    
    // Aqui pode-se enviar relatórios de erro para o servidor
    console.log('Error Report:', errorReport)
    
    // Exibir mensagem de sucesso
    // message.success('Relatório de erro enviado, obrigado pelo seu feedback!')
  }

  render() {
    if (this.state.hasError) {
      // Se houver uma UI de fallback personalizada, use-a
      if (this.props.fallback) {
        return this.props.fallback
      }
      
      const { error, errorInfo, errorId } = this.state
      
      return (
        <div style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          padding: '20px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
        }}>
          <Card 
            style={{ 
              maxWidth: '600px', 
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
              borderRadius: '12px'
            }}
          >
            <Result
              status="error"
              title="Ocorreu um erro na página"
              subTitle="Desculpe, a página encontrou um erro inesperado. Registramos o problema, por favor, tente as seguintes soluções:"
              extra={
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                  <Space>
                    <Button 
                      type="primary" 
                      icon={<ReloadOutlined />} 
                      onClick={this.handleReload}
                    >
                      Atualizar Página
                    </Button>
                    <Button 
                      icon={<HomeOutlined />} 
                      onClick={this.handleGoHome}
                    >
                      Voltar ao Início
                    </Button>
                  </Space>
                  
                  <Button 
                    type="link" 
                    icon={<BugOutlined />}
                    onClick={this.handleReportError}
                  >
                    Reportar este erro
                  </Button>
                </Space>
              }
            />
            
            {/* Detalhes do Erro */}
            {this.props.showDetails && error && (
              <div style={{ marginTop: '24px' }}>
                <Title level={5}>Detalhes do Erro</Title>
                <Paragraph>
                  <Text code>ID do erro: {errorId}</Text>
                </Paragraph>
                
                <Collapse size="small">
                  <Panel header="Mensagem de erro" key="1">
                    <pre style={{ 
                      background: '#f5f5f5', 
                      padding: '12px', 
                      borderRadius: '4px',
                      fontSize: '12px',
                      overflow: 'auto',
                      maxHeight: '200px'
                    }}>
                      {error.message}
                    </pre>
                  </Panel>
                  
                  {error.stack && (
                    <Panel header="Pilha de Erros" key="2">
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: '12px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '300px'
                      }}>
                        {error.stack}
                      </pre>
                    </Panel>
                  )}
                  
                  {errorInfo?.componentStack && (
                    <Panel header="Pilha de Componentes" key="3">
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: '12px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '300px'
                      }}>
                        {errorInfo.componentStack}
                      </pre>
                    </Panel>
                  )}
                </Collapse>
              </div>
            )}
            
            {/* Soluções comuns */}
            <div style={{ marginTop: '24px' }}>
              <Title level={5}>Soluções comuns</Title>
              <ul style={{ paddingLeft: '20px' }}>
                <li>Atualize a página e tente novamente</li>
                <li>Limpar cache e Cookies do navegador</li>
                <li>Verifique a conexão de rede</li>
                <li>Tente usar outro navegador</li>
                <li>Se o problema persistir, entre em contato com o suporte técnico</li>
              </ul>
            </div>
          </Card>
        </div>
      )
    }
    
    return this.props.children
  }
}

export default ErrorBoundary
