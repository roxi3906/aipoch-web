import * as Lucide from 'lucide-react'
import { type MDXComponents, MDXRemote } from 'next-mdx-remote-client/rsc'
import rehypeSlug from 'rehype-slug'
import remarkFlexibleToc from 'remark-flexible-toc'
import remarkGfm from 'remark-gfm'
import { MARKDOWN_HEADING_ID_PREFIX } from '@/lib/toc'
import { BlogArticleQuote, createOrderedCallout } from './callout'
import { MarkdownErrorBoundary } from './markdown-error-boundary'

export { BlogArticleQuote, MarkdownErrorBoundary }

interface MarkdownRendererProps {
  content: string
  mode?: 'md' | 'mdx'
  components?: MDXComponents
}

// Filter out non-component exports (createLucideIcon, default) to avoid type conflicts
// lucide-react exports both icon components and utility functions
const lucideIcons = Object.fromEntries(
  Object.entries(Lucide).filter(
    ([key, value]) =>
      key !== 'createLucideIcon' && key !== 'default' && typeof value === 'object' && value !== null
  )
)

export function MarkdownRenderer({
  content,
  mode = 'mdx',
  components: callerComponents
}: MarkdownRendererProps) {
  const components = {
    // Create a separate counter for each Markdown render so color rotation stays within the current document.
    blockquote: createOrderedCallout(),
    ...lucideIcons,
    ...callerComponents
  } as MDXComponents

  return (
    <div className="markdown-body">
      <MDXRemote
        source={content}
        components={components}
        options={{
          parseFrontmatter: true,
          mdxOptions: {
            remarkPlugins: [remarkGfm, [remarkFlexibleToc, { prefix: MARKDOWN_HEADING_ID_PREFIX }]],
            rehypePlugins: [[rehypeSlug, { prefix: MARKDOWN_HEADING_ID_PREFIX }]],
            format: mode
          },
          vfileDataIntoScope: 'toc'
        }}
      />
    </div>
  )
}
