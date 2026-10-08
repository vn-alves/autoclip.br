import React from 'react'
import { Card, Tag, Space, Typography } from 'antd'
import { BILIBILI_PARTITIONS } from '../services/uploadApi'

const { Text } = Typography

interface UploadToBilibiliProps {
  partitionId?: number
}

const UploadToBilibili: React.FC<UploadToBilibiliProps> = ({ partitionId }) => {
  // Obter nome da seção
  const getPartitionName = (id: number) => {
    const partition = BILIBILI_PARTITIONS.find(p => p.id === id)
    return partition ? partition.name : 'Seção Desconhecida'
  }

  return (
    <Card
      title={
        <Space>
          <span>Informações da partição Bilibili</span>
          {partitionId && (
            <Tag color="blue">Partição atual: {getPartitionName(partitionId)}</Tag>
          )}
        </Space>
      }
      size="small"
      style={{ marginBottom: '16px' }}
    >
      <div>
        <Text type="secondary">
          Tipos de partição suportados: Animação, Jogos, Música, Conhecimento, Entretenimento, Filmes e TV, Tecnologia Digital, etc.
        </Text>
        <div style={{ marginTop: '12px' }}>
          <Text strong>ID da partição: </Text>
          <Text code>{partitionId || 'Não definido'}</Text>
        </div>
      </div>
    </Card>
  )
}

export default UploadToBilibili

