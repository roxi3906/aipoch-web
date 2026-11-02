import type { Construct, TokenizeContext } from 'micromark-util-types'
import { mathjaxDelimiters, mathjaxDelimitersFromMarkdown } from 'remark-mathjax-delimiters'
import type { Plugin } from 'unified'

// A failed scan to paragraph EOF proves that later openings of the same kind
// cannot close either. Cache only that interval, separately for each text context.
const cacheUnclosed = (construct: Construct): Construct => {
  const failed = new WeakMap<TokenizeContext, { from: number; to: number }>()
  return {
    ...construct,
    tokenize(effects, ok, nok) {
      const from = this.now().offset
      const previous = failed.get(this)
      if (previous && from >= previous.from && from < previous.to) return nok
      return construct.tokenize.call(this, effects, ok, (code) => {
        if (code === null) failed.set(this, { from, to: this.now().offset })
        return nok(code)
      })
    }
  }
}

// Reuse the pinned plugin's syntax and AST compiler through its public exports.
// Each processor gets fresh constructs: failed inline/display scans never cross documents.
const remarkMathjaxDelimiters: Plugin = function () {
  const extension = mathjaxDelimiters()
  const constructs = extension.text?.[92]
  if (extension.text && constructs) {
    extension.text[92] = (Array.isArray(constructs) ? constructs : [constructs]).map(cacheUnclosed)
  }
  const data = this.data()
  data.micromarkExtensions ??= []
  data.fromMarkdownExtensions ??= []
  data.micromarkExtensions.push(extension)
  data.fromMarkdownExtensions.push(mathjaxDelimitersFromMarkdown())
}

export default remarkMathjaxDelimiters
