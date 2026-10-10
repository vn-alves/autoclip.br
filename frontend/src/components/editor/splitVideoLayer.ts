import { MIN_LAYER_DURATION } from './layerTimelineMath'
import { VideoLayer, layerEndTime } from './types'

export function canSplitVideoLayer(layer: VideoLayer | undefined, time: number, clipDuration: number): boolean {
  if (!layer || !Number.isFinite(time)) return false
  return time - layer.startTime >= MIN_LAYER_DURATION && layerEndTime(layer, clipDuration) - time >= MIN_LAYER_DURATION
}

/** Share only the media and visual track, never the editable segment state. */
export function splitVideoLayer(layer: VideoLayer, time: number, clipDuration: number, newId: string): [VideoLayer, VideoLayer] | null {
  if (!canSplitVideoLayer(layer, time, clipDuration) || newId === layer.id) return null
  const trackId = layer.trackId ?? layer.id
  return [
    { ...layer, trackId, endTime: time, transform: { ...layer.transform }, customized: true },
    {
      ...layer, id: newId, trackId, name: `${layer.name} (Trecho)`,
      startTime: time, endTime: layerEndTime(layer, clipDuration),
      sourceStart: (layer.sourceStart || 0) + time - layer.startTime,
      isDuplicate: layer.isMain ? true : layer.isDuplicate,
      transform: { ...layer.transform }, customized: true,
    },
  ]
}