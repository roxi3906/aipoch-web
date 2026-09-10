import { describe, expect, mock, test } from 'bun:test'

process.env.INTERNAL_API_URL = 'https://internal.example.test'
process.env.SITE_DOMAIN = 'https://aipoch.com'

const siteDomain = 'https://aipoch.com'
const wikiSitemapUrlPrefix = 'http://openscience-wiki/'
const wikiSitemapUrl = 'http://openscience-wiki/sitemap'

mock.module('@/lib/config', () => ({
  AIPOCH_DESIGN_SYSTEM_URL: 'https://design-system.aipoch.com/',
  AIPOCH_GITHUB_URL: 'https://github.com/aipoch/medical-research-skills',
  API_URL: '/api',
  CLARITY_ID: '',
  COOKIE_POLICY_VERSION: 'v2',
  GOOGLE_ANALYTICS_ID: '',
  INTERNAL_API_URL: 'https://internal.example.test',
  OPENSCIENCE_WIKI_INTERNAL_URL_PREFIX: wikiSitemapUrlPrefix,
  OPENSCIENCE_WIKI_URL_PREFIX: '',
  SITE_DOMAIN: siteDomain,
  STATIC_ASSETS_ORIGIN: 'https://statics.aipoch.com',
  SUPPORT_EMAIL: 'support@aipoch.com'
}))

mock.module('@/service/blog', () => ({
  fetchBlogSitemap: async () => []
}))

mock.module('@/service/open-science-download', () => ({
  fetchOpenScienceDownloadManifest: async () => ({
    version: '1.2.3',
    releaseDate: '2026-09-07T01:13:01Z',
    downloads: {
      'mac-arm64': { url: 'https://cdn.example.com/OpenScience-arm64.dmg' }
    }
  })
}))

globalThis.fetch = mock(async (input) => {
  if (input.toString() === wikiSitemapUrl) {
    return new Response(`<urlset>
      <url>
        <loc>https://www.aipoch.com/docs/getting-started</loc>
        <lastmod>2026-08-17T08:30:00.000Z</lastmod>
        <changefreq>daily</changefreq>
        <priority>0.9</priority>
      </url>
    </urlset>`)
  }

  return new Response(JSON.stringify({ code: 0, msg: 'ok', data: [] }))
}) as unknown as typeof fetch

describe('sitemap', () => {
  test('merges Wiki entries under the canonical non-www origin', async () => {
    const { default: sitemap } = await import('../../app/sitemap')

    const routes = await sitemap()

    expect(routes).toContainEqual({
      url: `${siteDomain}/docs/getting-started`,
      lastModified: new Date('2026-08-17T08:30:00.000Z'),
      changeFrequency: 'daily',
      priority: 0.9
    })
  })

  test('includes campaign pages as static routes', async () => {
    const { default: sitemap } = await import('../../app/sitemap')

    const routes = await sitemap()
    const openScienceRoute = routes.find((route) => route.url === `${siteDomain}/open-science`)
    const openScienceDownloadRoute = routes.find(
      (route) => route.url === `${siteDomain}/open-science/download`
    )
    const medFlowRoute = routes.find((route) => route.url === `${siteDomain}/medflow`)
    const medSkillAuditRoute = routes.find((route) => route.url === `${siteDomain}/medskillaudit`)
    const guidesIndexRoute = routes.find((route) => route.url === `${siteDomain}/guides`)
    const guideDetailRoute = routes.find(
      (route) => route.url === `${siteDomain}/guides/openclaw-local-deployment`
    )

    expect(openScienceRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceRoute?.lastModified as Date).toISOString()).toBe('2026-09-07T00:00:00.000Z')

    expect(openScienceDownloadRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceDownloadRoute?.lastModified as Date).toISOString()).toBe(
      '2026-09-07T00:00:00.000Z'
    )

    expect(medFlowRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect(medFlowRoute?.lastModified).toBeUndefined()

    expect(medSkillAuditRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect(medSkillAuditRoute?.lastModified).toBeUndefined()
    expect(guidesIndexRoute).toBeUndefined()
    expect(guideDetailRoute).toMatchObject({
      url: `${siteDomain}/guides/openclaw-local-deployment`,
      changeFrequency: 'weekly',
      priority: 0.7
    })
    expect(routes.some((route) => route.url === `${siteDomain}/community`)).toBe(false)
  })
  test('keeps standalone presentations outside the sitemap', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    expect(routes.some((route) => route.url.includes('/open-science/overview'))).toBe(false)
  })

  test('allows the site in robots metadata', async () => {
    const { default: robots } = await import('../../app/robots')

    const metadata = robots()

    expect(metadata.rules).toMatchObject({
      userAgent: '*',
      allow: '/'
    })
    expect(metadata.sitemap).toBe(`${siteDomain}/sitemap.xml`)
  })
})
