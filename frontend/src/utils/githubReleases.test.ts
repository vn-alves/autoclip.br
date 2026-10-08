import { describe, expect, it } from 'vitest'
import { pickNewestRelease, releaseVersion } from './githubReleases'

const rel = (tag: string, extra: any = {}) => ({
  tag_name: tag, draft: false, prerelease: false,
  assets: [{ name: `AutoClip.Desktop_${tag.replace('v', '')}_x64-setup.exe` }, { name: `AutoClip.Desktop_${tag.replace('v', '')}_aarch64.dmg` }],
  ...extra,
})

describe('pickNewestRelease', () => {
  it('escolhe a maior versão, mesmo marcada como pré-release', () => {
    expect(releaseVersion(pickNewestRelease([rel('v2.0.2'), rel('v2.0.3', { prerelease: true })]))).toBe('2.0.3')
  })
  it('ignora rascunhos e releases sem instalador', () => {
    const r = pickNewestRelease([rel('v2.0.2'), rel('v2.0.4', { draft: true }), rel('v2.0.3', { assets: [] })])
    expect(releaseVersion(r)).toBe('2.0.2')
  })
})
