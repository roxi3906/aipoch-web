import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BlogSidebarCTA } from '@/components/blog-sidebar'
import { JsonLd } from '@/components/json-ld'
import { BlogArticleQuote, MarkdownRenderer } from '@/components/markdown'
import { TableOfContents } from '@/components/markdown/toc'
import { extractVideosFromContent, getPost } from '@/lib/blog'
import { SITE_DOMAIN } from '@/lib/config'
import { staticAsset } from '@/lib/staticAsset'
import { extractToc } from '@/lib/toc'

export const revalidate = 0 // Disable caching so each refresh fetches the latest data.

interface BlogPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return {}
  // Prefer SEO fields from the API, falling back to title and description.
  const title = post.frontmatter.seo?.title ?? post.frontmatter.title
  const description = post.frontmatter.seo?.description ?? post.frontmatter.description
  const canonicalUrl = `${SITE_DOMAIN}/blog/${slug}`
  const imageUrl = post.frontmatter.imagePath
  return {
    title,
    description,
    ...(post.frontmatter.seo?.keywords?.length && {
      keywords: post.frontmatter.seo.keywords
    }),
    alternates: { canonical: canonicalUrl },
    openGraph: {
      type: 'article',
      url: canonicalUrl,
      siteName: 'AIPOCH',
      title,
      description,
      ...(imageUrl && { images: [imageUrl] })
    },
    twitter: {
      card: 'summary_large_image',
      site: '@AIPOCH_AI',
      creator: '@AIPOCH_AI',
      title,
      description,
      ...(imageUrl && { images: [imageUrl] })
    },
    ...(imageUrl && {
      other: {
        thumbnail: imageUrl
      }
    })
  }
}

