import { Clock } from 'lucide-react'
import Link from 'next/link'
import type { BlogPost } from '@/lib/blog'
import { cn } from '@/lib/utils'

interface BlogCardProps {
  post: BlogPost
  variant: 'featured' | 'secondary'
}

function formatCategoryLabel(category: string) {
  const value = category.trim() || 'AIPOCH-open-science'
  return value.replace(/\s+/g, '-').replace(/_/g, '-')
}

function ReadTime({ readTime, className }: { readTime: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 uppercase text-[#61615c]', className)}>
      <Clock className="size-3 shrink-0" strokeWidth={2} />
      <span>{readTime}</span>
    </span>
  )
}

export function BlogCard({ post, variant }: BlogCardProps) {
  const isFeatured = variant === 'featured'
  const categoryLabel = formatCategoryLabel(post.frontmatter.category)

  return (
    <Link
      href={`/blog/${post.slug}`}
      className={cn(
        'group block h-full transition-opacity duration-150 ease-out',
        isFeatured
          ? 'bg-transparent'
          : 'overflow-hidden border border-[#e5e7eb] bg-white hover:shadow-[0_0_0_1px_rgba(23,23,23,0.08),0_14px_40px_rgba(23,23,23,0.14)]'
      )}
    >
      {isFeatured ? (
        <div className="flex flex-col gap-4">
          <div className="flex h-6 items-center justify-between gap-4">
            <span className="bg-[#e8e2d6] px-2.5 py-1 text-xs font-semibold uppercase leading-4 tracking-[0.12em] text-[#6b6b66]">
              {categoryLabel}
            </span>
            <ReadTime readTime={post.frontmatter.readTime} className="text-xs font-medium leading-4" />
          </div>

          <h2 className="line-clamp-4 pt-5 font-[Georgia] text-[36px] leading-[44px] tracking-[-0.028em] text-[#111]">
            {post.frontmatter.seo?.h1 ?? post.frontmatter.title}
          </h2>

          <p className="line-clamp-3 text-base leading-[26px] text-[#6b6b66]">
            {post.frontmatter.description}
          </p>

          <div className="mt-8 flex h-6 items-center">
            <svg
              aria-hidden
              viewBox="0 0 20 20"
              width={20}
              height={20}
              fill="none"
              className="size-5 text-[#c4c4be] transition-colors duration-150 group-hover:text-[#171717]"
            >
              <path
                d="M5.83333 5.83333H14.1667V14.1667"
                stroke="currentColor"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5.83333 14.1667L14.1667 5.83333"
                stroke="currentColor"
                strokeWidth="1.66667"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        </div>
      ) : (
        <div className="flex h-[360px] flex-col justify-between p-6">
          <div className="pb-3">
            <span className="inline-flex bg-[#e8e2d6] px-2.5 py-1 text-[11px] font-semibold uppercase leading-4 tracking-[0.1em] text-[#6b6b66]">
              {categoryLabel}
            </span>
          </div>

          <h2 className="line-clamp-4 pb-3 font-[Georgia] text-[22px] leading-[30px] tracking-[-0.025em] text-[#171717]">
            {post.frontmatter.seo?.h1 ?? post.frontmatter.title}
          </h2>

          <p className="line-clamp-4 text-sm leading-5 text-[#6b6b66]">
            {post.frontmatter.description}
          </p>

          <div className="flex justify-end pt-2">
            <ReadTime readTime={post.frontmatter.readTime} className="text-xs leading-[18px]" />
          </div>
        </div>
      )}
    </Link>
  )
}
