/**
 * Ferramenta de verificação de configuração da API
 * Usado para verificar se a configuração da API está completa antes de criar um projeto
 */

import { settingsApi } from '../services/api'
import { isDesktopMode } from './desktopMode'
import { message, Modal } from 'antd'
import { useNavigate } from 'react-router-dom'

export interface ApiConfigStatus {
  hasValidConfig: boolean
  missingProviders: string[]
  currentProvider?: string
  currentApiKey?: string
}

/**
 * Verificar se a configuração da API está completa
 */
export const checkApiConfig = async (): Promise<ApiConfigStatus> => {
  try {
    console.log('=== Iniciar verificação de configuração da API ===')
    
    // Verificar se está rodando no modo Desktop
    const isDesktop = await isDesktopMode()
    console.log('Resultado da verificação do modo Desktop:', isDesktop)
    
    // Tentar obter configurações independentemente do modo Desktop
    let settings
    try {
      settings = await settingsApi.getSettings()
      console.log('Configurações obtidas com sucesso:', settings)
    } catch (error) {
      console.warn('Falha ao obter configurações, talvez não esteja no modo Desktop:', error)
      // Se a obtenção das configurações falhar, verifique se está no modo Desktop
      if (!isDesktop) {
        console.log('Modo não-Desktop, retornar status sem configuração')
        return {
          hasValidConfig: false,
          missingProviders: ['LLM API'],
          currentProvider: undefined,
          currentApiKey: undefined
        }
      }
      // Falha ao obter configurações no modo Desktop, também retorna sem configuração
      console.log('Falha ao obter configurações no modo Desktop, retornando status sem configuração')
      return {
        hasValidConfig: false,
        missingProviders: ['LLM API'],
        currentProvider: undefined,
        currentApiKey: undefined
      }
    }
    
    if (!settings || !settings.api || !settings.api.api_keys) {
      console.log('Dados de configuração incompletos:', { settings, hasApi: !!settings?.api, hasApiKeys: !!settings?.api?.api_keys })
      return {
        hasValidConfig: false,
        missingProviders: ['LLM API'],
        currentProvider: undefined,
        currentApiKey: undefined
      }
    }

    const apiKeys = settings.api.api_keys
    // Correção: api_model é o nome do modelo, não o nome do provedor
    // Precisa da API_provider ou llm_provider Obter nome do provedor
    const currentProvider = settings.api.api_provider || settings.api.llm_provider || 'dashscope'
    
    console.log('Detalhes da configuração da API:', {
      currentProvider,
      apiKeys: {
        dashscope: apiKeys.dashscope ? '***' + apiKeys.dashscope.slice(-4) : 'Não configurado',
        openai: apiKeys.openai ? '***' + apiKeys.openai.slice(-4) : 'Não configurado',
        gemini: apiKeys.gemini ? '***' + apiKeys.gemini.slice(-4) : 'Não configurado',
        siliconflow: apiKeys.siliconflow ? '***' + apiKeys.siliconflow.slice(-4) : 'Não configurado',
        jimeng_access: apiKeys.jimeng_access ? '***' + apiKeys.jimeng_access.slice(-4) : 'Não configurado',
        jimeng_secret: apiKeys.jimeng_secret ? '***' + apiKeys.jimeng_secret.slice(-4) : 'Não configurado'
      }
    })
    
    // Verificar a API Key do provedor atual
    let currentApiKey = ''
    let hasValidKey = false
    
    switch (currentProvider) {
      case 'dashscope':
        currentApiKey = apiKeys.dashscope || ''
        hasValidKey = !!currentApiKey.trim()
        console.log('Verificação da DashScope API Key:', { hasKey: !!currentApiKey, keyLength: currentApiKey.length, isValid: hasValidKey })
        break
      case 'openai': {
        currentApiKey = apiKeys.openai || ''
        // Serviços compatíveis com OpenAI auto-hospedados (Ollama / vLLM, etc.) podem não ter chave, são considerados utilizáveis se o endereço da API estiver configurado
        const hasCustomBaseUrl = !!(settings.api.api_base_url || '').trim()
        hasValidKey = !!currentApiKey.trim() || hasCustomBaseUrl
        console.log('Verificação da OpenAI API Key:', { hasKey: !!currentApiKey, keyLength: currentApiKey.length, hasCustomBaseUrl, isValid: hasValidKey })
        break
      }
      case 'gemini':
        currentApiKey = apiKeys.gemini || ''
        hasValidKey = !!currentApiKey.trim()
        console.log('Verificação da Gemini API Key:', { hasKey: !!currentApiKey, keyLength: currentApiKey.length, isValid: hasValidKey })
        break
      case 'siliconflow':
        currentApiKey = apiKeys.siliconflow || ''
        hasValidKey = !!currentApiKey.trim()
        console.log('Verificação da API Key SiliconFlow:', { hasKey: !!currentApiKey, keyLength: currentApiKey.length, isValid: hasValidKey })
        break
      case 'jimeng':
        currentApiKey = apiKeys.jimeng_access || ''
        hasValidKey = !!(apiKeys.jimeng_access?.trim() && apiKeys.jimeng_secret?.trim())
        console.log('Verificação da Jimeng API Key:', { 
          hasAccess: !!apiKeys.jimeng_access, 
          hasSecret: !!apiKeys.jimeng_secret, 
          isValid: hasValidKey 
        })
        break
      default:
        hasValidKey = false
        console.log('Provedor desconhecido:', currentProvider)
    }

    console.log('=== Resultado final da verificação da configuração da API ===', {
      hasValidConfig: hasValidKey,
      currentProvider,
      currentApiKey: currentApiKey ? '***' + currentApiKey.slice(-4) : undefined,
      isDesktop
    })

    return {
      hasValidConfig: hasValidKey,
      missingProviders: hasValidKey ? [] : ['LLM API'],
      currentProvider,
      currentApiKey: currentApiKey ? '***' + currentApiKey.slice(-4) : undefined
    }
  } catch (error) {
    console.error('Falha ao verificar configuração da API:', error)
    return {
      hasValidConfig: false,
      missingProviders: ['LLM API'],
      currentProvider: undefined,
      currentApiKey: undefined
    }
  }
}