export default async function BlogPostPage({ params }: BlogPageProps) {
  const { slug } = await params
  const post = await getPost(slug)

  if (!post) {
    notFound()
  }

  const toc = await extractToc(post.content)
  const prev = post.previousPost
  const next = post.nextPost

  const baseUrl = `${SITE_DOMAIN}/blog/${slug}`
  const ogImage = staticAsset('og-bfe41bdd.webp')
  const schemaTitle = post.frontmatter.seo?.title ?? post.frontmatter.title
  const schemaDescription = post.frontmatter.seo?.description ?? post.frontmatter.description
  const schemaImage = post.frontmatter.imagePath

  const blogPostingSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: schemaTitle,
    description: schemaDescription,
    mainEntityOfPage: { '@type': 'WebPage', '@id': baseUrl },
    image: schemaImage,
    author: { '@type': 'Organization', name: post.frontmatter.author, url: SITE_DOMAIN },
    publisher: {
      '@type': 'Organization',
      name: 'AIPOCH',
      logo: { '@type': 'ImageObject', url: ogImage }
    },
    url: baseUrl,
    datePublished: post.frontmatter.date,
    dateModified: post.frontmatter.date,
    articleSection: post.frontmatter.category,
    wordCount: post.content.split(/\s+/).length
  }

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: schemaTitle,
    description: schemaDescription,
    image: schemaImage,
    author: { '@type': 'Organization', name: post.frontmatter.author, url: SITE_DOMAIN },
    publisher: {
      '@type': 'Organization',
      name: 'AIPOCH',
      logo: { '@type': 'ImageObject', url: ogImage }
    },
    datePublished: post.frontmatter.date,
    dateModified: post.frontmatter.date,
    mainEntityOfPage: { '@type': 'WebPage', '@id': baseUrl }
  }

  const webPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': baseUrl,
    url: baseUrl,
    name: schemaTitle,
    description: schemaDescription,
    datePublished: post.frontmatter.date,
    primaryImageOfPage: { '@type': 'ImageObject', url: schemaImage },
    speakable: {
      '@type': 'SpeakableSpecification',
      cssSelector: ['h1', 'h2', '.markdown-body p']
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_DOMAIN },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_DOMAIN}/blog` },
        { '@type': 'ListItem', position: 3, name: schemaTitle, item: baseUrl }
      ]
    }
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_DOMAIN}/#organization`,
    name: 'AIPOCH',
    url: SITE_DOMAIN,
    logo: { '@type': 'ImageObject', url: ogImage }
  }

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_DOMAIN },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_DOMAIN}/blog` },
      { '@type': 'ListItem', position: 3, name: schemaTitle, item: baseUrl }
    ]
  }

  const schemas: Record<string, unknown>[] = [
    blogPostingSchema,
    articleSchema,
    webPageSchema,
    organizationSchema,
    breadcrumbSchema
  ]

  if (post.frontmatter.faqs?.length) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: post.frontmatter.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: faq.answer
        }
      }))
    })
  }

  const videoSources = post.frontmatter.videos?.length
    ? post.frontmatter.videos.map((v) => ({
        contentUrl: v.contentUrl ?? '',
        thumbnailUrl: v.thumbnailUrl ?? ogImage,
        name: v.name,
        description: v.description ?? post.frontmatter.description,
        uploadDate: v.uploadDate ?? post.frontmatter.date
      }))
    : extractVideosFromContent(post.content).map((v) => ({
        contentUrl: v.contentUrl,
        thumbnailUrl: v.thumbnailUrl ?? ogImage,
        name: v.name ?? post.frontmatter.title,
        description: post.frontmatter.description,
        uploadDate: post.frontmatter.date
      }))

  for (const video of videoSources) {
    if (video.contentUrl) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'VideoObject',
        name: video.name,
        description: video.description,
        thumbnailUrl: video.thumbnailUrl,
        uploadDate: video.uploadDate,
        contentUrl: video.contentUrl
      })
    }
  }

  const imageUrls =
    post.frontmatter.images?.map((img) => ({
      url: img.url,
      caption: img.caption
    })) ??
    [...post.content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)].map((m) => ({
      url: m[2],
      caption: (m[1] as string) || undefined
    }))

  if (imageUrls.length) {
    for (const img of imageUrls) {
      schemas.push({
        '@context': 'https://schema.org',
        '@type': 'ImageObject',
        contentUrl: img.url,
        caption: img.caption
      })
    }
  }

  return (
    <main className="-mt-[var(--nav-h)] min-h-screen bg-[#f6f6f4] text-[#111]">
      <JsonLd data={schemas} />
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-24 pt-[calc(var(--nav-h)+48px)] sm:px-6 lg:px-8 lg:pb-32">
        {/* Restore list access: Figma hid this control, but the live detail page still needs a return path. */}
        <Link
          href="/blog"
          scroll={false}
          className="mb-4 inline-flex cursor-pointer items-center gap-2 text-sm leading-5 text-[#61615c] transition-colors hover:text-[#111]"
        >
          <ArrowLeft className="size-4" />
          Back to Blog
        </Link>

        <article>
          <header className="flex flex-col gap-5 bg-[#f6f6f4]">
            <div className="flex flex-col gap-4 py-8 pr-0 lg:pr-8">
              <div className="flex items-center gap-2 text-xs font-medium uppercase leading-4 text-[#61615c]">
                <Clock className="size-3 shrink-0" strokeWidth={2} />
                <span>{post.frontmatter.readTime}</span>
              </div>
              <h1 className="font-[Georgia] text-[40px] leading-[1.08] tracking-[-0.04em] text-[#111] sm:text-[56px] sm:leading-[56px] sm:tracking-[-0.021em] lg:pl-[352px]">
                {post.frontmatter.seo?.h1 ?? post.frontmatter.title}
              </h1>
              <p className="text-base leading-[26px] text-[#61615c] lg:pl-[352px] lg:pr-4">
                {post.frontmatter.description}
              </p>
            </div>
            <div className="flex flex-col gap-1 pt-6 text-[#61615c]">
              <span className="text-[11px] font-semibold leading-4">{post.frontmatter.author}</span>
            </div>
          </header>

          <div className="mt-[50px] grid gap-10 lg:grid-cols-[280px_minmax(0,880px)] lg:justify-between lg:gap-10">
            <aside className="hidden lg:block lg:w-[280px] lg:shrink-0 lg:self-stretch">
              <div className="sticky top-[calc(var(--nav-h)+24px)] h-fit w-full space-y-7">
                <TableOfContents toc={toc} variant="blog" className="border-0 bg-transparent p-0" />
                <BlogSidebarCTA />
              </div>
            </aside>

            <div className="min-w-0 w-full max-w-[880px]">
              <div className="blog-article-body px-8 pb-12 pt-8">
                <MarkdownRenderer
                  content={post.content}
                  mode="md"
                  components={{ blockquote: BlogArticleQuote }}
                />
              </div>

              {/* Rule and cards share the article inset so the pair stays aligned. */}
              <nav className="mt-12 px-8 pb-8">
                <div className="grid gap-6 border-t border-[#d1d1cc] pt-8 sm:grid-cols-2">
                  {prev ? (
                    <AdjacentArticleCard
                      href={`/blog/${prev.slug}`}
                      label="Previous Article"
                      title={prev.title}
                      direction="previous"
                    />
                  ) : (
                    <div />
                  )}
                  {next ? (
                    <AdjacentArticleCard
                      href={`/blog/${next.slug}`}
                      label="Next Article"
                      title={next.title}
                      direction="next"
                    />
                  ) : (
                    <div />
                  )}
                </div>
              </nav>
            </div>
          </div>
        </article>
      </div>
    </main>
  )
}

// Default: outlined transparent card. Hover: white surface plus the list-card drop shadow.
function AdjacentArticleCard({
  href,
  label,
  title,
  direction
}: {
  href: string
  label: string
  title: string
  direction: 'previous' | 'next'
}) {
  const isNext = direction === 'next'
  const Arrow = isNext ? ArrowRight : ArrowLeft

  return (
    <Link
      href={href}
      className="group flex h-full cursor-pointer flex-col gap-3 border border-[#e5e7eb] bg-transparent p-4 transition-[background-color,box-shadow] hover:bg-white hover:shadow-[0_0_0_1px_rgba(23,23,23,0.08),0_14px_40px_rgba(23,23,23,0.14)]"
    >
      <p
        className={`text-sm uppercase leading-[22px] text-[#6b6b66]${isNext ? ' text-right' : ''}`}
      >
        {label}
      </p>
      <div className={`flex min-h-24 flex-col gap-2${isNext ? ' items-end text-right' : ''}`}>
        <p className="line-clamp-3 min-h-[72px] text-base font-medium leading-6 text-[#6b6b66]">
          {title}
        </p>
        <Arrow className="size-4 text-[#6b6b66]" />
      </div>
    </Link>
  )
}
