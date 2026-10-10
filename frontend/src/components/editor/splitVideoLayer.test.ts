import { describe, expect, it } from 'vitest'
import { createDefaultEditorState, createMainVideoLayer, applyEditConfig, toEditConfig } from './types'
import { canSplitVideoLayer, splitVideoLayer } from './splitVideoLayer'

describe('independent video segments', () => {
  it('splits the main video at the playhead with continuous source timing', () => {
    const layer = { ...createMainVideoLayer('original.mp4'), startTime: 5, endTime: 55, sourceStart: 10 }
    const result = splitVideoLayer(layer, 25, 50, 'right')
    expect(result?.map((item) => [item.startTime, item.endTime, item.sourceStart])).toEqual([[5, 25, 10], [25, 55, 30]])
    expect(result?.[1].isMain).toBe(true)
  })
  it('keeps each segment transform, volume, mute, visibility and interval independent', () => {
    const layer = createMainVideoLayer('main.mp4')
    const result = splitVideoLayer(layer, 20, 50, 'right')
    if (!result) throw new Error('Expected a valid split')
    result[1].transform.x = 0.6
    result[1].volume = 0.4
    result[1].muted = true
    result[1].visible = false
    result[1].endTime = 35
    expect([result[0].transform.x, result[0].volume, result[0].muted, result[0].visible, result[0].endTime]).toEqual([0, 1, false, true, 20])
    expect(layer.endTime).toBe(Infinity)
  })
  it('preserves uploaded media references and source offsets through repeated splits', () => {
    const layer = { ...createMainVideoLayer('asset.mp4'), isMain: false, assetId: 'asset-1', sourceStart: 4, endTime: 50 }
    const first = splitVideoLayer(layer, 20, 50, 'second')
    if (!first) throw new Error('Expected split')
    const second = splitVideoLayer(first[1], 30, 50, 'third')
    expect(second?.[1].sourceStart).toBe(34)
    expect(second?.[1].assetId).toBe('asset-1')
    expect(second?.[1].trackId).toBe(layer.id)
  })
  it('rejects splits outside the segment and at either boundary', () => {
    const layer = { ...createMainVideoLayer('main.mp4'), startTime: 10, endTime: 50 }
    for (const time of [0, 10, 10.05, 49.95, 50, 60, NaN]) expect(canSplitVideoLayer(layer, time, 50)).toBe(false)
    expect(canSplitVideoLayer(layer, 25, 50)).toBe(true)
  })
  it('restores independently edited segments with the same visual track after saving', () => {
    const state = createDefaultEditorState('main.mp4')
    const result = splitVideoLayer(state.layers[0], 20, 50, 'right')
    if (!result) throw new Error('Expected split')
    result[1].volume = 0.5
    result[1].transform.x = 0.25
    state.layers = result
    const restored = applyEditConfig(JSON.parse(JSON.stringify(toEditConfig(state))), 'original.mp4', () => 'asset.mp4')
    expect(restored.layers.map((item) => [item.trackId, item.startTime, item.endTime, item.volume, item.transform.x])).toEqual([['main', 0, 20, 1, 0], ['main', 20, 50, 0.5, 0.25]])
    expect(restored.layers[1].source).toBe('original.mp4')
  })
})