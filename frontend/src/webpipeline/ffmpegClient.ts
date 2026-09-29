import { FFmpeg } from '@ffmpeg/ffmpeg'
import { fetchFile, toBlobURL } from '@ffmpeg/util'

/**
 * ffmpeg.wasm — motor de corte de vídeo 100% no navegador (Fase 2 do plano "Web sem
 * servidor"). Mesmo ffmpeg que o backend usa, só que compilado pra WebAssembly: os comandos
 * (`-ss`/`-to`, extração de áudio) são os mesmos, só a forma de invocar muda.
 *
 * Núcleo carregado sob demanda (~30MB) — só na primeira vez que o usuário realmente for
 * cortar ou transcrever algo, nunca no carregamento inicial da página.
 */
let ffmpegPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg()
      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm'
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      })
      return ffmpeg
    })()
  }
  return ffmpegPromise
}

/** Extrai só o áudio (comprimido, mp3 64kbps) — usado antes de transcrever: reduz um vídeo
 * de qualquer tamanho pra um arquivo pequeno o bastante pra caber no limite de 25MB da API
 * de transcrição, sem precisar mandar o vídeo inteiro. */
export async function extractAudio(videoBlob: Blob, onProgress?: (p: number) => void): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const inputName = 'input' + guessExtension(videoBlob)
  const outputName = 'audio.mp3'
  const offProgress = onProgress
    ? ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))))
    : undefined
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(videoBlob))
    await ffmpeg.exec(['-i', inputName, '-vn', '-acodec', 'libmp3lame', '-b:a', '64k', '-ac', '1', outputName])
    const data = await ffmpeg.readFile(outputName)
    return new Blob([data as unknown as BlobPart], { type: 'audio/mp3' })
  } finally {
    void offProgress
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}

/** Corta um único clipe [startSec, endSec) do vídeo original — equivalente ao
 * VideoProcessor.extract_clip do backend (mesmos parâmetros de recodificação). */
export async function cutClip(videoBlob: Blob, startSec: number, endSec: number): Promise<Blob> {
  const ffmpeg = await getFFmpeg()
  const inputName = 'input' + guessExtension(videoBlob)
  const outputName = 'clip.mp4'
  try {
    await ffmpeg.writeFile(inputName, await fetchFile(videoBlob))
    await ffmpeg.exec([
      '-ss', String(Math.max(0, startSec)),
      '-to', String(Math.max(startSec + 0.5, endSec)),
      '-i', inputName,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
      '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart',
      outputName,
    ])
    const data = await ffmpeg.readFile(outputName)
    return new Blob([data as unknown as BlobPart], { type: 'video/mp4' })
  } finally {
    await safeDelete(ffmpeg, inputName)
    await safeDelete(ffmpeg, outputName)
  }
}

async function safeDelete(ffmpeg: FFmpeg, name: string): Promise<void> {
  try {
    await ffmpeg.deleteFile(name)
  } catch {
    // arquivo pode já não existir se um passo anterior falhou — não é crítico.
  }
}

function guessExtension(blob: Blob): string {
  if (blob.type.includes('webm')) return '.webm'
  if (blob.type.includes('quicktime')) return '.mov'
  return '.mp4'
}
