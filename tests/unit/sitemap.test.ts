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
  fetchBlogSitemap: async () => [
    { url: `${siteDomain}/blog/existing-post`, last_modified: '2026-08-12' },
    { url: `${siteDomain}/blog/newer-post`, last_modified: '2026-09-18T08:00:00Z' }
  ]
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

  if (input.toString().includes('/v1/skills/sitmap')) {
    return new Response(
      JSON.stringify({
        code: 0,
        msg: 'ok',
        data: [
          {
            url: `${siteDomain}/agent-skills/demo-skill`,
            last_modified: '2026-08-01',
            change_frequency: 'weekly',
            priority: 0.8
          }
        ]
      })
    )
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
    const homepageRoute = routes.find((route) => route.url === siteDomain)
    const openScienceRoute = routes.find((route) => route.url === `${siteDomain}/open-science`)
    const openScienceDownloadRoute = routes.find(
      (route) => route.url === `${siteDomain}/open-science/download`
    )
    const medFlowRoute = routes.find((route) => route.url === `${siteDomain}/medflow`)
    const agentSkillsRoute = routes.find((route) => route.url === `${siteDomain}/agent-skills`)
    const medSkillAuditRoute = routes.find((route) => route.url === `${siteDomain}/medskillaudit`)
    const skillsListRoute = routes.find((route) => route.url === `${siteDomain}/agent-skills/list`)
    const skillDetailRoute = routes.find(
      (route) => route.url === `${siteDomain}/agent-skills/demo-skill`
    )
    const blogRoute = routes.find((route) => route.url === `${siteDomain}/blog`)
    const guidesIndexRoute = routes.find((route) => route.url === `${siteDomain}/guides`)
    const guideDetailRoute = routes.find(
      (route) => route.url === `${siteDomain}/guides/openclaw-local-deployment`
    )

    expect((homepageRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')

    expect(openScienceRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')

    expect(openScienceDownloadRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceDownloadRoute?.lastModified as Date).toISOString()).toBe(
      '2026-09-17T00:00:00.000Z'
    )

    expect(medFlowRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect((medFlowRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')

    expect(agentSkillsRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((agentSkillsRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')

    expect(medSkillAuditRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect((medSkillAuditRoute?.lastModified as Date).toISOString()).toBe(
      '2026-09-17T00:00:00.000Z'
    )
    expect((skillsListRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')
    expect((skillDetailRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')
    expect((blogRoute?.lastModified as Date).toISOString()).toBe('2026-09-18T00:00:00.000Z')
    expect(guidesIndexRoute).toBeUndefined()
    expect(guideDetailRoute).toMatchObject({
      url: `${siteDomain}/guides/openclaw-local-deployment`,
      changeFrequency: 'weekly',
      priority: 0.7
    })
    expect((guideDetailRoute?.lastModified as Date).toISOString()).toBe('2026-09-17T00:00:00.000Z')
    expect(routes.some((route) => route.url === `${siteDomain}/community`)).toBe(false)
    expect(routes.some((route) => route.url === `${siteDomain}/medflow-redesign`)).toBe(false)
  })
  test('updates shared-layout pages while preserving newer content and Wiki dates', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    const routeDate = (url: string) =>
      (routes.find((route) => route.url === url)?.lastModified as Date)?.toISOString()

    expect(routeDate(`${siteDomain}/blog/existing-post`)).toBe('2026-09-18T00:00:00.000Z')
    expect(routeDate(`${siteDomain}/blog/newer-post`)).toBe('2026-09-18T08:00:00.000Z')
    expect(routeDate(`${siteDomain}/docs/getting-started`)).toBe('2026-08-17T08:30:00.000Z')
    for (const route of routes.filter((route) => !route.url.startsWith(`${siteDomain}/docs/`))) {
      expect(new Date(route.lastModified as Date).getTime()).toBeGreaterThanOrEqual(
        Date.parse('2026-09-17')
      )
    }
    for (const excluded of ['/guides', '/community', '/claim/private-token']) {
      expect(routes.some((route) => route.url === `${siteDomain}${excluded}`)).toBe(false)
    }
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
