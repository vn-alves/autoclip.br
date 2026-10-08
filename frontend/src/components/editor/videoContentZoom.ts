/** Content-only magnification; never changes the layer's editing rectangle. */
export function videoContentZoom(current: number, deltaY: number): number {
  if (deltaY === 0) return current
  return Math.min(3, Math.max(0.5, Math.round((current + (deltaY < 0 ? 0.1 : -0.1)) * 10) / 10))
}