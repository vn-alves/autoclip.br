import React, { useMemo, useState } from 'react'
import { message } from 'antd'
import { Collection, Clip } from '../store/useProjectStore'
import EditableCollectionTitle from './EditableCollectionTitle'
import { Btn, Icon, parseTimecode, fmtDuration } from '../ui'
import { resolveApiUrl } from '../utils/apiConfig'

interface CollectionCardProps {
  collection: Collection
  clips: Clip[]
  onView: (collection: Collection) => void
  onGenerateVideo?: (collectionId: string) => void
  onDelete?: (collectionId: string) => void
  onUpdate?: (collectionId: string, updates: Partial<Collection>) => void
}

// Calm Premium collection card — same anatomy as ClipCard (see DESIGN.md)
const CollectionCard: React.FC<CollectionCardProps> = ({ collection, clips, onView, onGenerateVideo, onUpdate }) => {
  const safeClips = Array.isArray(clips) ? clips : []
  const safeClipIds = Array.isArray(collection.clip_ids) ? collection.clip_ids : []
  const collectionClips = safeClipIds
    .map((id) => safeClips.find((c) => c.id === id))
    .filter(Boolean) as Clip[]

  const totalDuration = collectionClips.reduce(
    (t, c) => t + Math.max(0, parseTimecode(c.end_time) - parseTimecode(c.start_time)),
    0
  )

  const thumbnailUrl = useMemo(() => {
    if (!collection.project_id) return ''
    const ts = encodeURIComponent(collection.created_at || '')
    return resolveApiUrl(`/api/v1/projects/${collection.project_id}/collections/${collection.id}/thumbnail?t=${ts}`)
  }, [collection.project_id, collection.id, collection.created_at])

  const [imgError, setImgError] = useState(false)
  const hasThumb = !imgError && !!collection.thumbnail_path

  return (
    <article className="ac-card">
      <div className="ac-card-thumb" onClick={() => onView(collection)} role="button" aria-label="Pré-visualizar coleção">
        {hasThumb && (
          <img src={thumbnailUrl} alt="" onError={() => setImgError(true)} draggable={false} />
        )}
        <div className="play"><span><Icon.Play size={18} /></span></div>
        <span className="ac-tag ac-tag--tl ac-tag--sans">
          {collection.collection_type === 'ai_recommended' ? 'Recomendação de IA' : 'Manual'}
        </span>
        <span className="ac-tag ac-tag--bl">{collectionClips.length} segmento</span>
        <span className="ac-tag ac-tag--br">{fmtDuration(totalDuration)}</span>
      </div>

      <div className="ac-card-body">
        <div className="ac-card-title">
          <EditableCollectionTitle
            title={collection.collection_title}
            collectionId={collection.id}
            onTitleUpdate={(t) => onUpdate?.(collection.id, { collection_title: t })}
            style={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', color: 'inherit', width: '100%' }}
          />
        </div>
        <div className="ac-card-desc" title={collection.collection_summary || ''}>
          {collection.collection_summary || ''}
        </div>
        <div className="ac-card-foot">
          <span className="meta">{collectionClips.length} segmento · {fmtDuration(totalDuration)}</span>
          <div className="ac-card-actions">
            <Btn variant="text" onClick={() => onView(collection)}>Pré-visualizar</Btn>
            {onGenerateVideo && <Btn variant="text" onClick={() => onGenerateVideo(collection.id)}>Baixar</Btn>}
            <Btn variant="text" onClick={() => message.info('Recurso de envio em desenvolvimento', 3)}>Enviar</Btn>
          </div>
        </div>
      </div>
    </article>
  )
}

export default CollectionCard
