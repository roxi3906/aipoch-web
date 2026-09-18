import { describe, expect, test } from 'bun:test'
import {
  BLOG_LIST_INITIAL_VISIBLE,
  getVisibleBlogListPosts,
  parseStoredBlogListVisibleCount,
  shouldFetchMoreBlogListPages
} from '@/lib/blog-list-visibility'

describe('blog list layout', () => {
  const posts = Array.from({ length: 20 }, (_, index) => ({ slug: `post-${index}` }))

  test('shows nine posts initially and slices by visible count', () => {
    expect(getVisibleBlogListPosts(posts, BLOG_LIST_INITIAL_VISIBLE)).toHaveLength(9)
    expect(getVisibleBlogListPosts(posts, 15)).toHaveLength(15)
    expect(getVisibleBlogListPosts(posts, 100)).toHaveLength(20)
  })

  test('parses a stored visible count and never collapses below the initial page', () => {
    expect(parseStoredBlogListVisibleCount(null)).toBe(BLOG_LIST_INITIAL_VISIBLE)
    expect(parseStoredBlogListVisibleCount('3')).toBe(BLOG_LIST_INITIAL_VISIBLE)
    expect(parseStoredBlogListVisibleCount('27')).toBe(27)
  })

  test('fetches more list pages until the restored visible count is covered', () => {
    expect(
      shouldFetchMoreBlogListPages({
        visibleCount: 27,
        loadedListCount: 9,
        hasNextPage: true,
        isFetchingNextPage: false
      })
    ).toBe(true)
    expect(
      shouldFetchMoreBlogListPages({
        visibleCount: 27,
        loadedListCount: 9,
        hasNextPage: true,
        isFetchingNextPage: true
      })
    ).toBe(false)
    expect(
      shouldFetchMoreBlogListPages({
        visibleCount: 27,
        loadedListCount: 27,
        hasNextPage: true,
        isFetchingNextPage: false
      })
    ).toBe(false)
  })

  test('serves the list hero background from the hashed CDN catalogue', async () => {
    const source = await Bun.file(
      new URL('../../components/blog-list-client.tsx', import.meta.url)
    ).text()

    expect(source).toContain("staticImage('blog-hero-background-ef51ee4b.webp')")
    expect(source).not.toContain('/blog/hero-background.png')
  })
})
