import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import { theme as antdTheme } from 'antd'
import ptBR from 'antd/locale/pt_BR'
import dayjs from 'dayjs'
import 'dayjs/locale/pt-br'
import relativeTime from 'dayjs/plugin/relativeTime'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { initAnalytics } from './analytics/posthog'
import { trackLaunch } from './analytics/lifecycle'
import './index.css'

// Inicializa análise de produto / rastreamento (se não houver chave, automaticamente no-op, não envia nenhuma requisição de rede)
initAnalytics()
// Registrar propriedades globais + relatar eventos de inicialização/instalação/atualização
void trackLaunch()

// Configurar plugin dayjs
dayjs.extend(relativeTime)
dayjs.extend(timezone)
dayjs.extend(utc)

// Definir dayjs em português (Brasil) e fuso horário
dayjs.locale('pt-br')
dayjs.tz.setDefault('America/Sao_Paulo')

function Root() {
  // Conecta limites de erro no nó raiz para evitar tela branca devido a exceções em tempo de execução.
  // showDetails sempre true (não só em DEV) enquanto o Editor de Corte está em desenvolvimento ativo —
  // sem isso, um erro no build de produção só mostra a mensagem genérica, sem stack trace, e não há
  // como diagnosticar sem acesso ao DevTools do usuário. Reavaliar quando o Editor estabilizar.
  return (
    <ErrorBoundary showDetails>
      <App />
    </ErrorBoundary>
  )
}

function ThemedApp() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'

  return (
    <ConfigProvider
      locale={ptBR}
      theme={{
      algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        // Calm Premium tokens — see DESIGN.md
        colorPrimary: isDark ? '#5A8BFF' : '#2D6BFF',
        colorText: isDark ? '#ECEAE6' : '#1A1A19',
        colorTextSecondary: isDark ? '#A6A29B' : '#6E6B66',
        colorBgBase: isDark ? '#19181A' : '#F6F5F3',
        colorBgContainer: isDark ? '#211F22' : '#FFFFFF',
        colorBorder: isDark ? '#2C2A2D' : '#EBE9E4',
        colorBorderSecondary: isDark ? '#232124' : '#F0EEEA',
        borderRadius: 10,
        fontFamily: '"Geist","PingFang SC","Noto Sans SC",system-ui,-apple-system,sans-serif',
        controlHeight: 38,
      },
      components: {
        Button: { borderRadius: 999, controlHeight: 40, fontWeight: 500 },
        Select: { borderRadius: 10 },
        Card: { borderRadiusLG: 16 },
      },
    }}
    >
    <React.StrictMode>
      <HashRouter>
        <Root />
      </HashRouter>
    </React.StrictMode>
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ThemeProvider>
    <ThemedApp />
  </ThemeProvider>,
)
