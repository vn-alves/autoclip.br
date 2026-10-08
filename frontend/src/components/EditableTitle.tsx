import React, { useState, useRef, useEffect } from 'react'
import { Input, Button, Space, message, Tooltip, Modal } from 'antd'
import { EditOutlined, CheckOutlined } from '@ant-design/icons'
import { projectApi } from '../services/api'
import MagicWandIcon from './icons/MagicWandIcon'

interface EditableTitleProps {
  title: string
  clipId: string
  onTitleUpdate?: (newTitle: string) => void
  maxLength?: number
  style?: React.CSSProperties
  className?: string
}

const EditableTitle: React.FC<EditableTitleProps> = ({
  title,
  clipId,
  onTitleUpdate,
  maxLength = 200,
  style,
  className
}) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(title)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const inputRef = useRef<any>(null)

  // Quando o título externo muda, sincronizar o estado interno
  useEffect(() => {
    setEditValue(title)
  }, [title])

  // Quando o title muda, se não estiver no modo de edição, garanta que o valor mais recente seja exibido
  useEffect(() => {
    if (!isEditing) {
      setEditValue(title)
    }
  }, [title, isEditing])

  // Focar no campo de entrada ao entrar no modo de edição
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      // O componente TextArea não tem método select, usar setSelectionRange em vez disso
      if (inputRef.current.setSelectionRange) {
        inputRef.current.setSelectionRange(0, inputRef.current.value.length)
      }
    }
  }, [isEditing])

  const handleStartEdit = () => {
    setEditValue(title)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setEditValue(title)
    setIsEditing(false)
  }

  const handleSave = async () => {
    const trimmedValue = editValue.trim()
    
    if (!trimmedValue) {
      message.error('O título não pode estar vazio')
      return
    }
    
    if (trimmedValue.length > maxLength) {
      message.error(`O título não pode exceder${maxLength}caracteres`)
      return
    }
    
    if (trimmedValue === title) {
      setIsEditing(false)
      return
    }

    setLoading(true)
    try {
      await projectApi.updateClipTitle(clipId, trimmedValue)
      message.success('Título atualizado com sucesso')
      setIsEditing(false)
      // Primeiro atualizar o estado local, depois chamar o callback
      onTitleUpdate?.(trimmedValue)
    } catch (error: any) {
      console.error('Falha ao atualizar o título:', error)
      message.error(error.userMessage || error.message || 'Falha ao atualizar título')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerateTitle = async () => {
    console.log('Iniciando a geração do título, clipId:', clipId)
    setGenerating(true)
    try {
      const result = await projectApi.generateClipTitle(clipId)
      console.log('Resultado da geração do título:', result)
      if (result.success && result.generated_title) {
        setEditValue(result.generated_title)
        message.success('Título gerado com sucesso, você pode continuar editando ou clicar em salvar')
      } else {
        message.error('Falha ao gerar título')
      }
    } catch (error: any) {
      console.error('Falha ao gerar o título:', error)
      message.error(error.userMessage || error.message || 'Falha ao gerar título')
    } finally {
      setGenerating(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <Modal
        title="Editar Título"
        open={isEditing}
        onCancel={handleCancel}
        footer={null}
        width={600}
        destroyOnClose
        maskClosable={false}
      >
        <div style={{ marginBottom: '16px' }}>
          <Input.TextArea
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyPress}
            maxLength={maxLength}
            placeholder="Por favor, insira o título"
            autoSize={{ minRows: 3, maxRows: 8 }}
            style={{ 
              resize: 'none',
              fontSize: '14px',
              lineHeight: '1.5'
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Nº de caracteres: {editValue.length}/{maxLength}
          </div>
          <Space>
            <Tooltip title="Gerar título com IA">
              <Button
                icon={<MagicWandIcon />}
                loading={generating}
                onClick={() => {
                  console.log('Botão ’Gerar Título por IA’ clicado');
                  handleGenerateTitle();
                }}
                disabled={loading}
              >
                Gerado por IA
              </Button>
            </Tooltip>
            <Button onClick={handleCancel} disabled={loading || generating}>
              Cancelar
            </Button>
            <Button
              type="primary"
              icon={<CheckOutlined />}
              loading={loading}
              onClick={handleSave}
              disabled={generating}
            >
              Salvar
            </Button>
          </Space>
        </div>
      </Modal>
    )
  }

  return (
    <div
      style={{
        cursor: 'text',
        ...style
      }}
      className={`ac-editable ${className || ''}`}
      onClick={handleStartEdit}
      title="Clique para editar título"
    >
      <span style={{ wordBreak: 'break-word', display: 'inline' }}>
        {title}
        <EditOutlined
          className="ac-editable-pen"
          style={{
            color: 'var(--ac-muted)',
            fontSize: '11px',
            opacity: 0,
            transition: 'opacity 0.15s',
            marginLeft: '6px',
            display: 'inline'
          }}
        />
      </span>
    </div>
  )
}

export default EditableTitle
