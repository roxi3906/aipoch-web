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

const createPost = (imagePath?: string) => ({
  slug: 'demo-blog-post',
  frontmatter: {
    title: 'Demo Blog Post',
    description: 'A useful demo post.',
    category: 'Research',
    author: 'AIPOCH',
    date: '2026-05-12',
    readTime: '3 min read',
    imagePath,
    seo: {
      title: 'SEO Demo Title',
      description: 'SEO demo description.',
      keywords: ['demo', 'research']
    }
  },
  content: 'Demo content.',
  previousPost: null,
  nextPost: null
})

const generateBlogMetadata = async () => {
  const { generateMetadata } = await import('../../app/(commonLayout)/blog/[slug]/page')

  return generateMetadata({
    params: Promise.resolve({ slug: 'demo-blog-post' })
  })
}

describe('blog post metadata', () => {
  test('uses the blog image URL directly as the Open Graph and Twitter sharing image', async () => {
    getPostMock.mockResolvedValue(createPost('https://cdn.aipoch.com/uploads/demo-cover.png'))
    const metadata = await generateBlogMetadata()

    expect(metadata.openGraph?.images).toEqual(['https://cdn.aipoch.com/uploads/demo-cover.png'])
    expect(metadata.twitter?.images).toEqual(['https://cdn.aipoch.com/uploads/demo-cover.png'])
    expect(metadata.other?.thumbnail).toBe('https://cdn.aipoch.com/uploads/demo-cover.png')
  })

  test('does not normalize or join the blog image path', async () => {
    getPostMock.mockResolvedValue(createPost('/uploads/demo-cover.png'))
    const metadata = await generateBlogMetadata()

    expect(metadata.openGraph?.images).toEqual(['/uploads/demo-cover.png'])
    expect(metadata.twitter?.images).toEqual(['/uploads/demo-cover.png'])
    expect(metadata.other?.thumbnail).toBe('/uploads/demo-cover.png')
  })

  test('leaves sharing images unset when the blog image URL is empty', async () => {
    getPostMock.mockResolvedValue(createPost(''))
    const metadata = await generateBlogMetadata()

    expect(metadata.openGraph?.images).toBeUndefined()
    expect(metadata.twitter?.images).toBeUndefined()
    expect(metadata.other?.thumbnail).toBeUndefined()
  })

  test('uses the blog image path in JSON-LD SEO schemas', async () => {
    getPostMock.mockResolvedValue(createPost('https://cdn.aipoch.com/uploads/schema-cover.png'))
    const { default: BlogPostPage } = await import('../../app/(commonLayout)/blog/[slug]/page')

    const page = await BlogPostPage({
      params: Promise.resolve({ slug: 'demo-blog-post' })
    })
    const html = renderToStaticMarkup(page)
    const content = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1]
    expect(content).toBeTruthy()

    const schemas = JSON.parse(content ?? '[]') as Array<Record<string, unknown>>
    const blogPostingSchema = schemas.find((schema) => schema['@type'] === 'BlogPosting')
    const articleSchema = schemas.find((schema) => schema['@type'] === 'Article')
    const webPageSchema = schemas.find((schema) => schema['@type'] === 'WebPage')

    expect(blogPostingSchema?.image).toBe('https://cdn.aipoch.com/uploads/schema-cover.png')
    expect(articleSchema?.image).toBe('https://cdn.aipoch.com/uploads/schema-cover.png')
    expect(webPageSchema?.primaryImageOfPage).toEqual({
      '@type': 'ImageObject',
      url: 'https://cdn.aipoch.com/uploads/schema-cover.png'
    })
  })
})
