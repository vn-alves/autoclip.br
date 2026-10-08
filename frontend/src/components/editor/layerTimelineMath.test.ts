import { describe, expect, it } from 'vitest'
import { moveTimelineRange, resizeTimelineRange, timelineSnapPoints } from './layerTimelineMath'
import { createMainVideoLayer, createVideoLayerFromFile, findActiveLayers } from './types'

describe('layer timeline math', () => {
  it('moves the whole interval without changing its duration', () => {
    expect(moveTimelineRange(2, 5, 3, 12, [], 0)).toEqual({ startTime: 5, endTime: 8, snapTime: null })
  })

  it('snaps start, center, and end to timeline targets', () => {
    expect(moveTimelineRange(2, 4, 2.96, 10, [6], 0.05)).toEqual({ startTime: 5, endTime: 7, snapTime: 6 })
  })

  it('resizes either edge and keeps at least 0.1 seconds', () => {
    expect(resizeTimelineRange('start', 4.98, 2, 8, 10, [5], 0.05)).toEqual({ startTime: 5, endTime: 8, snapTime: 5 })
    expect(resizeTimelineRange('end', 2, 2, 8, 10, [], 0)).toEqual({ startTime: 2, endTime: 2.1, snapTime: null })
  })

  it('includes video bounds, center, playhead, and other layer edges', () => {
    expect(timelineSnapPoints(10, 3, [{ startTime: 1, endTime: 7 }])).toEqual([0, 5, 10, 3, 1, 7])
  })

  it('creates a new layer at the playhead with its own interval', () => {
    const previous = URL.createObjectURL
    URL.createObjectURL = () => 'blob:test-layer'
    try {
      const layer = createVideoLayerFromFile({ name: 'clip.mp4' } as File, [createMainVideoLayer('main.mp4')], 12, 4)
      expect(layer.startTime).toBe(4)
      expect(layer.endTime).toBe(12)
      expect(layer.isMain).toBe(false)
    } finally {
      URL.createObjectURL = previous
    }
  })

  it('activates independent layers only between their own start and end', () => {
    const main = createMainVideoLayer('main.mp4')
    const first = { ...main, id: 'first', isMain: false, startTime: 2, endTime: 4 }
    const second = { ...main, id: 'second', isMain: false, startTime: 5, endTime: 9 }
    expect(findActiveLayers([first, second], 1)).toEqual([])
    expect(findActiveLayers([first, second], 2)).toEqual([first])
    expect(findActiveLayers([first, second], 4)).toEqual([first])
    expect(findActiveLayers([first, second], 4.1)).toEqual([])
    expect(findActiveLayers([first, second], 6)).toEqual([second])
    expect(findActiveLayers([first, second], 9.1)).toEqual([])
  })
})