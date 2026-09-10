import { expect, test } from 'bun:test'
import { readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'

const publicDir = join(import.meta.dir, '../../public')

test('serves a hyphenated bilingual corporate deck with extracted image assets', async () => {
  const html = await readFile(join(publicDir, 'open-science/overview-corporate.html'), 'utf8')
  expect(html).not.toMatch(/open\s*science/i)
  expect(html).not.toMatch(/Open(?:<\/span>)?<br>Science/)
  expect(html).toContain('Open-Science')
  expect(html).toContain('OPEN-SCIENCE')
  expect(html).not.toContain('data:image/')
  expect(html).toContain('id="deck-zh"')
  expect(html).toContain('id="deck-en"')
  const assets = [...new Set(html.match(/\/open-science\/assets\/[\w.-]+/g))]
  expect(assets.length).toBeGreaterThan(0)
  for (const asset of assets) {
    expect((await stat(join(publicDir, asset))).size).toBeGreaterThan(0)
  }
})

test('highlights both lines of the corporate hero in both languages', async () => {
  const html = await readFile(join(publicDir, 'open-science/overview-corporate.html'), 'utf8')
  const secondLine = String.raw`<br><span class=\"highlight-text\">Science</span></h1>`
  expect(html.split(secondLine)).toHaveLength(3)
})
