import type {
  HomepageMediaItem,
  HomepagePublicConfig,
  HomepageReadWatchItem,
  HomepageReadWatchResponse
} from '@/service/homepage'
import {
  OPEN_SCIENCE_CURRENT_RELEASE_LABEL,
  OPEN_SCIENCE_CURRENT_VERSION
} from '../open-science/open-science-structured-data'

export type HomeSpotlightPair = readonly [string, string]

export type HomeSpotlightMediaKind = 'video' | 'image' | 'unknown'

export interface HomeSpotlightMediaItem {
  id: string
  label: string
  url: string
  kind: HomeSpotlightMediaKind
  caption: string
  alt: string
}

export interface HomeSpotlightLatestRelease {
  updateDate: string
  title: string
  description: string
  features: HomeSpotlightPair[]
}

export interface HomeSpotlightReadWatchItem {
  title: string
  meta: string
  date: string
  url: string
}

export interface HomeSpotlightContent {
  releaseVersion: string
  latestRelease: HomeSpotlightLatestRelease
  whatItDoes: HomeSpotlightPair[]
  media: HomeSpotlightMediaItem[]
  readWatch: HomeSpotlightReadWatchItem[]
}

const VIDEO_EXTENSIONS = ['.mp4'] as const
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'] as const

const DEFAULT_VIDEO_CAPTION = 'A short walkthrough — task in, traceable artifacts out.'

const CURRENT_RELEASE_CONTENT: HomeSpotlightLatestRelease = {
  updateDate: OPEN_SCIENCE_CURRENT_RELEASE_LABEL,
  title: OPEN_SCIENCE_CURRENT_VERSION,
  description: '',
  features: []
}

const EMPTY_CONTENT: HomeSpotlightContent = {
  releaseVersion: OPEN_SCIENCE_CURRENT_VERSION,
  latestRelease: CURRENT_RELEASE_CONTENT,
  whatItDoes: [],
  media: [],
  readWatch: []
}

function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function mediaPathname(url: string): string {
  return (url.split('?')[0]?.split('#')[0] ?? '').toLowerCase()
}

function resolveMediaKind(url: string): HomeSpotlightMediaKind {
  const path = mediaPathname(url)
  if (VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension))) return 'video'
  if (IMAGE_EXTENSIONS.some((extension) => path.endsWith(extension))) return 'image'
  // Keep the tab even when the extension is unrecognized; HomeMedia shows a black unavailable state.
  return 'unknown'
}

function mapApiMedia(items: HomepageMediaItem[] | null | undefined): HomeSpotlightMediaItem[] {
  if (!items?.length) return []
  return items.flatMap((item, index) => {
    if (item == null || typeof item !== 'object') return []
    const title = asTrimmedString(item.title)
    const url = asTrimmedString(item.url)
    if (!title || !url) return []
    const kind = resolveMediaKind(url)
    return [
      {
        id: `media-${index}`,
        label: title,
        url,
        kind,
        caption: kind === 'video' ? DEFAULT_VIDEO_CAPTION : title,
        alt: title
      }
    ]
  })
}

function pairsFromTitleText(
  items: Array<{ title: string; text: string } | null | undefined> | null | undefined
): HomeSpotlightPair[] {
  if (!items?.length) return []
  return items.flatMap((item) => {
    if (item == null || typeof item !== 'object') return []
    const title = asTrimmedString(item.title)
    const text = asTrimmedString(item.text)
    if (!title || !text) return []
    return [[title, text] as const]
  })
}

/** Read & watch dates use local calendar conversion with abbreviated months for compact cards. */
export function formatReadWatchDate(dateStr: string | null | undefined): string {
  const trimmed = asTrimmedString(dateStr)
  if (!trimmed) return ''
  const date = new Date(trimmed)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

function mapReadWatchItems(
  items: Array<HomepageReadWatchItem | null | undefined> | null | undefined
): HomeSpotlightReadWatchItem[] {
  if (!items?.length) return []
  return items.flatMap((item) => {
    if (item == null || typeof item !== 'object') return []
    const title = asTrimmedString(item.title)
    const slug = asTrimmedString(item.slug)
    if (!title || !slug) return []
    return [
      {
        title,
        meta: asTrimmedString(item.category),
        date: formatReadWatchDate(item.published_at),
        url: `/blog/${encodeURIComponent(slug)}`
      }
    ]
  })
}

/** Map API data only. Return empty content when configuration is missing, without a local static fallback. */
export function resolveHomeSpotlightContent(
  config: HomepagePublicConfig | null | undefined,
  readWatch: HomepageReadWatchResponse | null | undefined = null
): HomeSpotlightContent {
  if (!config && !readWatch) return EMPTY_CONTENT
  const hasConfig = Boolean(config)

  return {
    releaseVersion: hasConfig
      ? asTrimmedString(config?.release_version)
      : CURRENT_RELEASE_CONTENT.title,
    latestRelease: hasConfig
      ? {
          updateDate: asTrimmedString(config?.latest_release_update),
          title: asTrimmedString(config?.latest_release_title),
          description: asTrimmedString(config?.latest_release_desc),
          features: pairsFromTitleText(config?.latest_release_features)
        }
      : CURRENT_RELEASE_CONTENT,
    whatItDoes: pairsFromTitleText(config?.what_it_does),
    media: hasConfig ? mapApiMedia(config?.media ?? []) : [],
    readWatch: mapReadWatchItems(readWatch?.items)
  }
}
