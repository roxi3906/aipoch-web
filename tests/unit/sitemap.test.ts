import { describe, expect, mock, test } from 'bun:test'

process.env.INTERNAL_API_URL = 'https://internal.example.test'
process.env.SITE_DOMAIN = 'https://aipoch.com'

const siteDomain = 'https://aipoch.com'
const wikiSitemapUrlPrefix = 'http://openscience-wiki/'
const wikiSitemapUrl = 'http://openscience-wiki/sitemap'

mock.module('@/service/open-science-use-cases.server', () => ({
  fetchUseCaseSitemapEntries: async () => [
    { slug: 'nvda-all-at-once-or-four-weeks', title: 'NVDA: ALL AT ONCE OR FOUR WEEKS?' },
    {
      slug: 'can-a-simple-algorithm-beat-ai-at-wordle',
      title: 'Can a Simple Algorithm Beat AI at Wordle'
    }
  ]
}))

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
    { url: `${siteDomain}/blog/newer-post`, last_modified: '2026-10-09T08:00:00Z' }
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
          },
          { url: `${siteDomain}/agent-skills/newer-skill`, last_modified: '2026-10-09T08:00:00Z' },
          { url: `${siteDomain}/agent-skills/undated-skill`, last_modified: 'invalid' }
        ]
      })
    )
  }

  return new Response(JSON.stringify({ code: 0, msg: 'ok', data: [] }))
}) as unknown as typeof fetch

describe('sitemap', () => {
  test('includes detail and replay routes for every manifest case with their page dates', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    expect(routes.some((route) => route.url.includes('/replay/dot-science'))).toBe(false)
    for (const path of [
      '/open-science/use-cases',
      '/open-science/use-cases/nvda-all-at-once-or-four-weeks',
      '/open-science/use-cases/can-a-simple-algorithm-beat-ai-at-wordle',
      '/open-science/use-cases/nvda-all-at-once-or-four-weeks/replay',
      '/open-science/use-cases/can-a-simple-algorithm-beat-ai-at-wordle/replay'
    ]) {
      expect(routes.find((route) => route.url === `${siteDomain}${path}`)?.lastModified).toEqual(
        new Date('2026-10-10')
      )
    }
  })
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
      (route) => route.url === `${siteDomain}/guides/what-is-a-skill`
    )

    expect((homepageRoute?.lastModified as Date).toISOString()).toBe('2026-10-10T00:00:00.000Z')

    expect(openScienceRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceRoute?.lastModified as Date).toISOString()).toBe('2026-10-10T00:00:00.000Z')

    expect(openScienceDownloadRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((openScienceDownloadRoute?.lastModified as Date).toISOString()).toBe(
      '2026-10-09T00:00:00.000Z'
    )

    expect(medFlowRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect((medFlowRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')

    expect(agentSkillsRoute).toMatchObject({
      changeFrequency: 'weekly',
      priority: 0.8
    })
    expect((agentSkillsRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')

    expect(medSkillAuditRoute).toMatchObject({
      changeFrequency: 'monthly',
      priority: 0.8
    })
    expect((medSkillAuditRoute?.lastModified as Date).toISOString()).toBe(
      '2026-10-09T00:00:00.000Z'
    )
    expect((skillsListRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect((skillDetailRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect((blogRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(guidesIndexRoute).toBeUndefined()
    expect(guideDetailRoute).toMatchObject({
      url: `${siteDomain}/guides/what-is-a-skill`,
      changeFrequency: 'weekly',
      priority: 0.7
    })
    expect((guideDetailRoute?.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    expect(routes.some((route) => route.url === `${siteDomain}/community`)).toBe(false)
    expect(routes.some((route) => route.url === `${siteDomain}/medflow-redesign`)).toBe(false)
  })

  test('lists only the three active guides with their content and navigation update date', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    const guideRoutes = routes.filter((route) => route.url.startsWith(`${siteDomain}/guides/`))

    expect(guideRoutes.map((route) => route.url)).toEqual([
      `${siteDomain}/guides/what-is-a-skill`,
      `${siteDomain}/guides/get-started-with-skills`,
      `${siteDomain}/guides/build-your-own-skill`
    ])
    for (const route of guideRoutes) {
      expect((route.lastModified as Date).toISOString()).toBe('2026-10-09T00:00:00.000Z')
    }
  })

  test('updates shared-layout pages while preserving newer content and Wiki dates', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    const routeDate = (url: string) =>
      (routes.find((route) => route.url === url)?.lastModified as Date)?.toISOString()

    expect(routeDate(`${siteDomain}/blog`)).toBe('2026-10-09T00:00:00.000Z')
    expect(routeDate(`${siteDomain}/agent-skills/list`)).toBe('2026-10-09T00:00:00.000Z')
    expect(routeDate(`${siteDomain}/blog/existing-post`)).toBe('2026-10-09T00:00:00.000Z')
    expect(routeDate(`${siteDomain}/blog/newer-post`)).toBe('2026-10-09T08:00:00.000Z')
    expect(routeDate(`${siteDomain}/docs/getting-started`)).toBe('2026-08-17T08:30:00.000Z')
    for (const route of routes.filter((route) => !route.url.startsWith(`${siteDomain}/docs/`))) {
      expect(new Date(route.lastModified as Date).getTime()).toBeGreaterThanOrEqual(
        Date.parse('2026-10-09')
      )
    }
    for (const excluded of ['/guides', '/community', '/claim/private-token']) {
      expect(routes.some((route) => route.url === `${siteDomain}${excluded}`)).toBe(false)
    }
  })

  test('records the skill template date, preserves newer API dates and keeps leaderboards excluded', async () => {
    const { default: sitemap } = await import('../../app/sitemap')
    const routes = await sitemap()
    const date = (slug: string) =>
      (
        routes.find((route) => route.url === `${siteDomain}/agent-skills/${slug}`)
          ?.lastModified as Date
      )?.toISOString()
    expect(date('demo-skill')).toBe('2026-10-09T00:00:00.000Z')
    expect(date('newer-skill')).toBe('2026-10-09T08:00:00.000Z')
    expect(date('undated-skill')).toBe('2026-10-09T00:00:00.000Z')
    expect(date('list')).toBe('2026-10-09T00:00:00.000Z')
    expect(routes.some((route) => route.url.includes('/leaderboard'))).toBe(false)
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
