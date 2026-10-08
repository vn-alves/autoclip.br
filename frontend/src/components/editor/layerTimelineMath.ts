export const MIN_LAYER_DURATION = 0.1

export type TimelineSnapKind = 'start' | 'center' | 'end'

export interface TimelineSnap {
  time: number
  kind: TimelineSnapKind
}

export interface TimelineRangeResult {
  startTime: number
  endTime: number
  snapTime: number | null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export function timelineSnapPoints(
  duration: number,
  playhead: number,
  otherRanges: Array<{ startTime: number; endTime: number }>,
): number[] {
  const points = [0, duration / 2, duration, playhead]
  for (const range of otherRanges) points.push(range.startTime, range.endTime)
  return [...new Set(points.filter((point) => Number.isFinite(point)).map((point) => clamp(point, 0, duration)))]
}

function closestSnap(candidates: TimelineSnap[], points: number[], threshold: number): TimelineSnap | null {
  let closest: TimelineSnap | null = null
  let closestDistance = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    for (const point of points) {
      const distance = Math.abs(candidate.time - point)
      if (distance <= threshold && distance < closestDistance) {
        closest = { time: point, kind: candidate.kind }
        closestDistance = distance
      }
    }
  }
  return closest
}

export function moveTimelineRange(
  startTime: number,
  endTime: number,
  deltaTime: number,
  duration: number,
  snapPoints: number[],
  snapThreshold: number,
): TimelineRangeResult {
  const rangeDuration = Math.max(MIN_LAYER_DURATION, endTime - startTime)
  const start = clamp(startTime + deltaTime, 0, Math.max(0, duration - rangeDuration))
  const end = start + rangeDuration
  const snap = closestSnap([
    { time: start, kind: 'start' },
    { time: start + rangeDuration / 2, kind: 'center' },
    { time: end, kind: 'end' },
  ], snapPoints, snapThreshold)
  if (!snap) return { startTime: start, endTime: end, snapTime: null }
  const snappedStart = clamp(
    snap.kind === 'start' ? snap.time : snap.kind === 'center' ? snap.time - rangeDuration / 2 : snap.time - rangeDuration,
    0,
    Math.max(0, duration - rangeDuration),
  )
  return { startTime: snappedStart, endTime: snappedStart + rangeDuration, snapTime: snap.time }
}

export function resizeTimelineRange(
  edge: 'start' | 'end',
  time: number,
  startTime: number,
  endTime: number,
  duration: number,
  snapPoints: number[],
  snapThreshold: number,
): TimelineRangeResult {
  const lower = edge === 'start' ? 0 : startTime + MIN_LAYER_DURATION
  const upper = edge === 'start' ? endTime - MIN_LAYER_DURATION : duration
  const raw = clamp(time, lower, upper)
  const snap = closestSnap([{ time: raw, kind: edge }], snapPoints, snapThreshold)
  const snapped = snap ? clamp(snap.time, lower, upper) : raw
  return {
    startTime: edge === 'start' ? snapped : startTime,
    endTime: edge === 'end' ? snapped : endTime,
    snapTime: snap ? snapped : null,
  }
}