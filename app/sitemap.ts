import type { MetadataRoute } from 'next'
import { HOMEPAGE_LAYOUT_LAST_MODIFIED } from '@/app/(commonLayout)/home/home-structured-data'
import { MEDFLOW_PAGE_LAST_MODIFIED } from '@/app/(commonLayout)/medflow/medflow-metadata'
import { MEDSKILLAUDIT_PAGE_LAST_MODIFIED } from '@/app/(commonLayout)/medskillaudit/medskillaudit-structured-data'
import { OPEN_SCIENCE_PAGE_LAST_MODIFIED } from '@/app/(commonLayout)/open-science/open-science-metadata'
import { toSchemaDate } from '@/app/(commonLayout)/open-science/open-science-structured-data'
import { agentSkillPageLastModified } from '@/lib/agent-skill-page-metadata'
import { BLOG_PAGE_LAST_MODIFIED, blogArticleLastModified } from '@/lib/blog-page-metadata'
import { commonLayoutLastModified } from '@/lib/common-layout-metadata'
import { INTERNAL_API_URL, SITE_DOMAIN } from '@/lib/config'
import { guidePageLastModified } from '@/lib/guide-page-metadata'
import { getAllGuides } from '@/lib/guides'
import { fetchBlogSitemap } from '@/service/blog'
import { fetchOpenScienceDownloadManifest } from '@/service/open-science-download'
import { fetchUseCaseSitemapEntries } from '@/service/open-science-use-cases.server'
import { fetchOpenScienceWikiSitemap } from '@/service/wiki-sitemap'

const AGENT_SKILLS_LAST_MODIFIED = '2026-09-11'
const OPEN_SCIENCE_DOWNLOAD_LAST_MODIFIED = '2026-09-30'
const OPEN_SCIENCE_USE_CASES_LAST_MODIFIED = '2026-10-10'
// Track overview and replay template changes separately from the gallery.
const OPEN_SCIENCE_USE_CASE_DETAIL_LAST_MODIFIED = '2026-10-10'
// Preview switching and delayed PDF navigation were corrected on October 10.
const OPEN_SCIENCE_USE_CASE_REPLAY_LAST_MODIFIED = '2026-10-10'
const AGENT_SKILLS_LIST_LAST_MODIFIED = '2026-09-23'

// Disable cache, regenerate on every request
export const dynamic = 'force-dynamic'

interface SitemapItem {
  url: string
  last_modified?: string
  change_frequency?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
}

interface ApiResponse<T> {
  code: number
  msg: string
  data: T
}

async function fetchSkillsSitemap(): Promise<SitemapItem[]> {
  try {
    const res = await fetch(
      `${INTERNAL_API_URL}/v1/skills/sitmap?base_url=${encodeURIComponent(SITE_DOMAIN)}/agent-skills`,
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store'
      }
    )
    if (!res.ok) {
      return []
    }
    const payload = (await res.json()) as ApiResponse<SitemapItem[]>
    return payload.data ?? []
  } catch {
    return []
  }
}

/** All local sitemap routes share the navigation; Wiki entries retain their own dates. */
const withReliableLastModified = (
  route: Omit<MetadataRoute.Sitemap[number], 'lastModified'> & {
    lastModified?: string | Date
  }
): MetadataRoute.Sitemap[number] => {
  const { lastModified, ...rest } = route
  return { ...rest, lastModified: new Date(commonLayoutLastModified(lastModified)) }
}

const latestPageDate = (...values: Array<string | undefined>): string | undefined =>
  values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Let dynamic sources fail independently; do not invent an Open-Science update time when the manifest is unavailable.
  const [skillsSitemap, blogSitemap, wikiRoutes, guides, releaseManifest] = await Promise.all([
    fetchSkillsSitemap(),
    fetchBlogSitemap({ baseUrl: `${SITE_DOMAIN}/blog` }),
    fetchOpenScienceWikiSitemap(),
    getAllGuides(),
    fetchOpenScienceDownloadManifest().catch(() => null)
  ])
  const openScienceReleaseDate = releaseManifest?.releaseDate
    ? toSchemaDate(releaseManifest.releaseDate, '')
    : undefined
  const openScienceLastModified = latestPageDate(
    openScienceReleaseDate,
    OPEN_SCIENCE_PAGE_LAST_MODIFIED
  )

  // Static routes: only final 200 URLs; lastmod only when content/version date is known.
  const staticRoutes: MetadataRoute.Sitemap = [
    withReliableLastModified({
      url: SITE_DOMAIN,
      lastModified: HOMEPAGE_LAYOUT_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 1.0
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/open-science`,
      lastModified: openScienceLastModified,
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/open-science/download`,
      lastModified: latestPageDate(openScienceReleaseDate, OPEN_SCIENCE_DOWNLOAD_LAST_MODIFIED),
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/open-science/use-cases`,
      lastModified: OPEN_SCIENCE_USE_CASES_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/medflow`,
      lastModified: MEDFLOW_PAGE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/agent-skills`,
      lastModified: AGENT_SKILLS_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/agent-skills/list`,
      lastModified: AGENT_SKILLS_LIST_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/medskillaudit`,
      lastModified: MEDSKILLAUDIT_PAGE_LAST_MODIFIED,
      changeFrequency: 'monthly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/blog`,
      lastModified: BLOG_PAGE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8
    })
  ]

  const dynamicRoutes: MetadataRoute.Sitemap = skillsSitemap.map((item) =>
    withReliableLastModified({
      url: item.url,
      lastModified: agentSkillPageLastModified(item.last_modified),
      changeFrequency: item.change_frequency || 'weekly',
      priority: item.priority ?? 0.8
    })
  )

  // Preserve newer API content dates alongside the persistent shared-layout date.
  const blogRoutes: MetadataRoute.Sitemap = blogSitemap.map((item) =>
    withReliableLastModified({
      url: item.url,
      lastModified: blogArticleLastModified(item.last_modified),
      changeFrequency: (item.change_frequency as 'weekly' | 'monthly') || 'monthly',
      priority: item.priority ?? 0.7
    })
  )

  // /guides redirects to the first guide; include only final guide detail pages that return HTTP 200.
  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) =>
    withReliableLastModified({
      url: `${SITE_DOMAIN}/guides/${guide.slug}`,
      lastModified: guidePageLastModified(guide.frontmatter.lastModified),
      changeFrequency: 'weekly',
      priority: 0.7
    })
  )

  // Every published case has both an overview and an inspectable session.
  const useCaseRoutes: MetadataRoute.Sitemap = (await fetchUseCaseSitemapEntries()).flatMap(
    (useCase) => [
      withReliableLastModified({
        url: `${SITE_DOMAIN}/open-science/use-cases/${useCase.slug}`,
        lastModified: OPEN_SCIENCE_USE_CASE_DETAIL_LAST_MODIFIED,
        changeFrequency: 'monthly',
        priority: 0.7
      }),
      withReliableLastModified({
        url: `${SITE_DOMAIN}/open-science/use-cases/${useCase.slug}/replay`,
        lastModified: OPEN_SCIENCE_USE_CASE_REPLAY_LAST_MODIFIED,
        changeFrequency: 'monthly',
        priority: 0.6
      })
    ]
  )

  return [
    ...staticRoutes,
    ...dynamicRoutes,
    ...blogRoutes,
    ...guideRoutes,
    ...wikiRoutes,
    ...useCaseRoutes
  ]
}
