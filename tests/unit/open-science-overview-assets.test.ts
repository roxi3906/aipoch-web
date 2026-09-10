import { expect, test } from 'bun:test'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const overviewDir = join(import.meta.dir, '../../public/open-science')
const overviewPath = join(overviewDir, 'overview.html')

test('shares extracted image assets between the bilingual overview documents', async () => {
  const overview = await readFile(overviewPath, 'utf8')
  const assets = [...new Set(overview.match(/\/open-science\/assets\/[\w.-]+/g))]

  expect(overview).not.toContain('data:image/')
  expect(assets.length).toBeGreaterThan(0)
  for (const asset of assets) {
    expect((await stat(join(overviewDir, '..', asset))).size).toBeGreaterThan(0)
  }
})

test('keeps bilingual Open-Science branding hyphenated on one line', async () => {
  const overview = await readFile(overviewPath, 'utf8')
  const highlightedBrand = String.raw`<span class=\"highlight-text en\">Open-Science</span>`

  expect(overview.split(highlightedBrand)).toHaveLength(3)
  expect(overview.split('<strong>Open-Science</strong>')).toHaveLength(3)
  expect(overview).not.toMatch(/Open(?:<\/span>)?<br>Science/)
})
