/**
 * Fonte única da "release mais nova" do GitHub, usada pelo atualizador do app e pelos botões
 * de download. Lista as releases (inclui pré-releases, que /releases/latest ignora), descarta
 * rascunhos e as sem instalador, e escolhe a de maior versão — não a mais recente por data.
 */
const REPO = 'vn-alves/autoclip.br'
const LIST_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`

export const cleanVersion = (v: string) => v.trim().replace(/^v/i, '')

export function compareVersions(a: string, b: string): number {
  const pa = cleanVersion(a).split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  const pb = cleanVersion(b).split(/[.-]/).map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0 ? 1 : -1
  }
  return 0
}

export const findWindowsAsset = (assets: any[]) =>
  assets.find((a) => /x64-setup\.exe$/i.test(a.name)) || assets.find((a) => /\.exe$/i.test(a.name))
export const findMacAsset = (assets: any[]) => assets.find((a) => /\.dmg$/i.test(a.name))

export function releaseVersion(release: any): string {
  const assets: any[] = Array.isArray(release?.assets) ? release.assets : []
  const fromAsset = assets.map((a) => String(a.name).match(/_(\d+\.\d+\.\d+)_/)?.[1]).find(Boolean)
  return fromAsset || cleanVersion(String(release?.tag_name || '0.0.0'))
}

/** Escolhe a release de maior versão que tenha instalador (pura, testável). */
export function pickNewestRelease(releases: any[]): any | null {
  const usable = releases.filter((r) => r && !r.draft && Array.isArray(r.assets) &&
    (findWindowsAsset(r.assets) || findMacAsset(r.assets)))
  if (usable.length === 0) return null
  return usable.reduce((best, r) => (compareVersions(releaseVersion(r), releaseVersion(best)) > 0 ? r : best))
}

const getJson = async (url: string) => {
  const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, {
    headers: { Accept: 'application/vnd.github+json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function fetchNewestRelease(): Promise<any> {
  try {
    const list = await getJson(LIST_API)
    const best = Array.isArray(list) ? pickNewestRelease(list) : null
    if (best) return best
  } catch { /* tenta /latest abaixo */ }
  return getJson(LATEST_API)
}
