import { cache } from 'react'
import type { BlogPostDetail, BlogPostListItem, BlogPostsListData } from '@/service/blog'
import { BLOG_PAGE_SIZE, fetchBlogPost, fetchBlogPosts } from '@/service/blog'

const SLUG_REGEX = /^[a-z0-9-_]+$/i

export interface BlogPostFrontmatter {
  title: string
  description: string
  category: string
  author: string
  date: string
  readTime: string
  /** Article cover image. */
  imagePath?: string
  /** FAQ structured data for the FAQPage schema. */
  faqs?: Array<{ question: string; answer: string }>
  /** Video metadata for the VideoObject schema. */
  videos?: Array<{
    name: string
    description?: string
    thumbnailUrl?: string
    uploadDate?: string
    contentUrl?: string
  }>
  /** Image URL for the ImageObject schema. */
  images?: Array<{ url: string; caption?: string }>
  /** SEO overrides from the API, with title and description as fallbacks. */
  seo?: { title?: string; h1?: string; description?: string; keywords?: string[] }
}

export interface AdjacentPostRef {
  slug: string
  title: string
}

export interface BlogPost {
  slug: string
  frontmatter: BlogPostFrontmatter
  content: string
  previousPost?: AdjacentPostRef | null
  nextPost?: AdjacentPostRef | null
}

export {
  BLOG_LIST_INITIAL_VISIBLE,
  BLOG_LIST_SCROLL_STORAGE_KEY,
  BLOG_LIST_VISIBLE_COUNT_STORAGE_KEY,
  getVisibleBlogListPosts,
  parseStoredBlogListVisibleCount,
  shouldFetchMoreBlogListPages
} from './blog-list-visibility'

/** Convert an API list item to BlogPost without content for list display. */
export function mapListItemToBlogPost(item: BlogPostListItem): BlogPost {
  return {
    slug: item.slug,
    frontmatter: {
      title: item.title,
      description: item.description,
      category: item.category?.name ?? '',
      author: item.author,
      date: item.published_at,
      readTime: item.read_time ? `${item.read_time} min read` : '0 min read',
      imagePath: item.image_path,
      faqs: item.faq_schema,
      seo: item.seo
    },
    content: ''
  }
}

/** Convert an API detail response to BlogPost. */
function mapDetailToBlogPost(detail: BlogPostDetail): BlogPost {
  return {
    slug: detail.slug,
    frontmatter: {
      title: detail.title,
      description: detail.description,
      category: detail.category?.name ?? '',
      author: detail.author,
      date: detail.published_at,
      readTime: detail.read_time ? `${detail.read_time} min read` : '0 min read',
      imagePath: detail.image_path,
      faqs: detail.faq_schema,
      seo: detail.seo
    },
    content: detail.content ?? '',
    previousPost: detail.previous_post
      ? { slug: detail.previous_post.slug, title: detail.previous_post.title }
      : null,
    nextPost: detail.next_post
      ? { slug: detail.next_post.slug, title: detail.next_post.title }
      : null
  }
}

/** Extract a YouTube or Vimeo URL from article content for the VideoObject schema. */
export function extractVideosFromContent(content: string): Array<{
  contentUrl: string
  thumbnailUrl?: string
  name?: string
}> {
  const videos: Array<{ contentUrl: string; thumbnailUrl?: string; name?: string }> = []
  const seen = new Set<string>()

  // YouTube: embed, watch, youtu.be
  const ytPatterns = [
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g,
    /youtube\.com\/watch\?[^"'\s]*v=([a-zA-Z0-9_-]{11})/g,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/g
  ]
  for (const re of ytPatterns) {
    for (const m of content.matchAll(re)) {
      const id = m[1]
      if (seen.has(id)) continue
      seen.add(id)
      videos.push({
        contentUrl: `https://www.youtube.com/watch?v=${id}`,
        thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`
      })
    }
  }

  // Vimeo
  const vimeoPatterns = [/vimeo\.com\/(\d+)/g, /player\.vimeo\.com\/video\/(\d+)/g]
  for (const re of vimeoPatterns) {
    for (const m of content.matchAll(re)) {
      const id = m[1]
      if (seen.has(`vimeo-${id}`)) continue
      seen.add(`vimeo-${id}`)
      videos.push({
        contentUrl: `https://vimeo.com/${id}`
      })
    }
  }

  return videos
}

/** Fetch the first list page once for server rendering, returning the API format directly. */
export async function getPostsForListPage(
  page = 1,
  pageSize = BLOG_PAGE_SIZE
): Promise<BlogPostsListData> {
  return fetchBlogPosts({ page, page_size: pageSize })
}

/** Fetch a single article with slug validation and request-scoped caching. */
export const getPost = cache(async (slug: string): Promise<BlogPost | null> => {
  if (!SLUG_REGEX.test(slug)) return null
  const detail = await fetchBlogPost(slug)
  if (!detail) return null
  return mapDetailToBlogPost(detail)
})
