import { fetchNewestRelease, findMacAsset, findWindowsAsset, releaseVersion } from '../utils/githubReleases'

/**
 * Config central dos links de download do app desktop — usada pela Landing Page e por
 * Configurações (SettingsPage). Única fonte, pra nunca ter duas URLs divergentes.
 *
 * Os botões resolvem a release MAIS RECENTE automaticamente (resolveDownloadUrls):
 * consultam a API do GitHub e pegam o instalador certo para cada sistema, então
 * toda tag nova (ex.: v1.9.10) passa a ser baixada sem editar o site.
 * As constantes abaixo são o fallback usado se a consulta falhar (offline etc.)
 * e devem apontar para a última release conhecida.
 */
export const RELEASES_URL = 'https://github.com/vn-alves/autoclip.br/releases/latest'

export const WINDOWS_DOWNLOAD_URL =
  'https://github.com/vn-alves/autoclip.br/releases/download/v2.0.3/AutoClip.Desktop_2.0.3_x64-setup.exe'
export const MACOS_DOWNLOAD_URL =
  'https://github.com/vn-alves/autoclip.br/releases/download/v2.0.3/AutoClip.Desktop_2.0.3_aarch64.dmg'


export interface DownloadUrls {
  windows: string
  macos: string
  version: string | null
}

/** Busca os instaladores da release mais recente; em caso de erro, usa o fallback acima. */
export async function resolveDownloadUrls(): Promise<DownloadUrls> {
  const fallback: DownloadUrls = { windows: WINDOWS_DOWNLOAD_URL, macos: MACOS_DOWNLOAD_URL, version: null }
  try {
    const data = await fetchNewestRelease()
    const assets: any[] = Array.isArray(data.assets) ? data.assets : []
    const exe = findWindowsAsset(assets)
    const dmg = findMacAsset(assets)
    if (!exe && !dmg) return fallback
    return {
      windows: exe?.browser_download_url || fallback.windows,
      macos: dmg?.browser_download_url || fallback.macos,
      version: releaseVersion(data) || null,
    }
  } catch {
    return fallback
  }
}
