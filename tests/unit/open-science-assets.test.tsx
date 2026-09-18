import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { aipochStaticAssets, type StaticAsset } from '../../lib/static-assets'
import { staticImage } from '../../lib/staticAsset'

const publicDir = fileURLToPath(new URL('../../public/', import.meta.url))

describe('Open-Science design assets', () => {
  test('registers all design images in the shared CDN catalogue with intrinsic sizes', () => {
    const assets: StaticAsset[] = aipochStaticAssets.flatMap((group) => [...group.children])
    const images = assets.filter((asset) => /^open-science-.+\.(webp|svg)$/.test(asset.fileName))
    expect(images.filter((asset) => asset.fileName.endsWith('.webp'))).toHaveLength(20)
    expect(images.filter((asset) => asset.fileName.endsWith('.svg'))).toHaveLength(9)
    for (const asset of images) {
      const image = staticImage(asset.fileName)
      expect(image.src).toStartWith('https://statics.aipoch.com/public/f/image/')
      expect(image.width).toBeGreaterThan(0)
      expect(image.height).toBeGreaterThan(0)
    }
  })

  test('removes migrated local marketing exports and the separate route asset catalogue', () => {
    const imageDir = join(publicDir, 'f/image')
    const files = existsSync(imageDir) ? readdirSync(imageDir) : []
    expect(files.filter((name) => name.startsWith('open-science-'))).toEqual([])
    expect(
      existsSync(
        fileURLToPath(
          new URL('../../app/(commonLayout)/open-science/open-science-assets.ts', import.meta.url)
        )
      )
    ).toBe(false)
  })

  test('preserves the separate overview assets and removes the old route implementation', () => {
    expect(existsSync(join(publicDir, 'open-science/overview.html'))).toBe(true)
    expect(existsSync(join(publicDir, 'open-science/overview-corporate.html'))).toBe(true)
    // Keep shared corporate assets and include the 17 new product-deck images.
    expect(readdirSync(join(publicDir, 'open-science/assets')).length).toBe(65)
    for (const file of [
      'open-science.css',
      'open-science-content.tsx',
      'open-science-effects.tsx',
      'open-science-section-rail.tsx'
    ]) {
      expect(
        existsSync(
          fileURLToPath(new URL(`../../app/(commonLayout)/open-science/${file}`, import.meta.url))
        )
      ).toBe(false)
    }
  })
})
