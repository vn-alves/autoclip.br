import { describe, expect, it } from 'vitest'
import { moveTimelineRange, resizeTimelineRange, timelineSnapPoints } from './layerTimelineMath'

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
})