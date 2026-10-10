import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { expect as browserExpect, chromium, devices } from '@playwright/test'
import manifestSample from '../../mocks/fixtures/use-case-manifest.json'
import {
  verifyPreviewSwitching,
  verifyReplayCoverage,
  verifyReplayDownload,
  verifyReplayLoading,
  verifySlowPdfPreview
} from './use-case-replay-browser'

const reviewArtifacts = join(process.cwd(), '.codex/ui-review-2026-09-21')

// Exercise the real launcher and browser/SSR consumers with ephemeral loopback ports.
const availablePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port allocated')
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  )
  return address.port
}
// Next development embeds server console logs in scripts; inspect rendered markup separately.
const renderedHtml = async (response: Response) =>
  new HTMLRewriter()
    .on('script', {
      element: (element) => {
        element.remove()
      }
    })
    .transform(response)
    .text()

let launcher: ReturnType<typeof Bun.spawn>
let web: string
let api: string
const waitFor = async (url: string) => {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launcher.exitCode !== null) throw new Error('Mock launcher exited before becoming ready')
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return
    } catch {
      /* Retry while Next compiles. */
    }
    await Bun.sleep(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}
beforeAll(async () => {
  mkdirSync(reviewArtifacts, { recursive: true })
  const port = await availablePort()
  let mockPort = await availablePort()
  while (mockPort === port) mockPort = await availablePort()
  web = `http://127.0.0.1:${port}`
  api = `http://127.0.0.1:${mockPort}`
  launcher = Bun.spawn(
    [
      process.execPath,
      'run',
      'scripts/dev-mock.ts',
      '--port',
      String(port),
      '--mock-port',
      String(mockPort)
    ],
    { stdout: 'inherit', stderr: 'inherit' }
  )
  await waitFor(`${api}/health`)
  await waitFor(`${web}/agent-skills/list`)
}, 120000)
afterAll(async () => {
  if (launcher?.exitCode === null) {
    launcher.kill('SIGTERM')
    await launcher.exited
  }
}, 15000)

