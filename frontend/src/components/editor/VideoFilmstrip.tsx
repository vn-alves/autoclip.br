import React, { useEffect, useState } from 'react'

interface VideoFilmstripProps {
  source: string
  sourceStart: number
  duration: number
}

/** Decode actual media frames locally; never changes the preview's playback position. */
const VideoFilmstrip: React.FC<VideoFilmstripProps> = ({ source, sourceStart, duration }) => {
  const [frames, setFrames] = useState<string[]>([])
  useEffect(() => {
    if (!source) return
    let cancelled = false
    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    const canvas = document.createElement('canvas')
    canvas.width = 120
    canvas.height = 68
    const context = canvas.getContext('2d')
    const result: string[] = []
    let index = 0
    const seekNext = () => {
      if (cancelled || index >= 6 || !Number.isFinite(video.duration)) return
      const time = Math.max(0, Math.min(video.duration - 0.01, sourceStart + duration * (index + 0.5) / 6))
      video.currentTime = time
    }
    video.onloadedmetadata = seekNext
    video.onseeked = () => {
      if (cancelled || !context) return
      try {
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        result.push(canvas.toDataURL('image/jpeg', 0.6))
        index += 1
        setFrames([...result])
        seekNext()
      } catch { /* Cross-origin media without frame access keeps the neutral strip. */ }
    }
    video.src = source
    return () => {
      cancelled = true
      video.onloadedmetadata = null
      video.onseeked = null
      video.removeAttribute('src')
      video.load()
    }
  }, [source, sourceStart, duration])
  return <span className="ac-layers-filmstrip" aria-hidden="true">{frames.map((frame, index) => <img key={index} src={frame} alt="" draggable={false} />)}</span>
}

export default VideoFilmstrip