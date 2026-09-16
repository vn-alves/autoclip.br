import { useState } from 'react'
import { message } from 'antd'
import { projectApi } from '../services/api'

export const useCollectionVideoDownload = () => {
  const [isGenerating, setIsGenerating] = useState(false)

  const generateAndDownloadCollectionVideo = async (
    projectId: string, 
    collectionId: string,
    _collectionTitle: string
  ) => {
    if (isGenerating) return

    setIsGenerating(true)
    
    try {
      // Gerar vídeos de coleção diretamente na ordem ajustada pelo usuário
      message.info('Gerando vídeo da coleção na sua ordem...')
      
      // Gerar vídeo da coleção (na ordem ajustada pelo usuário)
      await projectApi.generateCollectionVideo(projectId, collectionId)
      
      // Aguardar 1 segundo para o backend concluir a geração do arquivo e depois baixar
      message.success('Vídeo da coleção gerado com sucesso, baixando...')
      
      setTimeout(async () => {
        try {
          await projectApi.downloadVideo(projectId, undefined, collectionId)
          message.success('Download do vídeo da coleção concluído')
        } catch (downloadError) {
          console.error('Falha no download:', downloadError)
          message.error('Falha no download, por favor, tente novamente mais tarde')
        }
      }, 1000)
      
    } catch (error) {
      console.error('Falha ao gerar vídeo de compilação:', error)
      message.error('Falha ao gerar vídeo de coleção')
    } finally {
      setIsGenerating(false)
    }
  }

  return {
    isGenerating,
    generateAndDownloadCollectionVideo
  }
} 