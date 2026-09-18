import { describe, expect, test } from 'bun:test'
import {
  formatReadWatchDate,
  resolveHomeSpotlightContent
} from '../../app/(commonLayout)/home/home-spotlight-content'
import type { HomepagePublicConfig, HomepageReadWatchResponse } from '../../service/homepage'

const apiConfig: HomepagePublicConfig = {
  release_version: 'v0.16.0',
  latest_release_update: 'Aug 16, 2026',
  latest_release_title: 'v0.16.0',
  latest_release_desc: 'API-driven release description',
  latest_release_features: [{ title: 'Feature A', text: 'does A' }],
  media: [{ title: 'Product tour', url: 'https://cdn.example.com/tour.mp4' }],
  what_it_does: [{ title: 'Runs locally', text: 'no cloud lock-in' }]
}

const readWatch: HomepageReadWatchResponse = {
  items: [
    {
      title: 'Release notes and changelog',
      category: 'Product',
      published_at: '2026-08-04T12:00:00.000Z',
      slug: 'release-notes'
    },
    {
      title: 'What is an agent skill',
      category: 'Guides',
      published_at: '2026-07-22T12:00:00.000Z',
      slug: 'what-is-a-skill'
    }
  ]
}

describe('resolveHomeSpotlightContent', () => {
  test('maps homepage config and read-watch into spotlight fields', () => {
    const content = resolveHomeSpotlightContent(apiConfig, readWatch)

    expect(content.releaseVersion).toBe('v0.16.0')
    expect(content.media[0]).toMatchObject({
      label: 'Product tour',
      kind: 'video',
      url: 'https://cdn.example.com/tour.mp4'
    })
    expect(content.readWatch).toEqual([
      {
        title: 'Release notes and changelog',
        meta: 'Product',
        date: formatReadWatchDate('2026-08-04T12:00:00.000Z'),
        url: '/blog/release-notes'
      },
      {
        title: 'What is an agent skill',
        meta: 'Guides',
        date: formatReadWatchDate('2026-07-22T12:00:00.000Z'),
        url: '/blog/what-is-a-skill'
      }
    ])
  })

  test('keeps current release facts but no media when APIs are null', () => {
    expect(resolveHomeSpotlightContent(null, null)).toEqual({
      releaseVersion: 'v0.16.0',
      latestRelease: {
        updateDate: 'Aug 16, 2026',
        title: 'v0.16.0',
        description: '',
        features: []
      },
      whatItDoes: [],
      media: [],
      readWatch: []
    })
  })

  test('keeps API release snapshot values as returned by the homepage service', () => {
    const content = resolveHomeSpotlightContent(
      {
        ...apiConfig,
        release_version: 'v0.11.0',
        latest_release_update: 'Aug 7, 2026',
        latest_release_title: 'v0.11.0',
        latest_release_desc: 'stale release description',
        latest_release_features: [{ title: 'Old', text: 'stale feature' }],
        media: [{ title: 'Old tour', url: 'https://cdn.example.com/old.mp4' }]
      },
      readWatch
    )

    expect(content.releaseVersion).toBe('v0.11.0')
    expect(content.latestRelease).toEqual({
      updateDate: 'Aug 7, 2026',
      title: 'v0.11.0',
      description: 'stale release description',
      features: [['Old', 'stale feature']]
    })
    expect(content.media).toHaveLength(1)
    expect(content.readWatch).toHaveLength(2)
  })

  test('keeps read-watch when config is null', () => {
    const content = resolveHomeSpotlightContent(null, readWatch)
    expect(content.readWatch).toHaveLength(2)
    expect(content.media).toEqual([])
  })

  test('skips nullish feature/media fields without throwing', () => {
    const content = resolveHomeSpotlightContent(
      {
        release_version: 'v0.17.0',
        latest_release_update: null as unknown as string,
        latest_release_title: 'v1',
        latest_release_desc: 'desc',
        latest_release_features: [
          null as unknown as { title: string; text: string },
          { title: null as unknown as string, text: 'text' },
          { title: 'Keep', text: 'me' }
        ],
        media: [
          null as unknown as { title: string; url: string },
          { title: 'Bad', url: null as unknown as string },
          { title: 'Skip ext', url: 'https://cdn.example.com/file' },
          { title: 'Ok', url: 'https://cdn.example.com/ok.webp' }
        ],
        what_it_does: [{ title: 'A', text: null as unknown as string }]
      },
      null
    )

    expect(content.latestRelease.features).toEqual([['Keep', 'me']])
    expect(content.media).toHaveLength(2)
    expect(content.media[0]).toMatchObject({
      label: 'Skip ext',
      kind: 'unknown',
      url: 'https://cdn.example.com/file'
    })
    expect(content.media[1]).toMatchObject({
      label: 'Ok',
      kind: 'image',
      url: 'https://cdn.example.com/ok.webp'
    })
    expect(content.whatItDoes).toEqual([])
  })

  test('keeps unrecognized media URLs as tabs instead of dropping them', () => {
    const content = resolveHomeSpotlightContent(
      {
        ...apiConfig,
        media: [
          {
            title: '1111111111111111111111',
            url: 'https://statics.aipoch.com/public/f/image/paper-fb87a969.webp1'
          },
          {
            title: '2222222222222222',
            url: 'https://statics.aipoch.com/public/f/video/open-science-v0-10-0-9ca70918.mp4'
          }
        ]
      },
      null
    )

    expect(content.media).toEqual([
      {
        id: 'media-0',
        label: '1111111111111111111111',
        url: 'https://statics.aipoch.com/public/f/image/paper-fb87a969.webp1',
        kind: 'unknown',
        caption: '1111111111111111111111',
        alt: '1111111111111111111111'
      },
      {
        id: 'media-1',
        label: '2222222222222222',
        url: 'https://statics.aipoch.com/public/f/video/open-science-v0-10-0-9ca70918.mp4',
        kind: 'video',
        caption: 'A short walkthrough — task in, traceable artifacts out.',
        alt: '2222222222222222'
      }
    ])
  })

  test('skips nullish read-watch items without throwing', () => {
    const content = resolveHomeSpotlightContent(null, {
      items: [
        null as unknown as HomepageReadWatchResponse['items'][number],
        {
          title: 'Keep me',
          category: 'Product',
          published_at: '2026-08-04T12:00:00.000Z',
          slug: 'keep-me'
        },
        {
          title: '',
          category: 'Guides',
          published_at: '2026-07-22T12:00:00.000Z',
          slug: 'empty-title'
        }
      ]
    })

    expect(content.readWatch).toEqual([
      {
        title: 'Keep me',
        meta: 'Product',
        date: formatReadWatchDate('2026-08-04T12:00:00.000Z'),
        url: '/blog/keep-me'
      }
    ])
  })

  test('coerces non-string scalar config fields without throwing', () => {
    const content = resolveHomeSpotlightContent(
      {
        release_version: 101 as unknown as string,
        latest_release_update: 20260807 as unknown as string,
        latest_release_title: true as unknown as string,
        latest_release_desc: { text: 'nope' } as unknown as string,
        latest_release_features: [],
        media: [],
        what_it_does: []
      },
      {
        items: [
          {
            title: 'Post',
            category: 12 as unknown as string,
            published_at: 99 as unknown as string,
            slug: 'post'
          }
        ]
      }
    )

    expect(content.releaseVersion).toBe('')
    expect(content.latestRelease).toEqual({
      updateDate: '',
      title: '',
      description: '',
      features: []
    })
    expect(content.readWatch).toEqual([
      {
        title: 'Post',
        meta: '',
        date: '',
        url: '/blog/post'
      }
    ])
  })
})

describe('formatReadWatchDate', () => {
  test('formats ISO timestamps with abbreviated US calendar dates', () => {
    const iso = '2026-08-04T12:00:00.000Z'
    // Instant→local-calendar conversion; short month for card density.
    expect(formatReadWatchDate(iso)).toBe(
      new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    )
  })

  test('returns empty string for non-string or invalid dates', () => {
    expect(formatReadWatchDate(null)).toBe('')
    expect(formatReadWatchDate(undefined)).toBe('')
    expect(formatReadWatchDate(99 as unknown as string)).toBe('')
    expect(formatReadWatchDate('not-a-date')).toBe('')
  })
})