describe('mock development end to end', () => {
  test('server-renders both GitHub counts and loads independent browser-intercepted results', async () => {
    const html = await renderedHtml(await fetch(web))
    expect(html.match(/aria-label="Open-Science on GitHub, 3\.5K stars"/g)).toHaveLength(1)
    expect(html).toContain('aria-label="Medical Research Skills on GitHub, 1.9K stars"')
    expect(html).toContain('data-testid="ecosystem-github-stars"')

    const browser = await chromium.launch()
    try {
      for (const device of ['desktop', 'mobile']) {
        const context = await browser.newContext(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        const githubResponses: Record<string, boolean[]> = {
          'open-science': [],
          'medical-research-skills': []
        }
        page.on('response', (response) => {
          for (const repository of Object.keys(githubResponses)) {
            if (response.url().startsWith(`https://api.github.com/repos/aipoch/${repository}?`)) {
              githubResponses[repository].push(response.fromServiceWorker())
            }
          }
        })
        await page.goto(web)
        await browserExpect(page.getByTestId('home-github-stars')).toHaveText('1.2K')
        await browserExpect(page.getByTestId('ecosystem-github-stars')).toHaveText('9.9K')
        expect(githubResponses).toEqual({
          'open-science': [true],
          'medical-research-skills': [true]
        })
        await page.reload()
        await browserExpect(page.getByTestId('home-github-stars')).toHaveText('1.2K')
        await browserExpect(page.getByTestId('ecosystem-github-stars')).toHaveText('9.9K')
        expect(githubResponses).toEqual({
          'open-science': [true, true],
          'medical-research-skills': [true, true]
        })
        expect(errors).toEqual([])
        await context.close()
      }
    } finally {
      await browser.close()
    }
  }, 60000)

  test('serves cached manifest data before conditional refresh and retains it through failures', async () => {
    const pageUrl = `${web}/open-science/use-cases`
    const controlUrl = `${api}/__mock/use-case-manifest`
    const stats = async () => (await fetch(controlUrl)).json()
    const update = async (value: object) => {
      expect((await fetch(controlUrl, { method: 'PUT', body: JSON.stringify(value) })).status).toBe(
        200
      )
    }
    const eventually = async (check: () => Promise<boolean>) => {
      for (let i = 0; i < 60; i++) {
        if (await check()) return
        await Bun.sleep(100)
      }
      throw new Error('Manifest background refresh did not complete')
    }
    const first = await fetch(pageUrl)
    expect(first.status).toBe(200)
    const html = await renderedHtml(first)
    expect(html).toContain(manifestSample[0].title)
    expect(html).toContain('Can%20a%20Simple%20Algorithm')
    expect(html).not.toContain(manifestSample[0].cover.sha256)
    expect(html).not.toContain(manifestSample[6].title)
    expect(html).toContain('/can-a-simple-algorithm-beat-ai-at-wordle/Can%20a%20Simple')
    await (await fetch(pageUrl)).text()
    await eventually(async () => (await stats()).notModified > 0)
    expect((await stats()).lastValidator).toMatch(/^"use-case-manifest-/)

    // The response uses its old snapshot even when S3 needs time to return a new body.
    await update({ titleSuffix: ' Updated', delayMs: 1000 })
    const stale = await renderedHtml(await fetch(pageUrl))
    expect(stale).not.toContain(`${manifestSample[0].title} Updated`)
    await eventually(async () =>
      (await renderedHtml(await fetch(pageUrl))).includes(`${manifestSample[0].title} Updated`)
    )

    // HTTP and HTTP-200 JSON failures must both preserve the SSR snapshot.
    for (const mode of ['error', 'invalid']) {
      await update({ mode })
      const beforeFailure = (await stats()).requests
      await (await fetch(pageUrl)).text()
      await eventually(async () => (await stats()).requests > beforeFailure)
      expect(await renderedHtml(await fetch(pageUrl))).toContain(
        `${manifestSample[0].title} Updated`
      )
    }

    await update({ mode: 'empty' })
    await eventually(async () =>
      (await renderedHtml(await fetch(pageUrl))).includes('No published use cases yet.')
    )
    await update({})
    await eventually(async () =>
      (await renderedHtml(await fetch(pageUrl))).includes(manifestSample[0].title)
    )
  }, 120000)

  test('manifest covers, pagination and introductions work without client JavaScript', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ javaScriptEnabled: false })
      const page = await context.newPage()
      await page.goto(`${web}/open-science/use-cases`)
      await page.getByRole('heading', { name: manifestSample[0].title, exact: true }).waitFor()
      expect(await page.locator('main img').count()).toBe(6)
      expect(
        await page
          .locator('main img')
          .first()
          .evaluate((image) => (image as HTMLImageElement).naturalWidth)
      ).toBeGreaterThan(0)
      await page.getByRole('link', { name: 'Next', exact: true }).click()
      expect(await page.locator('main img').count()).toBe(3)
      await page.goto(`${web}/open-science/use-cases/${manifestSample[0].name}`)
      await page.getByText('Local sample introduction.', { exact: true }).waitFor()
      // Shared typography must apply during SSR, even without client JavaScript.
      const introduction = page.locator('main .markdown-body')
      expect(await introduction.count()).toBe(1)
      const [headingSize, paragraphSize] = await Promise.all(
        ['h1', 'p'].map((selector) =>
          introduction
            .locator(selector)
            .first()
            .evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
        )
      )
      expect(headingSize).toBeGreaterThan(paragraphSize)
      expect(await page.locator('meta[name="description"]').getAttribute('content')).toContain(
        'Read-only replay of the Open-Science session'
      )
      const download = page.getByRole('link', { name: 'Download research package' })
      expect(await download.count()).toBe(2)
      const downloadUrl = await download.first().getAttribute('href')
      expect(await download.last().getAttribute('href')).toBe(downloadUrl)
      expect(downloadUrl).toBe(
        `${api}/use-case-manifest/can-a-simple-algorithm-beat-ai-at-wordle/Can%20a%20Simple%20Algorithm%20Beat%20AI%20at%20Wordle.science`
      )
      if (!downloadUrl) throw new Error('Missing research package URL')
      expect((await fetch(downloadUrl)).status).toBe(200)
      expect(
        await page
          .getByRole('link', { name: 'View the research session' })
          .last()
          .getAttribute('href')
      ).toBe(`/open-science/use-cases/${manifestSample[0].name}/replay`)
      expect(await page.locator('main').innerText()).not.toContain('1970')
      // Shared "AI" keywords promote the later data-center case before the first fallback.
      const related = page.locator('main section').filter({
        has: page.getByRole('heading', { name: 'Related research', exact: true })
      })
      expect(await related.locator('h3').allTextContents()).toEqual([
        'Can AI Spot the Errors in a Spreadsheet',
        'How Many Homes Could AI Data Centers Power',
        'Can GLP-1 Drugs Really Help Us Live Longer'
      ])
      expect(
        await related
          .locator('a[href*="/use-cases/"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
      ).toEqual([
        '/open-science/use-cases/can-ai-spot-the-errors-in-a-spreadsheet',
        '/open-science/use-cases/how-many-homes-could-ai-data-centers-power',
        '/open-science/use-cases/can-glp-1-drugs-really-help-us-live-longer'
      ])
      await page.goto(`${web}/open-science/use-cases/${manifestSample[3].name}`)
      expect(
        await page.getByRole('heading', { name: manifestSample[3].title, exact: true }).count()
      ).toBe(1)
      expect(await page.getByRole('link', { name: 'Download research package' }).count()).toBe(2)
      const sitemap = (await (await fetch(`${web}/sitemap.xml`)).text()).replace(/>\s+</g, '><')
      for (const item of manifestSample) {
        expect(sitemap).toContain(
          `/open-science/use-cases/${item.name}</loc><lastmod>2026-10-09T00:00:00.000Z</lastmod>`
        )
        expect(sitemap).toContain(
          `/open-science/use-cases/${item.name}/replay</loc><lastmod>2026-10-10T00:00:00.000Z</lastmod>`
        )
        const detailHtml = await (await fetch(`${web}/open-science/use-cases/${item.name}`)).text()
        expect(detailHtml).toContain(`href="/open-science/use-cases/${item.name}/replay"`)
        expect(detailHtml).toContain('View the research session')
      }
    } finally {
      await browser.close()
    }
  }, 120000)

  test('replay loads extracted metadata without the archive and retries failures', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      const item = manifestSample[1]
      // The replay page supplies package metadata without a separate endpoint.
      expect(
        (await fetch(`${web}/open-science/use-cases/no-such-case/replay/dot-science`)).status
      ).toBe(404)
      const requests: string[] = []
      context.on('request', (request) => {
        if (!request.serviceWorker()) requests.push(request.url())
      })
      await page.addInitScript(() => {
        const observed: string[] = []
        Object.assign(window, { replayStates: observed })
        new MutationObserver(() => {
          const text = document.querySelector('[role="status"]')?.textContent
          if (text && observed.at(-1) !== text) observed.push(text)
        }).observe(document, { subtree: true, childList: true, characterData: true })
      })
      await page.goto(`${web}/open-science/use-cases/${item.name}`)
      const manifest = await (await fetch(`${api}/use-case-manifest/manifest.json`)).json()
      const resource = manifest.find((entry: { name: string }) => entry.name === item.name).case
      const info = {
        url: `${api}/use-case-manifest/${item.name}/${encodeURIComponent(resource.file_name)}`,
        filename: resource.file_name,
        sha256: resource.sha256,
        sizeBytes: resource.bytes
      }
      const replayHtml = await (
        await fetch(`${web}/open-science/use-cases/${item.name}/replay`)
      ).text()
      expect(replayHtml).toContain(info.sha256)
      expect(replayHtml).toContain(encodeURIComponent(info.filename))
      expect(replayHtml).not.toContain(`Local sample replay for ${item.title}.`)
      await page
        .getByRole('link', { name: 'View the research session', exact: true })
        .first()
        .click()
      expect(info.filename).toBe(item.case.file_name)
      expect(info.sha256).toMatch(/^[a-f0-9]{64}$/)
      await page.getByText(`Local sample replay for ${item.title}.`, { exact: true }).waitFor()
      expect(await page.title()).toBe(`Replay: ${item.title} | Open-Science Use Cases`)
      const packageRequests = () => requests.filter((url) => url === info.url).length
      expect(packageRequests()).toBe(0)
      expect(requests).toContain(`${api}/use-case-manifest/${item.name}/extracted/session.json`)
      expect(
        await page.getByRole('button', { name: /View full version|Back to essential/ }).count()
      ).toBe(0)
      expect(await page.getByText('Full only', { exact: true }).count()).toBe(0)
      expect(requests.some((url) => url.includes('/api/v1/open-science/use-cases'))).toBe(false)
      expect(requests.some((url) => url.includes('/replay/dot-science'))).toBe(false)
      const states = await page.evaluate(
        () => (window as typeof window & { replayStates: string[] }).replayStates
      )
      expect(states).toContain('Parsing research session…')
      expect(requests.some((url) => /\/extracted\/(manifest|records)\.json$/.test(url))).toBe(false)
      // Retry after the extracted session fails schema validation.
      const sessionUrl = `${api}/use-case-manifest/${item.name}/extracted/session.json`
      await context.route(sessionUrl, (route) =>
        route.fulfill({
          body: JSON.stringify({ version: 2, session: { messages: [] } }),
          contentType: 'application/octet-stream'
        })
      )
      await page.reload()
      await page.getByRole('alert').filter({ hasText: 'invalid session.json' }).waitFor()
      await context.unroute(sessionUrl)
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await page.getByText(`Local sample replay for ${item.title}.`, { exact: true }).waitFor()
      // Older publications still use the verified archive, including its error and retry path.
      await context.route(sessionUrl, (route) => route.fulfill({ status: 404, body: '' }))
      await page.reload()
      await page.getByText(`Local sample replay for ${item.title}.`, { exact: true }).waitFor()
      expect(packageRequests()).toBe(1)
      await context.route(info.url, (route) =>
        route.fulfill({ body: Buffer.alloc(info.sizeBytes) })
      )
      await page.reload()
      await page.getByRole('alert').filter({ hasText: 'SHA-256 verification failed' }).waitFor()
      await context.unroute(info.url)
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await page.getByText(`Local sample replay for ${item.title}.`, { exact: true }).waitFor()
      await context.unroute(sessionUrl)
      await page.goto(`${web}/open-science/use-cases/no-such-case/replay`)
      await page.getByRole('alert').filter({ hasText: 'Research package not found.' }).waitFor()
      expect(await page.getByRole('link', { name: 'Download research package' }).count()).toBe(0)
      expect(await page.getByRole('button', { name: 'Retry', exact: true }).count()).toBe(1)
    } finally {
      await browser.close()
    }
  }, 120000)

  test('retry refreshes server package information when the cached case becomes available', async () => {
    const controlUrl = `${api}/__mock/use-case-manifest`
    const update = (mode: string) =>
      fetch(controlUrl, { method: 'PUT', body: JSON.stringify({ mode }) })
    const waitForCatalog = async (text: string) => {
      for (let attempt = 0; attempt < 60; attempt++) {
        if ((await renderedHtml(await fetch(`${web}/open-science/use-cases`))).includes(text))
          return
        await Bun.sleep(100)
      }
      throw new Error('Manifest refresh did not finish')
    }
    const browser = await chromium.launch()
    try {
      await update('empty')
      await waitForCatalog('No published use cases yet.')
      const page = await browser.newPage()
      const item = manifestSample[1]
      const requests: string[] = []
      page.on('request', (request) => requests.push(request.url()))
      await page.goto(`${web}/open-science/use-cases/${item.name}/replay`)
      await page.getByRole('alert').filter({ hasText: 'Research package not found.' }).waitFor()
      await update('normal')
      await waitForCatalog(manifestSample[0].title)
      await page.getByRole('button', { name: 'Retry', exact: true }).click()
      await page.getByText(`Local sample replay for ${item.title}.`, { exact: true }).waitFor()
      expect(requests.some((url) => url.includes('/replay/dot-science'))).toBe(false)
    } finally {
      await update('normal')
      await browser.close()
    }
  }, 120000)

  for (const mobile of [false, true]) {
    for (const [name, verify] of [
      ['renderer coverage', verifyReplayCoverage],
      ['preview switching', verifyPreviewSwitching],
      ['slow PDF preview', verifySlowPdfPreview],
      ['package download', verifyReplayDownload],
      ['loading and retry', verifyReplayLoading]
    ] as const) {
      test(`${mobile ? 'mobile' : 'desktop'}: replay ${name} uses server-provided package information`, async () => {
        // The full Chromium headless mode supports PDF tabs; headless-shell does not.
        const browser = await chromium.launch(
          name === 'slow PDF preview' ? { channel: 'chromium' } : {}
        )
        try {
          const context = await browser.newContext(mobile ? devices['Pixel 5'] : {})
          const page = await context.newPage()
          await verify(page, `${web}/open-science/use-cases/${manifestSample[0].name}/replay`)
        } finally {
          await browser.close()
        }
      }, 120000)
    }
  }

  test('renders server data, linked details and sitemap without a business backend', async () => {
    // The state adapter intentionally cannot serve read-only business fixtures.
    expect((await fetch(`${api}/api/v1/skills`)).status).toBe(404)
    for (const [path, content] of [
      ['/', 'Local mock release'],
      ['/agent-skills/literature-review', 'Literature Review'],
      ['/blog/release-notes', 'Local research notes'],
      ['/leaderboard', 'Literature Review'],
      ['/leaderboard/daily', 'Literature Review'],
      ['/leaderboard/items/literature-review-result', 'literature-review'],
      ['/compare/literature-review-vs-clinical-trials', 'Literature Review'],
      ['/open-science/download', '1.0.0-mock']
    ]) {
      const response = await fetch(`${web}${path}`)
      expect(response.status).toBe(200)
      const html = await response.text()
      expect(html).toContain(content)
      if (path === '/agent-skills/literature-review') {
        const schemas = [
          ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>(.*?)<\/script>/g)
        ].flatMap((match) => JSON.parse(match[1]))
        expect(schemas.find((schema) => schema['@type'] === 'WebPage')).toMatchObject({
          dateModified: '2026-10-09'
        })
        expect(schemas.find((schema) => schema['@type'] === 'SoftwareApplication')).toMatchObject({
          dateModified: '2026-09-01T00:00:00.000Z',
          datePublished: '2026-09-01T00:00:00.000Z'
        })
      }
    }
    expect((await fetch(`${web}/community/posts/1`)).status).toBe(404)
    const sitemap = await (await fetch(`${web}/sitemap.xml`)).text()
    expect(sitemap).toContain('/agent-skills/literature-review</loc>')
    for (const [path, date] of [
      ['', '2026-10-09'],
      ['/agent-skills/list', '2026-10-09'],
      ['/agent-skills/literature-review', '2026-10-09'],
      ['/blog', '2026-10-09'],
      ['/blog/release-notes', '2026-10-09']
    ]) {
      expect(sitemap).toContain(
        `<loc>https://aipoch.com${path}</loc>\n<lastmod>${date}T00:00:00.000Z</lastmod>`
      )
    }
    expect(sitemap).toContain(
      '<loc>https://aipoch.com/open-science/download</loc>\n<lastmod>2026-10-09T00:00:00.000Z</lastmod>'
    )
    expect(sitemap).not.toContain('/leaderboard')
    expect(sitemap).not.toContain('/claim/')
    expect(sitemap).not.toContain('/open-science/overview</loc>')
  }, 120000)

  test('mobile navigation renders manifest cards without downloading the manifest in the browser', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext(devices['Pixel 5'])
      const page = await context.newPage()
      const requests: string[] = []
      page.on('request', (request) => requests.push(request.url()))
      await page.goto(`${web}/open-science/use-cases`)
      await page.getByRole('heading', { name: manifestSample[0].title, exact: true }).waitFor()
      await page.getByRole('link', { name: 'Next', exact: true }).click()
      await page.waitForURL('**/open-science/use-cases?page=2')
      await page.getByRole('heading', { name: manifestSample[6].title, exact: true }).waitFor()
      expect(await page.locator('main img').count()).toBe(3)
      expect(
        await page.getByRole('heading', { name: manifestSample[0].title, exact: true }).count()
      ).toBe(0)
      await page.goBack()
      await page.getByRole('heading', { name: manifestSample[0].title, exact: true }).waitFor()
      expect(await page.locator('main img').count()).toBe(6)
      await page.goForward()
      await page.getByRole('heading', { name: manifestSample[6].title, exact: true }).waitFor()
      expect(await page.locator('main img').count()).toBe(3)
      expect(requests.some((url) => url.includes('/use-case-manifest/manifest.json'))).toBe(false)
    } finally {
      await browser.close()
    }
  }, 60000)

  test('blog layout keeps the reading time with the heading and the desktop contents pinned', async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(`${web}/blog/release-notes`)
      const toc = page.getByRole('navigation', { name: 'On this page', exact: true })
      await toc.waitFor()
      const header = page.locator('article header')
      expect(await header.innerText()).toContain('MIN READ')
      await browserExpect(header.locator('time')).toHaveText('Sep 1, 2026')
      const metadata = header.locator('time').locator('../..')
      expect(await metadata.innerText()).toMatch(/Sep 1, 2026[\s\S]+3 MIN READ/)
      const contentGap = await page
        .locator('.blog-article-body .markdown-body > :first-child')
        .evaluate((element) => {
          const time = document.querySelector('article header time')
          if (!time) throw new Error('Publication date missing')
          return element.getBoundingClientRect().top - time.getBoundingClientRect().bottom
        })
      expect(contentGap).toBeGreaterThanOrEqual(24)
      expect(contentGap).toBeLessThanOrEqual(40)
      expect(await page.locator('aside').innerText()).not.toContain('AIPOCH')
      const rejectCookies = page.getByRole('button', { name: 'Reject Non-Essential' })
      if (await rejectCookies.isVisible()) await rejectCookies.click()
      await page.screenshot({ path: join(reviewArtifacts, 'blog-article.png') })
      const before = await toc.boundingBox()
      const heading = await header.boundingBox()
      if (!before || !heading) throw new Error('Blog heading or contents missing')
      expect(before.y).toBeLessThan(heading.y + 50)
      await page.evaluate(() => window.scrollTo(0, 650))
      await page.waitForTimeout(200)
      const pinned = await toc.boundingBox()
      if (!pinned) throw new Error('Sticky contents missing')
      expect(pinned.y).toBeGreaterThanOrEqual(70)
      expect(pinned.y).toBeLessThan(160)
      await page.screenshot({ path: join(reviewArtifacts, 'blog-article-scrolled.png') })
      await toc.getByRole('link', { name: 'Data validation', exact: true }).click()
      await page.waitForURL(/#heading-data-validation$/)
      expect(await page.locator('#heading-data-validation').isVisible()).toBe(true)
      await page.setViewportSize({ width: 390, height: 844 })
      await page.evaluate(() => window.scrollTo(0, 0))
      expect(await toc.isVisible()).toBe(false)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true
      )
    } finally {
      await browser.close()
    }
  }, 60000)

  test('centers the blog artwork below the introduction', async () => {
    const browser = await chromium.launch()
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
      await page.goto(`${web}/blog`)
      const cards = page.locator('main a[href^="/blog/"]')
      await browserExpect(cards).toHaveCount(10)
      await browserExpect(cards.locator('time')).toHaveCount(10)
      for (const date of await cards.locator('time').allTextContents())
        expect(date).toBe('Sep 1, 2026')
      expect((await cards.allInnerTexts()).join(' ')).not.toContain('MIN READ')
      const intro = page.getByText('Explore AIPOCH Open-Science product updates', { exact: false })
      const illustration = page.locator('img[src*="blog-hero-background"]')
      await illustration.waitFor()
      const textBox = await intro.boundingBox()
      const imageBox = await illustration.boundingBox()
      if (!textBox || !imageBox) throw new Error('Blog introduction or artwork missing')
      expect(
        Math.abs(textBox.x + textBox.width / 2 - imageBox.x - imageBox.width / 2)
      ).toBeLessThan(2)
      expect(imageBox.y).toBeGreaterThanOrEqual(textBox.y + textBox.height)
      const rejectCookies = page.getByRole('button', { name: 'Reject Non-Essential' })
      if (await rejectCookies.isVisible()) await rejectCookies.click()
      await page.screenshot({ path: join(reviewArtifacts, 'blog-list.png') })
    } finally {
      await browser.close()
    }
  }, 60000)

  test('homepage preserves API downloads, autoplay, workflow controls and installer actions', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      await context.grantPermissions(['clipboard-read', 'clipboard-write'])
      const page = await context.newPage()
      const manifestResponse = page.waitForResponse((response) =>
        response.url().includes('/open-science/app/stable/version.json')
      )
      await page.goto(web)
      expect((await manifestResponse).fromServiceWorker()).toBe(true)
      await page.getByRole('button', { name: 'Download macOS', exact: true }).click()
      const menu = page.locator('#home-macos-downloads')
      await menu.waitFor()
      await browserExpect(menu.getByRole('link', { name: /Apple Silicon/ })).toHaveAttribute(
        'href',
        /mac-arm64/
      )
      await browserExpect(menu.getByRole('link', { name: /Intel/ })).toHaveAttribute(
        'href',
        /mac-x64/
      )
      await page.keyboard.press('Escape')
      const workbench = page.locator('#open-science')
      await workbench.getByRole('button', { name: 'Execute', exact: true }).click()
      await browserExpect(
        workbench.getByRole('button', { name: 'Execute', exact: true })
      ).toHaveAttribute('aria-expanded', 'true')
      await browserExpect(page.getByTestId('workflow-preview').getByRole('img')).toHaveAttribute(
        'src',
        '/figma/landing/workflow-execute.png'
      )
      await browserExpect(page.getByTestId('skills-count')).toHaveText('30')
      expect(await page.locator('video').getAttribute('src')).toContain('.mp4')
      expect(await page.locator('video').getAttribute('preload')).toBe('metadata')
      for (const width of [1440, 768, 390]) {
        await page.setViewportSize({ width, height: 900 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
      }
    } finally {
      await browser.close()
    }
  }, 90000)

  test('SSR content remains visible with JavaScript disabled', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext({ javaScriptEnabled: false })
      const page = await context.newPage()
      await page.goto(`${web}/agent-skills/literature-review`)
      await page.getByRole('heading', { name: 'Literature Review', exact: true }).first().waitFor()
      expect(await page.locator('body').innerText()).toContain('Local demo workflow')
    } finally {
      await browser.close()
    }
  }, 60000)

  test('client navigation stays mocked and claim state survives reload', async () => {
    const browser = await chromium.launch()
    try {
      const context = await browser.newContext()
      const page = await context.newPage()
      await page.goto(`${web}/agent-skills/list`)
      const link = page.locator('a[href="/agent-skills/literature-review"]').first()
      await link.waitFor()
      await link.click()
      await page.waitForURL(`${web}/agent-skills/literature-review`)
      await page.getByRole('heading', { name: 'Literature Review', exact: true }).first().waitFor()
      await page.goto(`${web}/claim/demo-claim`)
      await page.getByRole('button', { name: /I've posted the tweet/ }).click()
      await page
        .getByPlaceholder('https://x.com/you/status/1234567890...')
        .fill('https://x.com/demo/status/123')
      await page.getByRole('button', { name: /Verify & Claim/ }).click()
      await page.getByRole('heading', { name: 'Claimed!', exact: true }).waitFor()
      await page.reload()
      await page.getByRole('heading', { name: 'Already Claimed', exact: true }).waitFor()
      expect(
        (await (await fetch(`${api}/api/v1/agent/claim?token=demo-claim`)).json()).data.agent
          .is_claimed
      ).toBe(true)
    } finally {
      await browser.close()
    }
  }, 90000)

  for (const device of ['desktop', 'mobile']) {
    test(`${device}: searches skills and submits a waitlist entry through the mock HTTP API`, async () => {
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1280, height: 900 } }
        )
        const page = await context.newPage()
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(`${web}/agent-skills/list`)
        const cards = page.locator('main a[href^="/agent-skills/"]')
        await browserExpect(cards).toHaveCount(9)
        const rejectCookies = page.getByRole('button', { name: 'Reject Non-Essential' })
        if (await rejectCookies.isVisible()) await rejectCookies.click()
        await page.screenshot({ path: join(reviewArtifacts, `skills-list-${device}.png`) })
        await cards.last().scrollIntoViewIfNeeded()
        await browserExpect.poll(() => cards.count()).toBeGreaterThanOrEqual(18)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        await page.getByPlaceholder('Search skills...').fill('Clinical Trials')
        const searchResponse = await page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/skills?') &&
            response.url().includes('Clinical') &&
            response.status() === 200
        )
        expect(searchResponse.fromServiceWorker()).toBe(true)
        await page.getByText('Clinical Trials', { exact: true }).first().waitFor()
        await page.getByPlaceholder('Search skills...').fill('no-such-skill')
        await page.waitForResponse(
          (response) => response.url().includes('search=no-such-skill') && response.status() === 200
        )
        await page.goto(`${web}/medflow`)
        await page.getByLabel('Your name').fill('Mock Researcher')
        await page.getByLabel('Email address').fill(`${device}@example.test`)
        await page.getByLabel(/You hereby acknowledge and agree/).check()
        await page.locator('#mf-btn').click()
        await page.locator('#mf-success-title').waitFor({ state: 'visible' })
        expect(await page.locator('#mf-success-title').textContent()).toContain('Mock!')
        expect(errors).toEqual([])
      } finally {
        await browser.close()
      }
    }, 120000)
  }
  for (const device of ['desktop', 'mobile']) {
    test(`${device}: browser Back restores loaded skills, filters, sorting and scroll after a detail reload`, async () => {
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }
        )
        const page = await context.newPage()
        await page.goto(`${web}/agent-skills/list`)
        const reject = page.getByRole('button', { name: 'Reject Non-Essential' })
        if (await reject.isVisible()) await reject.click()
        await page.getByRole('button', { name: 'Download', exact: true }).click()
        const cards = page.locator('main a[href^="/agent-skills/"]')
        await browserExpect(cards).toHaveCount(9)
        await cards.last().scrollIntoViewIfNeeded()
        await browserExpect.poll(() => cards.count()).toBeGreaterThanOrEqual(18)
        const target = cards.nth(14)
        const href = await target.getAttribute('href')
        await target.scrollIntoViewIfNeeded()
        const y = await page.evaluate(() => window.scrollY)
        const titles = await cards.allTextContents()
        await target.click()
        await browserExpect(page).toHaveURL(`${web}${href}`)
        await page.reload()
        await page.goBack()
        await browserExpect(page).toHaveURL(`${web}/agent-skills/list`)
        await browserExpect.poll(() => cards.count()).toBeGreaterThanOrEqual(18)
        await browserExpect
          .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - y), {
            timeout: 15000
          })
          .toBeLessThan(3)
        expect((await cards.allTextContents()).slice(0, 18)).toEqual(titles.slice(0, 18))
        const filteredResponse = page.waitForResponse(
          (response) => response.url().includes('search=Review') && response.status() === 200
        )
        await page.getByPlaceholder('Search skills...').fill('Review')
        await filteredResponse
        await browserExpect.poll(() => cards.count()).toBeLessThanOrEqual(10)
        await browserExpect.poll(() => cards.count()).toBeGreaterThanOrEqual(9)
        await browserExpect(cards.first()).toContainText('Review')
        await cards.nth(3).scrollIntoViewIfNeeded()
        const filteredY = await page.evaluate(() => window.scrollY)
        const filteredHref = await cards.nth(3).getAttribute('href')
        await cards.nth(3).click()
        await browserExpect(page).toHaveURL(`${web}${filteredHref}`)
        await page.reload()
        await page.goBack()
        await browserExpect(page.getByPlaceholder('Search skills...')).toHaveValue('Review')
        await browserExpect
          .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - filteredY), {
            timeout: 15000
          })
          .toBeLessThan(3)
      } finally {
        await browser.close()
      }
    }, 120000)

    test(`${device}: browser Back restores expanded blog rows after a detail reload`, async () => {
      const browser = await chromium.launch()
      try {
        const context = await browser.newContext(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 900 } }
        )
        const page = await context.newPage()
        await page.goto(`${web}/blog`)
        const reject = page.getByRole('button', { name: 'Reject Non-Essential' })
        if (await reject.isVisible()) await reject.click()
        const cards = page.locator('main a[href^="/blog/"]')
        await browserExpect(cards).toHaveCount(10)
        await page.getByRole('button', { name: 'Show more' }).click()
        await browserExpect(cards).toHaveCount(19)
        await cards.nth(14).scrollIntoViewIfNeeded()
        const y = await page.evaluate(() => window.scrollY)
        const articleHref = await cards.nth(14).getAttribute('href')
        await cards.nth(14).click()
        await browserExpect(page).toHaveURL(`${web}${articleHref}`)
        await page.reload()
        await page.goBack()
        await browserExpect(page).toHaveURL(`${web}/blog`)
        await browserExpect(cards).toHaveCount(19)
        await browserExpect
          .poll(async () => Math.abs((await page.evaluate(() => window.scrollY)) - y), {
            timeout: 15000
          })
          .toBeLessThan(3)
      } finally {
        await browser.close()
      }
    }, 120000)
  }

  for (const device of ['desktop', 'mobile']) {
    test(`${device}: redesigned leaderboard preserves search, ranges, categories and infinite loading`, async () => {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 1000 } }
        )
        page.setDefaultTimeout(15000)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        await page.goto(`${web}/leaderboard`)
        const reject = page.getByRole('button', { name: 'Reject Non-Essential' })
        if (await reject.isVisible()) await reject.click()
        const results = page.getByRole('region', { name: 'Leaderboard results' })
        const rows = results.getByRole('link', {
          name: /Literature Review|Clinical Trials|Data Analysis|Evidence Synthesis|Patient Summary|Statistical Review/
        })
        await browserExpect(rows).toHaveCount(20)
        await browserExpect(page.getByRole('definition')).toHaveCount(3)
        if (device === 'desktop') {
          await rows.first().hover()
          await browserExpect(rows.first()).toHaveCSS('box-shadow', 'none')
          const statistics = await page.getByRole('definition').first().boundingBox()
          const title = await page
            .getByRole('heading', { name: 'Leaderboard', exact: true })
            .boundingBox()
          expect(statistics && title && statistics.x > title.x + title.width).toBe(true)
        }
        await browserExpect(
          page.getByRole('link', { name: 'Weekly', exact: true })
        ).toHaveAttribute('href', '/leaderboard/weekly')
        await page.mouse.move(0, 0)
        await page.screenshot({
          path: join(reviewArtifacts, `leaderboard-redesign-${device}.png`),
          fullPage: true
        })
        await rows.last().scrollIntoViewIfNeeded()
        await page.getByText('Loaded 20 / 30', { exact: true }).scrollIntoViewIfNeeded()
        await browserExpect(rows).toHaveCount(30)
        const searchResponse = page.waitForResponse(
          (r) =>
            r.url().includes('/leaderboards/overall?') &&
            r.url().includes('keyword=Clinical') &&
            r.status() === 200
        )
        await page.getByRole('searchbox', { name: 'Search skills' }).fill('Clinical')
        expect((await searchResponse).fromServiceWorker()).toBe(true)
        await browserExpect(rows).toHaveCount(5)
        await page.getByRole('searchbox', { name: 'Search skills' }).fill('no-such-skill')
        await browserExpect(page.getByText('No results found')).toBeVisible()
        await page.getByRole('button', { name: 'Clear', exact: true }).click()
        await page.getByRole('button', { name: 'Filters', exact: true }).click()
        const filters = page.locator('#leaderboard-filters')
        await browserExpect(filters).toBeVisible()
        await filters.getByRole('button', { name: 'Clinical Practice', exact: true }).click()
        await browserExpect(rows).toHaveCount(10)
        await filters.getByLabel('Maximum rank', { exact: true }).fill('10')
        await browserExpect(rows).toHaveCount(3)
        await filters.getByRole('button', { name: 'Reset all' }).click()
        // Reset restores the unfiltered query, including its already loaded second page.
        await browserExpect(rows).toHaveCount(30)
        await page.getByRole('button', { name: 'Filters', exact: true }).click()
        await browserExpect(filters).toBeHidden()
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        await rows.first().getByText('Literature Review', { exact: true }).click()
        await browserExpect(page).toHaveURL(`${web}/leaderboard/items/literature-review`)
        expect(errors).toEqual([])
      } finally {
        await browser.close()
      }
    }, 90000)

    test(`${device}: redesigned skill detail preserves files, documentation, downloads and report navigation`, async () => {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage(
          device === 'mobile' ? devices['Pixel 5'] : { viewport: { width: 1440, height: 1000 } }
        )
        page.setDefaultTimeout(15000)
        const errors: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        // Observe the existing external destination without navigating to GitHub during local checks.
        await page.addInitScript(() => {
          window.open = (url) => {
            document.documentElement.dataset.openedUrl = String(url)
            return null
          }
        })
        await page.goto(`${web}/agent-skills/literature-review`)
        const reject = page.getByRole('button', { name: 'Reject Non-Essential' })
        if (await reject.isVisible()) await reject.click()
        await browserExpect(
          page.getByRole('heading', { name: 'Literature Review', level: 1 }).first()
        ).toBeVisible()
        const summary = page.getByRole('region', { name: 'Skill evaluation summary' })
        await browserExpect(summary).toContainText('18 / 20 Passed')
        await browserExpect(summary).toContainText('Functional Suitability')
        if (device === 'desktop') {
          const bounds = await summary.boundingBox()
          expect(bounds?.height).toBeLessThan(480)
          const panels = await summary.evaluate((element) => {
            const core = element.children[1]?.lastElementChild
            const medical = element.children[2]?.lastElementChild
            if (!core || !medical) throw new Error('Missing evaluation panels')
            return {
              core: core.getBoundingClientRect().toJSON(),
              medical: medical.getBoundingClientRect().toJSON(),
              rows: [...medical.children].map((row) => row.getBoundingClientRect().height)
            }
          })
          expect(Math.abs(panels.core.top - panels.medical.top)).toBeLessThan(1)
          expect(Math.abs(panels.core.bottom - panels.medical.bottom)).toBeLessThan(1)
          expect(Math.max(...panels.rows) - Math.min(...panels.rows)).toBeLessThanOrEqual(1.1)
        }
        const root = page.getByRole('button', { name: 'literature-review/', exact: true })
        await root.focus()
        await page.keyboard.press('Enter')
        await browserExpect(page.getByText('research-checklist.md', { exact: true })).toBeHidden()
        await page.keyboard.press('Enter')
        await browserExpect(page.getByText('research-checklist.md', { exact: true })).toBeVisible()
        const downloadResponse = page.waitForResponse(
          (r) => r.url().includes('/skills/literature-review/github_download') && r.status() === 200
        )
        await page.getByRole('button', { name: 'Download Skills', exact: true }).click()
        expect((await downloadResponse).fromServiceWorker()).toBe(true)
        await browserExpect(page.locator('html')).toHaveAttribute(
          'data-opened-url',
          'https://github.com/aipoch/medical-research-skills'
        )
        await browserExpect(
          page.getByRole('link', { name: 'View Evaluation Report', exact: true })
        ).toHaveAttribute('href', '/leaderboard/items/literature-review-result')
        await page.mouse.move(0, 0)
        await page.screenshot({
          path: join(reviewArtifacts, `skill-detail-redesign-${device}.png`),
          fullPage: true
        })
        const toc = page.getByRole('navigation', { name: 'On this page', exact: true })
        if (device === 'desktop') {
          await toc.getByRole('link', { name: 'Requirements', exact: true }).click()
          await browserExpect(page).toHaveURL(/#heading-requirements$/)
          await browserExpect(page.locator('#heading-requirements')).toBeInViewport()
        }
        await browserExpect(page.locator('article table')).toContainText('Research question')
        await browserExpect(page.locator('article pre')).toContainText('scripts/main.py')
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        )
        const schemas = await page.locator('script[type="application/ld+json"]').allTextContents()
        const parsed = schemas.map((schema) => JSON.parse(schema))
        expect(parsed.find((schema) => schema['@type'] === 'WebPage').dateModified).toBe(
          '2026-10-09'
        )
        expect(
          parsed.find((schema) => schema['@type'] === 'SoftwareApplication').dateModified
        ).toBe('2026-09-01T00:00:00.000Z')
        await page.getByRole('link', { name: 'View Evaluation Report', exact: true }).click()
        await browserExpect(page).toHaveURL(`${web}/leaderboard/items/literature-review-result`)
        // The report retains its original score ring and bright-green evaluation widgets.
        await browserExpect(page.locator('main')).toBeVisible()
        expect(await page.locator('main').innerText()).toContain('literature-review')
        expect(errors).toEqual([])
      } finally {
        await browser.close()
      }
    }, 90000)
  }

  test('stops both ports when the foreground launcher receives SIGTERM', async () => {
    launcher.kill('SIGTERM')
    expect(await launcher.exited).toBe(0)
    for (const url of [web, `${api}/health`]) {
      // Descendant sockets may close just after the direct child emits exit.
      let closed = false
      for (let attempt = 0; attempt < 30; attempt++) {
        try {
          await fetch(url, { signal: AbortSignal.timeout(500) })
          await Bun.sleep(100)
        } catch {
          closed = true
          break
        }
      }
      expect(closed).toBe(true)
    }
  }, 15000)
})

