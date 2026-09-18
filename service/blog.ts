import { useInfiniteQuery } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { INTERNAL_API_URL } from '@/lib/config'
import type { API } from '@/service/types'
import { apiClient } from './index'

const SUCCESS_CODE = 20000

/** Blog list page size shared by SSR and client pagination. */
export const BLOG_PAGE_SIZE = 9

/** Query keys for blog lists. */
export const blogKeys = {
  all: ['blog'] as const,
  list: () => [...blogKeys.all, 'posts'] as const
}

/** Category in a list item. */
export interface BlogCategory {
  id: number
  name: string
  slug: string
  description?: string
  seo?: {
    title?: string
    h1?: string
    description?: string
    keywords?: string[]
  }
}

/** SEO metadata in a list item. */
export interface BlogSeo {
  title?: string
  h1?: string
  description?: string
  keywords?: string[]
}

/** List item. */
export interface BlogPostListItem {
  id: number
  title: string
  slug: string
  description: string
  image_path?: string
  author: string
  tags: string[]
  faq_schema?: Array<{ question: string; answer: string }>
  read_time: number
  category: BlogCategory
  view_count: number
  seo?: BlogSeo
  published_at: string
}

/** Detail response, including content. */
export interface BlogPostDetail extends BlogPostListItem {
  content: string
  previous_post?: { title: string; slug: string } | null
  next_post?: { title: string; slug: string } | null
}

/** List response. */
export interface BlogPostsListData {
  items: BlogPostListItem[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

/** Sitemap entry. */
export interface BlogSitemapItem {
  url: string
  last_modified: string
  change_frequency?: string
  priority?: number
}

/** Empty list response when the API has no data. */
function emptyPostsList(params?: { page?: number; page_size?: number }): BlogPostsListData {
  const page = params?.page ?? 1
  const pageSize = params?.page_size ?? BLOG_PAGE_SIZE
  return {
    items: [],
    total: 0,
    page,
    page_size: pageSize,
    total_pages: 1
  }
}

/** Fetch a blog list on the client. */
export async function fetchBlogPostsClient(params: {
  page: number
  page_size: number
}): Promise<API.GeneralResponse<BlogPostsListData> | API.ErrorResponse> {
  try {
    const response = await apiClient.get<API.GeneralResponse<BlogPostsListData>>('/v1/blog/posts', {
      params: { page: params.page, page_size: params.page_size }
    })
    const json = response.data

    if (json.code !== SUCCESS_CODE || !json.data) {
      return {
        code: json.code ?? 500,
        msg: json.msg || 'Failed to fetch blog posts',
        data: null
      }
    }

    return {
      code: 200,
      msg: json.msg,
      data: json.data
    }
  } catch (e) {
    if (isAxiosError(e)) {
      const res = e.response
      return {
        code: res?.status || 500,
        msg: res?.data?.msg || 'Internal Server Error, please try again later.',
        data: null
      }
    }
    return {
      code: 500,
      msg: 'Internal Server Error, please try again later.',
      data: null
    }
  }
}

/** Use React Query Infinite Query to fetch blog posts with caching and scroll restoration. */
export function useInfiniteBlogPosts(
  page_size: number = BLOG_PAGE_SIZE,
  initialData?: { pages: BlogPostsListData[]; pageParams: number[] }
) {
  return useInfiniteQuery({
    queryKey: blogKeys.list(),
    queryFn: async ({ pageParam = 1 }) => {
      const result = await fetchBlogPostsClient({ page: pageParam, page_size })
      if (result.data === null) {
        throw new Error(result.msg)
      }
      return result.data
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1
      }
      return undefined
    },
    initialPageParam: 1,
    initialData,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: initialData?.pages.some((page) => page.items.length > 0) ? false : 'always',
    refetchOnWindowFocus: false
  })
}

/** Fetch a blog list. */
export async function fetchBlogPosts(params?: {
  page?: number
  page_size?: number
}): Promise<BlogPostsListData> {
  try {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', String(params.page))
    searchParams.set('page_size', String(params?.page_size ?? BLOG_PAGE_SIZE))

    const url = `${INTERNAL_API_URL}/v1/blog/posts${searchParams.toString() ? `?${searchParams}` : ''}`
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
    if (!res.ok) return emptyPostsList(params)

    const json: API.GeneralResponse<BlogPostsListData> = await res.json()
    if (json.code !== SUCCESS_CODE || !json.data) return emptyPostsList(params)
    return json.data.items?.length ? json.data : emptyPostsList(params)
  } catch (error) {
    console.error('Error fetching blog posts:', error)
    return emptyPostsList(params)
  }
}

/** Fetch a single blog post. */
export async function fetchBlogPost(slug: string): Promise<BlogPostDetail | null> {
  try {
    const res = await fetch(`${INTERNAL_API_URL}/v1/blog/posts/${encodeURIComponent(slug)}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
    if (!res.ok) return null

    const json: API.GeneralResponse<BlogPostDetail> = await res.json()
    if (json.code !== SUCCESS_CODE || !json.data) return null

    return json.data
  } catch (error) {
    console.error('Error fetching blog post:', error)
    return null
  }
}

/** Fetch the blog sitemap. */
export async function fetchBlogSitemap(params: { baseUrl: string }): Promise<BlogSitemapItem[]> {
  try {
    const searchParams = new URLSearchParams()
    searchParams.set('base_url', params.baseUrl)
    const res = await fetch(`${INTERNAL_API_URL}/v1/blog/sitemap?${searchParams.toString()}`, {
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
    if (!res.ok) {
      return []
    }

    const json = await res.json()
    const items = Array.isArray(json) ? json : json?.data
    const result = Array.isArray(items) ? items : []
    return result
  } catch (error) {
    console.error('Error fetching blog sitemap:', error)
    return []
  }
}