/**
 * Exibir caixa de diálogo de aviso de configuração de API ausente
 */
export const showApiConfigModal = (missingProviders: string[], onNavigateToSettings?: () => void) => {
  const providerNames = {
    'LLM API': 'API do Modelo de IA',
    'Speech API': 'API de Reconhecimento de Voz'
  }

  const missingNames = missingProviders.map(p => providerNames[p as keyof typeof providerNames] || p).join(', ')

  Modal.confirm({
    title: <span style={{ color: '#fff' }}>API precisa ser configurada</span>,
    content: (
      <div style={{ color: '#fff' }}>
        <p style={{ color: '#fff', marginBottom: '12px', fontSize: '14px' }}>A criação do projeto requer a configuração das seguintes APIs:</p>
        <p style={{ fontWeight: 'bold', color: '#40a9ff', marginBottom: '12px', fontSize: '16px' }}>{missingNames}</p>
        <p style={{ color: '#f0f0f0', fontSize: '14px' }}>Por favor, vá para a página de configurações para configurar.</p>
      </div>
    ),
    okText: 'Ir para configurar',
    cancelText: 'Cancelar',
    onOk: () => {
      if (onNavigateToSettings) {
        onNavigateToSettings()
      } else {
        // Ir diretamente para a página de configurações
        window.location.href = '#/settings'
        // Forçar atualização da página para garantir que o redirecionamento funcione
        window.location.reload()
      }
    },
    icon: null,
    centered: true,
    style: { backgroundColor: '#1f1f1f' }
  })
}

/**
 * Verificar configuração da API antes de criar o projeto
 * Se a configuração estiver incompleta, exibir aviso e impedir a criação
 */
export const validateApiConfigBeforeProjectCreation = async (): Promise<boolean> => {
  console.log('Iniciando a verificação da configuração da API...')
  const configStatus = await checkApiConfig()
  
  console.log('Resultado da validação da configuração da API:', configStatus)
  
  if (!configStatus.hasValidConfig) {
    console.log('Configuração de API inválida, exibir pop-up de configuração')
    showApiConfigModal(configStatus.missingProviders)
    return false
  }
  
  console.log('Configuração de API válida, permitir criação de projeto')
  return true
}

/**
 * Obter uma descrição amigável do status da configuração da API
 */
export const getApiConfigDescription = (status: ApiConfigStatus): string => {
  if (status.hasValidConfig) {
    return `Configurado ${status.currentProvider} API`
  } else {
    return 'API não configurada, não é possível criar projeto'
  }
}
