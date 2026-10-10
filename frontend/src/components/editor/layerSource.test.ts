import { describe, expect, it } from 'vitest'
import { resizeLayerRange } from './layerTimelineMath'
import { contentDuration, createMainVideoLayer } from './types'

describe('main/duplicate layer extension', () => {
  const layer = { startTime: 0, endTime: 50, sourceStart: 0 }

  it('stretches a 50s cut to 60s when the original video has more footage', () => {
    const r = resizeLayerRange('end', 60, layer, { min: -100, max: 3500 }, [], 0)
    expect(r.endTime).toBe(60)
    expect(r.sourceStart).toBe(0)
  })

  it('cannot stretch past the end of the source', () => {
    expect(resizeLayerRange('end', 60, layer, { min: 0, max: 50 }, [], 0).endTime).toBe(50)
  })

  it('shortens the cut', () => {
    expect(resizeLayerRange('end', 30, layer, { min: 0, max: 50 }, [], 0).endTime).toBe(30)
  })

  it('moving the start edge earlier reveals footage before the cut', () => {
    const r = resizeLayerRange('start', 2, { startTime: 10, endTime: 40, sourceStart: 0 }, { min: -100, max: 3500 }, [], 0)
    expect(r.startTime).toBe(2)
    expect(r.sourceStart).toBe(-8)
  })

  it('start edge stops at the beginning of the source', () => {
    const r = resizeLayerRange('start', 0, { startTime: 10, endTime: 40, sourceStart: 0 }, { min: -3, max: 50 }, [], 0)
    expect(r.startTime).toBe(7)
    expect(r.sourceStart).toBe(-3)
  })

  it('final video length follows the layer that ends last', () => {
    const main = { ...createMainVideoLayer('x'), endTime: 60 }
    expect(contentDuration([main], 50)).toBe(60)
    expect(contentDuration([createMainVideoLayer('x')], 50)).toBe(50)
  })
})
