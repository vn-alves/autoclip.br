import React, { useState } from 'react'
import { Modal, Steps, Card, Typography, Alert, Button, Space, Divider } from 'antd'
import { QuestionCircleOutlined, CopyOutlined, CheckOutlined } from '@ant-design/icons'

const { Paragraph, Text } = Typography
const { Step } = Steps

interface CookieHelperProps {
  visible: boolean
  onClose: () => void
}

const CookieHelper: React.FC<CookieHelperProps> = ({ visible, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0)
  const [copied, setCopied] = useState(false)

  const steps = [
    {
      title: 'Entrar no Bilibili',
      description: 'Faça login na conta Bilibili no navegador',
      content: (
        <div>
          <Alert
            message="Passo um: Faça login no Bilibili"
            description="Por favor, certifique-se de que você fez login com sucesso na sua conta Bilibili no navegador"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              1. Abra o navegador, acesse <Text code>https://www.bilibili.com</Text>
            </Paragraph>
            <Paragraph>
              2. Clique no canto superior direito"Login"Botão
            </Paragraph>
            <Paragraph>
              3. Faça login com sua conta Bilibili
            </Paragraph>
            <Paragraph>
              4. Após confirmar o login, você deverá ver seu nome de usuário exibido no canto superior direito
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      title: 'Abrir ferramentas do desenvolvedor',
      description: 'Pressione F12 para abrir as ferramentas do desenvolvedor do navegador',
      content: (
        <div>
          <Alert
            message="Passo dois: Abra as ferramentas do desenvolvedor"
            description="Use o atalho para abrir as ferramentas do desenvolvedor do navegador"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              <Text strong>Windows/Linux:</Text> Pressione <Text code>F12</Text> tecla
            </Paragraph>
            <Paragraph>
              <Text strong>Mac:</Text> Pressione <Text code>Command + Option + I</Text>
            </Paragraph>
            <Paragraph>
              Ou clique com o botão direito em uma área vazia da página e selecione"Verificar"ou"Inspect"
            </Paragraph>
            <Divider />
            <Paragraph type="secondary">
              As ferramentas do desenvolvedor abrem na parte inferior ou direita da página, contendo várias abas
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      title: 'Mudar para a aba Network',
      description: 'Encontre a aba Network (Rede)',
      content: (
        <div>
          <Alert
            message="Terceiro passo: Mudar para a aba Network"
            description="Encontre a aba Network nas ferramentas do desenvolvedor"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              1. Encontre a aba na parte superior das ferramentas do desenvolvedor
            </Paragraph>
            <Paragraph>
              2. Clique <Text code>Network</Text> Etiqueta
            </Paragraph>
            <Paragraph>
              3. Certifique-se de que o painel Network esteja vazio (se houver conteúdo, clique no botão de limpar)
            </Paragraph>
            <Divider />
            <Paragraph type="secondary">
              A aba Network é usada para monitorar as requisições de rede da página, incluindo informações de Cookie
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      title: 'Atualizar Página',
      description: 'Atualize a página do Bilibili para capturar solicitações',
      content: (
        <div>
          <Alert
            message="Passo quatro: Atualize a página"
            description="Atualize a página do Bilibili para capturar solicitações de rede"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              1. Certifique-se de que a aba Network esteja aberta
            </Paragraph>
            <Paragraph>
              2. Pressione <Text code>F5</Text> Ou clique no botão de atualização do navegador
            </Paragraph>
            <Paragraph>
              3. Observe a lista de solicitações que aparecem no painel Network
            </Paragraph>
            <Divider />
            <Paragraph type="secondary">
              Após a atualização, o painel Network exibirá todas as requisições de rede durante o carregamento da página
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      title: 'Encontrar Cookie',
      description: 'Encontre as informações do Cookie no cabeçalho da requisição',
      content: (
        <div>
          <Alert
            message="Passo cinco: Encontrar informações do Cookie"
            description="Encontre o campo Cookie em qualquer solicitação"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              1. No painel Network, encontre qualquer requisição (geralmente selecione a primeira)
            </Paragraph>
            <Paragraph>
              2. Clique nesta solicitação, encontre no painel direito <Text code>Headers</Text> Etiqueta
            </Paragraph>
            <Paragraph>
              3. Em <Text code>Request Headers</Text> encontre <Text code>Cookie</Text> Campo
            </Paragraph>
            <Paragraph>
              4. O valor do campo Cookie é a string de Cookie completa que você precisa
            </Paragraph>
            <Divider />
            <Paragraph type="secondary">
              Strings de Cookie são geralmente longas, contêm múltiplos pares chave-valor, separados por ponto e vírgula
            </Paragraph>
          </Card>
        </div>
      )
    },
    {
      title: 'Copiar Cookie',
      description: 'Copiar a string completa do Cookie',
      content: (
        <div>
          <Alert
            message="Passo Seis: Copiar Cookie"
            description="Copie a string completa do Cookie para a área de transferência"
            type="success"
            showIcon
            style={{ marginBottom: 16 }}
          />
          <Card size="small">
            <Paragraph>
              1. Clique com o botão direito no valor do campo Cookie
            </Paragraph>
            <Paragraph>
              2. Selecione"Copiar valor"ou"Copy value"
            </Paragraph>
            <Paragraph>
              3. Ou clique duas vezes para selecionar todo o valor do Cookie e pressione <Text code>Ctrl+C</Text> Copiar
            </Paragraph>
            <Divider />
            <Paragraph type="secondary">
              A string de Cookie copiada pode ser colada diretamente na caixa de entrada de Cookie do AutoClip
            </Paragraph>
            <Alert
              message="Aviso Importante"
              description="O Cookie contém suas informações de login, por favor, guarde-o com segurança e não o compartilhe com outras pessoas"
              type="warning"
              showIcon
            />
          </Card>
        </div>
      )
    }
  ]

  const handleCopy = () => {
    const cookieExample = "SESSDATA=your_sessdata_here; bili_jct=your_bili_jct_here; DedeUserID=your_dedeuserid_here"
    navigator.clipboard.writeText(cookieExample).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Modal
      title={
        <Space>
          <QuestionCircleOutlined />
          <span>Guia para obter Cookie</span>
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={[
        <Button key="back" onClick={onClose}>
          Fechar
        </Button>,
        <Button
          key="copy"
          icon={copied ? <CheckOutlined /> : <CopyOutlined />}
          onClick={handleCopy}
        >
          {copied ? 'Copiado' : 'Copiar Exemplo'}
        </Button>
      ]}
      width={700}
    >
      <div style={{ marginBottom: 16 }}>
        <Alert
          message="A importação de Cookie é a forma mais segura de login"
          description="Comparado ao login por QR code, a importação de Cookie não aciona os mecanismos de controle de risco do Bilibili, sendo o método de login mais recomendado."
          type="success"
          showIcon
        />
      </div>

      <Steps current={currentStep} onChange={setCurrentStep} direction="vertical" size="small">
        {steps.map((step, index) => (
          <Step key={index} title={step.title} description={step.description} />
        ))}
      </Steps>

      <div style={{ marginTop: 24, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 8 }}>
        {steps[currentStep].content}
      </div>

      <Divider />

      <Card size="small" title="Exemplo de formato de Cookie">
        <Paragraph code style={{ fontSize: '12px', wordBreak: 'break-all' }}>
          SESSDATA=your_sessdata_here; bili_jct=your_bili_jct_here; DedeUserID=your_dedeuserid_here; buvid3=your_buvid3_here
        </Paragraph>
        <Paragraph type="secondary" style={{ fontSize: '12px' }}>
          Atenção: O valor real do Cookie será muito mais longo que este exemplo, contendo mais campos
        </Paragraph>
      </Card>
    </Modal>
  )
}

export default CookieHelper

