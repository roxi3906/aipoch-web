import type { MetadataRoute } from 'next'
import { OPEN_SCIENCE_PAGE_LAST_MODIFIED } from '@/app/(commonLayout)/open-science/open-science-metadata'
import { toSchemaDate } from '@/app/(commonLayout)/open-science/open-science-structured-data'
import { commonLayoutLastModified } from '@/lib/common-layout-metadata'
import { INTERNAL_API_URL, SITE_DOMAIN } from '@/lib/config'
import { getAllGuides } from '@/lib/guides'
import { fetchBlogSitemap } from '@/service/blog'
import { fetchOpenScienceDownloadManifest } from '@/service/open-science-download'
import { fetchOpenScienceWikiSitemap } from '@/service/wiki-sitemap'

const AGENT_SKILLS_LAST_MODIFIED = '2026-09-11'
const OPEN_SCIENCE_DOWNLOAD_LAST_MODIFIED = '2026-09-11'
const BLOG_PAGE_LAST_MODIFIED = '2026-09-18'

// Disable cache, regenerate on every request
export const dynamic = 'force-dynamic'

const SEO_PAGE_LAST_MODIFIED = '2026-09-10'

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
      lastModified: SEO_PAGE_LAST_MODIFIED,
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
      url: `${SITE_DOMAIN}/medflow`,
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
      lastModified: SEO_PAGE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.8
    }),
    withReliableLastModified({
      url: `${SITE_DOMAIN}/medskillaudit`,
      lastModified: SEO_PAGE_LAST_MODIFIED,
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
      lastModified: latestPageDate(item.last_modified, SEO_PAGE_LAST_MODIFIED),
      changeFrequency: item.change_frequency || 'weekly',
      priority: item.priority ?? 0.8
    })
  )

  // Preserve newer API content dates alongside the persistent shared-layout date.
  const blogRoutes: MetadataRoute.Sitemap = blogSitemap.map((item) =>
    withReliableLastModified({
      url: item.url,
      lastModified: latestPageDate(item.last_modified, BLOG_PAGE_LAST_MODIFIED),
      changeFrequency: (item.change_frequency as 'weekly' | 'monthly') || 'monthly',
      priority: item.priority ?? 0.7
    })
  )

  // /guides redirects to the first guide; include only final guide detail pages that return HTTP 200.
  const guideRoutes: MetadataRoute.Sitemap = guides.map((guide) =>
    withReliableLastModified({
      url: `${SITE_DOMAIN}/guides/${guide.slug}`,
      lastModified: SEO_PAGE_LAST_MODIFIED,
      changeFrequency: 'weekly',
      priority: 0.7
    })
  )

  return [...staticRoutes, ...dynamicRoutes, ...blogRoutes, ...guideRoutes, ...wikiRoutes]
}
