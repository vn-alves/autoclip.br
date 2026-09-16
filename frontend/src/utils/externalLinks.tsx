import React from 'react'

/**
 * Ferramenta de tratamento de links externos
 * Abrir links externos com segurança no ambiente Tauri
 */

// Detectar se está em ambiente Tauri
const isTauri = () => {
  return typeof window !== 'undefined' && Boolean((window as any).__TAURI__ || (window as any).__TAURI_INTERNALS__)
}

/**
 * Abrir link externo
 * @param url URL a ser aberta
 */
export const openExternalLink = async (url: string) => {
  try {
    if (isTauri()) {
      // Usar a API shell no ambiente Tauri
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(url)
    } else {
      // Usar método normal em ambiente Web
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } catch (error) {
    console.error('Falha ao abrir link externo:', error)
    // Tratamento de fallback: tentar usar window.open
    try {
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (fallbackError) {
      console.error('Falha ao abrir link de fallback:', fallbackError)
      // Último recurso: copiar link para a área de transferência
      try {
        await navigator.clipboard.writeText(url)
        alert(`Link copiado para a área de transferência:${url}`)
      } catch (clipboardError) {
        console.error('Falha ao copiar para a área de transferência:', clipboardError)
        alert(`Por favor, acesse manualmente:${url}`)
      }
    }
  }
}

/**
 * Criar um componente de link externo clicável
 * @param url Endereço do link
 * @param text Texto a exibir
 * @param className Nome da classe CSS
 */
export const ExternalLink: React.FC<{
  url: string
  text: string
  className?: string
}> = ({ url, text, className }) => {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    openExternalLink(url)
  }

  return (
    <a
      href={url}
      onClick={handleClick}
      className={className}
      style={{ 
        color: '#1890ff',
        cursor: 'pointer',
        textDecoration: 'underline'
      }}
    >
      {text}
    </a>
  )
}
