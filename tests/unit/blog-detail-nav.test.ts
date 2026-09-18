import { describe, expect, mock, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'

const getPostMock = mock()

mock.module('@/lib/blog', () => ({
  extractVideosFromContent: () => [],
  getPost: getPostMock
}))

mock.module('@/components/blog-sidebar', () => ({
  BlogSidebarCTA: () => null
}))

mock.module('@/components/markdown', () => ({
  MarkdownRenderer: () => null,
  BlogArticleQuote: () => null
}))

mock.module('@/components/markdown/toc', () => ({
  TableOfContents: () => null
}))

const FIGMA_CARD_HOVER_SHADOW =
  'hover:shadow-[0_0_0_1px_rgba(23,23,23,0.08),0_14px_40px_rgba(23,23,23,0.14)]'

const createPost = () => ({
  slug: 'current-post',
  frontmatter: {
    title: 'Current Post',
    description: 'Current description.',
    category: 'Research',
    author: 'AIPOCH',
    date: '2026-05-12',
    readTime: '5 min read',
    seo: {
      title: 'Current Post',
      description: 'Current description.'
    }
  },
  content: 'Demo content.',
  previousPost: { slug: 'previous-post', title: 'Previous Article Title' },
  nextPost: { slug: 'next-post', title: 'Next Article Title' }
})

const renderBlogDetail = async () => {
  getPostMock.mockResolvedValue(createPost())
  const { default: BlogPostPage } = await import('../../app/(commonLayout)/blog/[slug]/page')
  const page = await BlogPostPage({
    params: Promise.resolve({ slug: 'current-post' })
  })
  return renderToStaticMarkup(page)
}

describe('blog detail navigation', () => {
  test('links back to the blog list from the detail page', async () => {
    const html = await renderBlogDetail()

    expect(html).toContain('Back to Blog')
    expect(html).toContain('href="/blog"')
  })

  test('keeps the list scroll position when returning from the detail page', async () => {
    const source = await Bun.file(
      new URL('../../app/(commonLayout)/blog/[slug]/page.tsx', import.meta.url)
    ).text()

    expect(source).toMatch(/href="\/blog"[\s\S]*?scroll=\{false\}/)
  })

  test('rests adjacent article cards on a transparent surface and lifts them on hover', async () => {
    const html = await renderBlogDetail()

    expect(html).toContain('Previous Article')
    expect(html).toContain('Next Article')
    expect(html).toContain('href="/blog/previous-post"')
    expect(html).toContain('href="/blog/next-post"')
    expect(html).toContain('bg-transparent')
    expect(html).toContain('hover:bg-white')
    expect(html).toContain(FIGMA_CARD_HOVER_SHADOW)
    expect(html).not.toContain('0_14px_20px_rgba(23,23,23,0.14)')
  })

  test('separates adjacent article cards from the body with a top rule', async () => {
    const html = await renderBlogDetail()

    expect(html).toMatch(/border-t[^"]*border-\[#d1d1cc\]/)
  })

  test('points the previous card left and the next card right', async () => {
    const html = await renderBlogDetail()
    const previousCard = html.match(/href="\/blog\/previous-post"[^>]*>[\s\S]*?<\/a>/)?.[0]
    const nextCard = html.match(/href="\/blog\/next-post"[^>]*>[\s\S]*?<\/a>/)?.[0]

    expect(previousCard).toContain('lucide-arrow-left')
    expect(nextCard).toContain('lucide-arrow-right')
    expect(nextCard).toContain('text-right')
    expect(nextCard).toContain('items-end')
    expect(previousCard).not.toContain('text-right')
  })
})
