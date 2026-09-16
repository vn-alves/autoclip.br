import { useState, useEffect } from 'react'

interface FirstRunState {
  isFirstRun: boolean
  isLoading: boolean
  hasCompleted: boolean
}

export const useFirstRun = () => {
  const [state, setState] = useState<FirstRunState>({
    isFirstRun: false,
    isLoading: true,
    hasCompleted: false
  })

  useEffect(() => {
    checkFirstRun()
  }, [])

  const checkFirstRun = async () => {
    try {
      console.log('🔍 Iniciando verificação do status da primeira execução...')
      
      // Criar requisição fetch com timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 segundos de timeout
      
      try {
        // Verificar se já existe configuração
        const response = await fetch('/api/v1/settings/', {
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        
        if (response.ok) {
          const settings = await response.json()
          console.log('📋 Configurações obtidas:', settings)
          
          // Verificar se há configuração de API Key
          const hasApiKey = settings.api?.api_keys?.dashscope || 
                           settings.api?.api_keys?.openai ||
                           settings.api?.api_keys?.gemini ||
                           settings.api?.api_keys?.siliconflow ||
                           // Serviços compatíveis com OpenAI locais / auto-hospedados podem não ter chave, apenas o endereço da interface
                           (settings.api?.api_provider === 'openai' && settings.api?.api_base_url)
          
          console.log('🔑 Status da API Key:', hasApiKey)
          
          // O assistente de primeira execução só precisa verificar a configuração da API Key, não precisa exigir um projeto de exemplo
          setState({
            isFirstRun: !hasApiKey,
            isLoading: false,
            hasCompleted: hasApiKey
          })
        } else {
          console.log('❌ Falha ao definir resposta da API:', response.status)
          // Se as configurações não puderem ser obtidas, considera-se a primeira execução
          setState({
            isFirstRun: true,
            isLoading: false,
            hasCompleted: false
          })
        }
      } catch (fetchError) {
        clearTimeout(timeoutId)
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          console.log('⏰ Requisição API excedeu o tempo limite, assumindo que é a primeira execução')
        } else {
          console.log('❌ Falha na requisição da API:', fetchError)
        }
        setState({
          isFirstRun: true,
          isLoading: false,
          hasCompleted: false
        })
      }
    } catch (error) {
      console.error('❌ Falha ao verificar status da primeira execução:', error)
      setState({
        isFirstRun: true,
        isLoading: false,
        hasCompleted: false
      })
    }
  }

  const markCompleted = () => {
    setState(prev => ({
      ...prev,
      isFirstRun: false,
      hasCompleted: true
    }))
  }

  return {
    ...state,
    markCompleted,
    refresh: checkFirstRun
  }
}
