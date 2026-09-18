'use client'

import { List } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TocItem {
  value: string
  href: string
  depth: number
}

interface TableOfContentsProps {
  toc: TocItem[]
  className?: string
  variant?: 'default' | 'blog'
}

export function TableOfContents({ toc, className, variant = 'default' }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('')
  const isBlogVariant = variant === 'blog'

  const filteredToc = toc.filter((item) => item.depth <= 2)

  useEffect(() => {
    if (filteredToc.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter((entry) => entry.isIntersecting)
        if (visibleEntries.length > 0) {
          const topEntry = visibleEntries.sort(
            (a, b) => a.boundingClientRect.top - b.boundingClientRect.top
          )[0]
          setActiveId(topEntry.target.id)
        }
      },
      {
        rootMargin: '-80px 0px -70% 0px',
        threshold: 0
      }
    )

    filteredToc.forEach((item) => {
      const id = item.href.startsWith('#') ? item.href.slice(1) : item.href
      const element = id ? document.getElementById(id) : null
      if (element) {
        observer.observe(element)
      }
    })

    return () => observer.disconnect()
  }, [filteredToc])

  if (filteredToc.length === 0) return null

  return (
    <nav aria-label="On this page" className={cn(className)}>
      <div
        className={cn(
          isBlogVariant
            ? 'pb-4'
            : 'mb-4 flex h-8 items-center gap-2 text-xs font-medium uppercase tracking-wider text-amber-600'
        )}
      >
        {!isBlogVariant && <List className="size-4" />}
        <span
          className={cn(
            isBlogVariant &&
              'text-xs font-semibold uppercase leading-4 tracking-[1.2px] text-[#6b6b66]'
          )}
        >
          On This Page
        </span>
      </div>
      <ul className={cn(isBlogVariant ? 'flex flex-col gap-1.5' : 'space-y-2')}>
        {filteredToc.map((item) => {
          const isActive = activeId === item.href.slice(1)
          if (isBlogVariant) {
            return (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={cn(
                    'relative -ml-3 block py-1 pl-3 font-[Georgia] text-sm leading-5 text-[#2e2e2b] transition-colors',
                    'hover:bg-[#f5f0e7]',
                    isActive &&
                      'bg-[#f5f0e7] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[#d08d23]'
                  )}
                >
                  {item.value}
                </a>
              </li>
            )
          }

          return (
            <li
              key={item.href}
              className={cn(
                'text-sm transition-colors',
                item.depth === 1 && 'font-medium',
                item.depth === 2 && 'pl-4',
                isActive
                  ? 'text-amber-600'
                  : item.depth === 1
                    ? 'text-gray-900'
                    : 'text-gray-600'
              )}
            >
              <a href={item.href} className="block py-1 transition-colors hover:text-amber-600">
                {item.value}
              </a>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
