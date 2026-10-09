import { afterEach, describe, expect, it, vi } from 'vitest'
import { MACOS_DOWNLOAD_URL, resolveDownloadUrls, WINDOWS_DOWNLOAD_URL } from './downloads'

const release = (version: string) => ({
  tag_name: `v${version}`,
  assets: [
    { name: `AutoClip.Desktop_${version}_x64-setup.exe`, browser_download_url: `https://github.com/vn-alves/autoclip.br/releases/download/v${version}/AutoClip.Desktop_${version}_x64-setup.exe` },
    { name: `AutoClip.Desktop_${version}_aarch64.dmg`, browser_download_url: `https://github.com/vn-alves/autoclip.br/releases/download/v${version}/AutoClip.Desktop_${version}_aarch64.dmg` },
  ],
})

afterEach(() => { vi.unstubAllGlobals() })

describe('desktop download version', () => {
  it('uses 2.0.4 installers when GitHub is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const urls = await resolveDownloadUrls()
    expect(urls.version).toBe('2.0.4')
    expect(urls.windows).toBe('https://github.com/vn-alves/autoclip.br/releases/download/v2.0.4/AutoClip.Desktop_x64-setup.exe')
    expect(urls.macos).toBe('https://github.com/vn-alves/autoclip.br/releases/download/v2.0.4/AutoClip.Desktop_aarch64.dmg')
  })

  it('does not replace 2.0.4 downloads with an older release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [release('2.0.3')] }))
    expect(await resolveDownloadUrls()).toEqual({ windows: WINDOWS_DOWNLOAD_URL, macos: MACOS_DOWNLOAD_URL, version: '2.0.4' })
  })

  it('continues resolving newer published installers automatically', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [release('2.0.5')] }))
    const urls = await resolveDownloadUrls()
    expect(urls.version).toBe('2.0.5')
    expect(urls.windows).toBe(release('2.0.5').assets[0].browser_download_url)
    expect(urls.macos).toBe(release('2.0.5').assets[1].browser_download_url)
  })
})