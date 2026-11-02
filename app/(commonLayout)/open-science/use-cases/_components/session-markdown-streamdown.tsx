'use client'

import { cjk } from '@streamdown/cjk'
import { code } from '@streamdown/code'
import { createMathPlugin } from '@streamdown/math'
import { useEffect, useMemo, useState } from 'react'
import { type Components, defaultRehypePlugins, defaultRemarkPlugins, Streamdown } from 'streamdown'
import type { PluggableList, Plugin } from 'unified'
import { remarkMathjaxBlocks } from '@/lib/science-package/remark-mathjax-blocks'
import remarkMathjaxDelimiters from '@/lib/science-package/remark-mathjax-delimiters'
import { AssetImage } from './asset-image'
import { FileDownloadLink } from './file-download-link'
import { type PreviewFile, previewKindFor, useFilePreview } from './file-preview'
import 'katex/dist/katex.min.css'

// Static-mode Streamdown tuned like the app's AgentMarkdown: same plugins, controls, and
// prose tightening, minus streaming machinery, the link-safety modal, and session links.
const math = createMathPlugin({ singleDollarTextMath: true })
const basePlugins = { code, math, cjk }
const remarkPlugins: PluggableList = [
  ...Object.values(defaultRemarkPlugins),
  remarkMathjaxDelimiters,
  remarkMathjaxBlocks
]

// Keep Streamdown's HTML sanitization while allowing verified package resources.
const [sanitize, schema] = defaultRehypePlugins.sanitize as [
  Plugin,
  { protocols: Record<string, string[]>; attributes: Record<string, unknown[]> }
]
const rehypePlugins: PluggableList = [
  defaultRehypePlugins.raw,
  [
    sanitize,
    {
      ...schema,
      attributes: {
        ...schema.attributes,
        // Display formulas inside links/emphasis use phrasing code, not pre.
        code: schema.attributes.code.map((rule) =>
          Array.isArray(rule) && rule[0] === 'className' ? [...rule, 'math-display'] : rule
        )
      },
      protocols: {
        ...schema.protocols,
        href: [...schema.protocols.href, 'blob'],
        src: [...schema.protocols.src, 'blob']
      }
    }
  ],
  defaultRehypePlugins.harden
]

type MermaidPluginFactory = typeof import('@streamdown/mermaid')['createMermaidPlugin']

const controls = {
  table: {
    copy: true,
    download: true,
    fullscreen: true
  },
  code: {
    copy: true,
    download: true
  },
  mermaid: {
    copy: true,
    download: true,
    fullscreen: true,
    panZoom: false
  }
} as const

/** Real file name carried in an asset URL fragment, else the label/URL tail. */
const assetLinkFileName = (href: string, label: string): { name: string; url: string } => {
  const hashIndex = href.indexOf('#')
  const url = hashIndex === -1 ? href : href.slice(0, hashIndex)
  let fragmentName = ''
  if (hashIndex !== -1) {
    const raw = href.slice(hashIndex + 1)
    try {
      fragmentName = decodeURIComponent(raw)
    } catch {
      fragmentName = raw
    }
  }
  const urlName = url.split('/').pop() ?? ''
  return { name: fragmentName || label || urlName || href, url }
}

/**
 * Resolve an internal asset link to a preview target, or null when no in-site
 * preview exists for the type. The package parser appends `#<filename>` to
 * blob asset URLs (img/fetch ignore the fragment) so the real name survives
 * even when the link label has no extension; strip it before fetching.
 */
export const resolveAssetLinkTarget = (href: string, label: string): PreviewFile | null => {
  const { name, url } = assetLinkFileName(href, label)
  const urlName = url.split('/').pop() ?? ''
  if (previewKindFor(name)) return { name, url }
  if (urlName && urlName !== name && previewKindFor(urlName)) return { name: urlName, url }
  return null
}

const imageComponent: Components['img'] = ({ node: _node, ...props }) => <AssetImage {...props} />

const linkComponent: Components['a'] = ({ node: _node, href, children, ...props }) => {
  const openPreview = useFilePreview()
  // Intercept internal asset links only when a preview provider is mounted
  // (the transcript) and the type is previewable; otherwise fall through to a
  // plain link so the click still opens the file instead of dying on
  // preventDefault + "cannot preview".
  // Restored storage paths may end in "content"; the loader carries the filename in the fragment.
  const extracted = href && /^https?:\/\/[^/]+\/(?:[^?#]*\/)?extracted\/[^?#]+#/.test(href)
  if (
    href &&
    (href.startsWith('/use-cases/') || href.startsWith('blob:') || extracted) &&
    openPreview
  ) {
    const target = resolveAssetLinkTarget(href, typeof children === 'string' ? children : '')
    if (target) {
      return (
        <a
          {...props}
          href={href}
          onClick={(event) => {
            event.preventDefault()
            openPreview(target)
          }}
        >
          {children}
        </a>
      )
    }
  }
  if (href && (href.startsWith('blob:') || extracted)) {
    // A blob's served type is whatever the file really is — an svg would run
    // scripts if opened as a top-level document — so non-previewable package
    // links download instead of navigating. Remote objects also need a blob download
    // to preserve the original filename across origins.
    const { name } = assetLinkFileName(href, typeof children === 'string' ? children : '')
    return (
      <FileDownloadLink {...props} href={href} download={name}>
        {children}
      </FileDownloadLink>
    )
  }
  return (
    <a {...props} href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}

const SessionMarkdownStreamdown = ({ content }: { content: string }) => {
  // Mermaid is browser-only; every other plugin renders in the SSR HTML.
  const [createMermaidPlugin, setCreateMermaidPlugin] = useState<MermaidPluginFactory | null>(null)
  useEffect(() => {
    let cancelled = false
    void import('@streamdown/mermaid').then((module) => {
      if (!cancelled) setCreateMermaidPlugin(() => module.createMermaidPlugin)
    })
    return () => {
      cancelled = true
    }
  }, [])
  const plugins = useMemo(
    () =>
      createMermaidPlugin
        ? { ...basePlugins, mermaid: createMermaidPlugin({ config: { theme: 'default' } }) }
        : basePlugins,
    [createMermaidPlugin]
  )

  return (
    <div className="agent-markdown-root max-w-full min-w-0">
      <Streamdown
        className="agent-markdown prose prose-sm prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2"
        plugins={plugins}
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        controls={controls}
        components={{ a: linkComponent, img: imageComponent }}
        dir="auto"
        mode="static"
        isAnimating={false}
        animated={false}
        parseIncompleteMarkdown={false}
        shikiTheme={['github-light', 'github-light']}
        // Sanitization above preserves only the permitted URL protocols.
        urlTransform={(url) => url}
      >
        {content}
      </Streamdown>
    </div>
  )
}

export default SessionMarkdownStreamdown
