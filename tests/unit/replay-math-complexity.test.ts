import { expect, test } from 'bun:test'
import type { Effects, TokenizeContext } from 'micromark-util-types'
import originalMathjaxDelimiters from 'remark-mathjax-delimiters'
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import remarkMathjaxDelimiters from '../../lib/science-package/remark-mathjax-delimiters'

// Count tokenizer work rather than asserting wall time on differently loaded CI machines.
const parseWithWorkCount = (source: string) => {
  let consumed = 0
  const parser = unified()
    .use(remarkParse)
    .use(remarkMathjaxDelimiters)
    .use(function () {
      for (const extension of this.data().micromarkExtensions ?? []) {
        const constructs = extension.text?.[92]
        for (const construct of Array.isArray(constructs)
          ? constructs
          : constructs
            ? [constructs]
            : []) {
          const tokenize = construct.tokenize
          construct.tokenize = function (this: TokenizeContext, effects, ok, nok) {
            const counted: Effects = {
              ...effects,
              consume(code) {
                consumed++
                effects.consume(code)
              }
            }
            return tokenize.call(this, counted, ok, nok)
          }
        }
      }
    })
  return { tree: parser.parse(source), consumed: () => consumed }
}

for (const opening of [String.raw`\(`, String.raw`\[`, String.raw`\( \[`]) {
  test(`unclosed ${opening} scans at most a constant multiple of the paragraph`, () => {
    const source = `${opening}x `.repeat(1000)
    const { tree, consumed } = parseWithWorkCount(source)
    expect(tree).toEqual(unified().use(remarkParse).parse(source))
    expect(consumed()).toBeLessThan(source.length * 8)
  })
}

test('failed scans preserve plugin semantics across nested markup, paragraphs and documents', () => {
  const reference = unified().use(remarkParse).use(originalMathjaxDelimiters)
  const bounded = unified().use(remarkParse).use(remarkMathjaxDelimiters)
  const cases = [
    String.raw`\(missing \(again`,
    String.raw`\(x\)`,
    String.raw`\[missing \(x\)`,
    String.raw`\(missing \[x\]`,
    String.raw`[before \(missing](https://example.com) and \(x\)`,
    String.raw`*before \[missing* and \[x\]`,
    String.raw`\(missing \\(escaped) \\\(x\)`,
    '\\(missing\n\n\\(x\\)\n\n`\\(code\\)`',
    '> \\(missing\n\n- \\[missing\n- \\[x\\]',
    String.raw`| Bad | Good |
| - | - |
| \(missing | \(x\) |`,
    String.raw`[\[x\]][ref]

[ref]: https://example.com`,
    '```tex\n\\(missing\n```\n\n\\[y\\]'
  ]
  for (const source of cases) expect(bounded.parse(source)).toEqual(reference.parse(source))
})
