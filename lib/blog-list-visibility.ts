/** First grid rows shown before incremental "Show more" loads (three columns × three rows). */
export const BLOG_LIST_INITIAL_VISIBLE = 9

export const BLOG_LIST_SCROLL_STORAGE_KEY = 'blog-list-scroll-position'
export const BLOG_LIST_VISIBLE_COUNT_STORAGE_KEY = 'blog-list-visible-count'

/** Slice list posts (excluding the featured card) to the current visible count. */
export function getVisibleBlogListPosts<T>(posts: T[], visibleCount: number): T[] {
  return posts.slice(0, Math.max(visibleCount, 0))
}

/** Restore Show more expansion; never collapse below the first page of list cards. */
export function parseStoredBlogListVisibleCount(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < BLOG_LIST_INITIAL_VISIBLE) {
    return BLOG_LIST_INITIAL_VISIBLE
  }
  return parsed
}

/** Keep fetching cached/next pages until the restored visible count can render. */
export function shouldFetchMoreBlogListPages({
  visibleCount,
  loadedListCount,
  hasNextPage,
  isFetchingNextPage
}: {
  visibleCount: number
  loadedListCount: number
  hasNextPage: boolean
  isFetchingNextPage: boolean
}): boolean {
  return visibleCount > loadedListCount && hasNextPage && !isFetchingNextPage
}
