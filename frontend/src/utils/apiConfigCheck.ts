import { message } from 'antd'

export async function validateApiConfigBeforeProjectCreation(): Promise<boolean> {
  try {
    return true
  } catch (error) {
    console.error('Verificação da configuração da API falhou:', error)
    message.error('Verificação de configuração da API falhou')
    return false
  }
}
