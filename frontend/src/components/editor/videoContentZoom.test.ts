import { describe, expect, it } from 'vitest'
import { videoContentZoom } from './videoContentZoom'

describe('video content zoom', () => {
  it('magnifies content on upward scroll and reduces it on downward scroll', () => {
    expect(videoContentZoom(1, -100)).toBe(1.1)
    expect(videoContentZoom(1.1, 100)).toBe(1)
    expect(videoContentZoom(1, 0)).toBe(1)
  })

  it('keeps magnification within the existing wheel limits', () => {
    expect(videoContentZoom(3, -100)).toBe(3)
    expect(videoContentZoom(0.5, 100)).toBe(0.5)
  })
})