// Startup failures must not stop a service that was already listening.
test('occupied Web/API ports fail cleanly and preserve the existing service', async () => {
  for (const occupied of ['web', 'api']) {
    const existing = Bun.serve({
      hostname: '127.0.0.1',
      port: 0,
      fetch: () => new Response('existing service')
    })
    const freePort = await availablePort()
    const port = occupied === 'web' ? existing.port : freePort
    const mockPort = occupied === 'api' ? existing.port : freePort
    const child = Bun.spawn(
      [
        process.execPath,
        'run',
        'scripts/dev-mock.ts',
        '--port',
        String(port),
        '--mock-port',
        String(mockPort)
      ],
      { stdout: 'ignore', stderr: 'ignore' }
    )
    const timeout = setTimeout(() => child.kill('SIGTERM'), 10000)
    try {
      expect(await child.exited).toBe(1)
      expect(await (await fetch(`http://127.0.0.1:${existing.port}`)).text()).toBe(
        'existing service'
      )
      await expect(
        fetch(`http://127.0.0.1:${freePort}/health`, { signal: AbortSignal.timeout(1000) })
      ).rejects.toThrow()
    } finally {
      clearTimeout(timeout)
      if (child.exitCode === null) {
        child.kill('SIGTERM')
        await child.exited
      }
      existing.stop(true)
    }
  }
}, 25000)
