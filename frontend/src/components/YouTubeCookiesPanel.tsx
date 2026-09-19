import React, { useEffect, useRef, useState } from 'react'
import { Button, Space, Typography, Tooltip, message } from 'antd'
import { UploadOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons'
import { youtubeCookiesApi, YouTubeCookiesStatus } from '../services/api'

const { Text } = Typography

interface Props {
  disabled?: boolean
}

const YouTubeCookiesPanel: React.FC<Props> = ({ disabled }) => {
  const [status, setStatus] = useState<YouTubeCookiesStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadStatus = async () => {
    try {
      const result = await youtubeCookiesApi.getStatus()
      setStatus(result)
    } catch {
      setStatus(null)
    }
  }

  useEffect(() => {
    loadStatus()
  }, [])

  const handleFile = async (file: File) => {
    setBusy(true)
    try {
      const result = await youtubeCookiesApi.upload(file)
      setStatus(result)
      message.success(result.message || 'Cookies do YouTube salvos.')
    } catch (error: any) {
      const detail = error?.response?.data?.detail || error?.message || 'Não foi possível salvar os cookies.'
      message.error(detail)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleRemove = async () => {
    setBusy(true)
    try {
      const result = await youtubeCookiesApi.remove()
      setStatus(result)
      message.success(result.message || 'Cookies removidos.')
    } catch {
      message.error('Não foi possível remover os cookies.')
    } finally {
      setBusy(false)
    }
  }

  const configured = !!status?.configured

  return (
    <div>
      <Text style={{ color: '#ffffff', marginBottom: '12px', display: 'block', fontSize: '16px', fontWeight: 500 }}>
        Cookies do YouTube (recomendado)
      </Text>

      <input
        ref={inputRef}
        type="file"
        accept=".txt,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />

      <Space wrap>
        <Button
          icon={<UploadOutlined />}
          loading={busy}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {configured ? 'Enviar novo cookies.txt' : 'Enviar cookies.txt'}
        </Button>

        {configured && status?.source === 'upload' && (
          <Tooltip title="Apagar os cookies salvos neste servidor">
            <Button icon={<DeleteOutlined />} disabled={disabled || busy} onClick={handleRemove}>
              Remover
            </Button>
          </Tooltip>
        )}
      </Space>

      {configured ? (
        <Text style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
          <CheckCircleOutlined style={{ marginRight: 6 }} />
          {status?.has_session_cookie
            ? `Cookies ativos (${status?.cookie_count} linhas). Downloads bloqueados pelo YouTube devem funcionar.`
            : 'Cookies salvos, mas sem os dados de sessão: exporte novamente estando logado no YouTube.'}
        </Text>
      ) : (
        <Text style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '12px', marginTop: '8px', display: 'block' }}>
          Sem cookies, o YouTube costuma pedir verificação ("confirme que não é um robô") e o download falha.
          Instale uma extensão de exportação de cookies no seu navegador, faça login no YouTube,
          exporte o arquivo <Text code>cookies.txt</Text> e envie aqui.
        </Text>
      )}
    </div>
  )
}

export default YouTubeCookiesPanel
