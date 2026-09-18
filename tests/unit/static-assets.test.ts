import { describe, expect, test } from 'bun:test'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { staticAsset, staticImage } from '../../lib/staticAsset'

const mediaExtensions = new Set([
  '.gif',
  '.jpeg',
  '.jpg',
  '.mov',
  '.mp4',
  '.png',
  '.svg',
  '.webm',
  '.webp'
])

const collectPublicMediaFiles = (directory: string): string[] => {
  if (!existsSync(directory)) return []

  return readdirSync(directory).flatMap((name) => {
    const filePath = join(directory, name)
    const stat = statSync(filePath)
    if (stat.isDirectory()) return collectPublicMediaFiles(filePath)
    const lowerName = name.toLowerCase()
    const hasMediaExtension = [...mediaExtensions].some((extension) =>
      lowerName.endsWith(extension)
    )
    return hasMediaExtension ? [filePath.replace(`${process.cwd()}/`, '')] : []
  })
}

describe('staticAsset', () => {
  test('resolves migrated Open-Science WebP and SVG files through the shared image folder', () => {
    expect(staticAsset('/open-science-setup-c4dee494.webp/')).toBe(
      'https://statics.aipoch.com/public/f/image/open-science-setup-c4dee494.webp'
    )
    expect(staticAsset('open-science-define-6aaa1284.svg')).toBe(
      'https://statics.aipoch.com/public/f/image/open-science-define-6aaa1284.svg'
    )
  })

  test('resolves download page artwork through the shared image folder', () => {
    expect(staticImage('aipoch-system-map-7511f128.png')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/aipoch-system-map-7511f128.png',
      width: 1672,
      height: 941
    })
    expect(staticImage('og-open-science-download-56121c38.png')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/og-open-science-download-56121c38.png',
      width: 1065,
      height: 558
    })
  })

  test('resolves the blog list hero background through the shared image folder', () => {
    expect(staticImage('blog-hero-background-ef51ee4b.webp')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/blog-hero-background-ef51ee4b.webp',
      width: 1672,
      height: 941
    })
  })

  test('resolves social cards through the shared image folder', () => {
    expect(staticImage('og-science-open-to-all-ab128c94.png')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/og-science-open-to-all-ab128c94.png',
      width: 1280,
      height: 672
    })
    expect(staticImage('medskillaudit-social-card-bcc353ec.png')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/medskillaudit-social-card-bcc353ec.png',
      width: 1280,
      height: 720
    })
  })

  test('resolves indexed image assets through the AIPOCH static origin', () => {
    expect(staticAsset('og-bfe41bdd.webp')).toBe(
      'https://statics.aipoch.com/public/f/image/og-bfe41bdd.webp'
    )
  })

  test('resolves indexed icon and video assets through their S3 folders', () => {
    expect(staticAsset('githab-image-d03941b9.webp')).toBe(
      'https://statics.aipoch.com/public/f/icons/githab-image-d03941b9.webp'
    )
    expect(staticAsset('medskillaudit-l9s0f.mp4')).toBe(
      'https://statics.aipoch.com/public/f/video/medskillaudit-l9s0f.mp4'
    )
    expect(staticAsset('open-science-v0-10-0-9ca70918.mp4')).toBe(
      'https://statics.aipoch.com/public/f/video/open-science-v0-10-0-9ca70918.mp4'
    )
    expect(staticAsset('hero-vid-v2-1080p-bee9c53f.mp4')).toBe(
      'https://statics.aipoch.com/public/f/video/hero-vid-v2-1080p-bee9c53f.mp4'
    )
    expect(staticAsset('hero-vid-poster-279a4840.webp')).toBe(
      'https://statics.aipoch.com/public/f/image/hero-vid-poster-279a4840.webp'
    )
    expect(staticAsset('hero-architecture-fd6f4997.webp')).toBe(
      'https://statics.aipoch.com/public/f/image/hero-architecture-fd6f4997.webp'
    )
    expect(staticAsset('home-providers-1-1424e2f9.svg')).toBe(
      'https://statics.aipoch.com/public/f/image/home-providers-1-1424e2f9.svg'
    )
  })

  test('keeps unknown assets empty so callers can decide their fallback', () => {
    expect(staticAsset('missing.png')).toBe('')
  })

  test('returns image props from the shared registry with intrinsic dimensions', () => {
    expect(staticImage('/open-science-setup-c4dee494.webp/')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/open-science-setup-c4dee494.webp',
      width: 990,
      height: 521
    })
    expect(staticImage('open-science-define-6aaa1284.svg')).toEqual({
      src: 'https://statics.aipoch.com/public/f/image/open-science-define-6aaa1284.svg',
      width: 21,
      height: 21
    })
  })

  test('rejects image props for unknown assets or assets without dimensions', () => {
    expect(() => staticImage('missing.png')).toThrow('Image dimensions are not registered')
    expect(() => staticImage('hero-vid-v2-1080p-bee9c53f.mp4')).toThrow(
      'Image dimensions are not registered'
    )
    expect(() => staticImage('og-bfe41bdd.webp')).toThrow('Image dimensions are not registered')
  })

  test('does not keep migrated media files in the local public directory', () => {
    const migratedLocalFiles = collectPublicMediaFiles(join(process.cwd(), 'public')).filter(
      (file) => staticAsset(basename(file)) !== ''
    )
    expect(migratedLocalFiles).toEqual([])
  })
})
