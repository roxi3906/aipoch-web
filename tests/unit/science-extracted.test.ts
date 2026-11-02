import { afterEach, expect, mock, test } from 'bun:test'
import { readArchive, readJson } from '../../lib/science-package/archive'
import { loadReplayPackage } from '../../lib/science-package/extracted'
import type { Manifest } from '../../lib/science-package/parse'
import { buildCoveragePackage } from '../../mocks/fixtures/science-coverage-package'

const originalFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = originalFetch
})
const base = 'https://cdn.test/cases/sample/extracted/'
const sample = buildCoveragePackage('Extracted sample')
const info = {
  url: 'https://releases.test/sample.science',
  filename: 'sample.science',
  sizeBytes: sample.sizeBytes,
  sha256: sample.sha256,
  extractedBaseUrl: base
}
const setup = async (override?: (path: string, blob: Blob | undefined) => Response | undefined) => {
  const files = await readArchive(new Blob([sample.bytes as BlobPart]))
  const manifest = await readJson<Manifest>(files.get('manifest.json'), 'manifest.json')
  const sessionFile = files.get('session.json')
  if (!sessionFile) throw new Error('Missing fixture session')
  const recordsFile = files.get('records.json')
  if (!recordsFile) throw new Error('Missing fixture review records')
  const extracted = new Map([
    ['session.json', sessionFile],
    ['records.json', recordsFile]
  ])
  for (const entry of manifest.inventory) {
    const file = files.get(entry.path)
    if (entry.storageKey && file) extracted.set(entry.storageKey, file)
  }
  const requests: string[] = []
  globalThis.fetch = mock(async (input: string | URL | Request) => {
    const url = String(input)
    requests.push(url)
    if (url === info.url) return new Response(sample.bytes as BodyInit)
    const path = decodeURIComponent(url.slice(base.length))
    const blob = extracted.get(path)?.blob
    return override?.(path, blob) ?? new Response(blob, { status: blob ? 200 : 404 })
  }) as unknown as typeof fetch
  return { files, requests }
}

test('loads review records without a manifest and leaves artifact bytes on the CDN', async () => {
  const { requests } = await setup()
  const result = await loadReplayPackage(info, 'sample', () => {})
  expect(requests[0]).toBe(`${base}session.json`)
  expect(requests).not.toContain(info.url)
  expect(result.session.title).toBe('Extracted sample')
  const report = result.session.assets['files/coverage_report.md']
  expect(report.url).toBe(`${base}files/coverage_report.md#coverage_report.md`)
  expect(requests).not.toContain(report.url.split('#')[0])
  expect(requests).toHaveLength(3) // Session, optional notebook run, and review records.
  expect(result.session.reviews).toHaveLength(2)
  expect(requests.some((url) => /\/manifest\.json$/.test(url))).toBe(false)
  const message = result.session.items.find(
    (item) => item.type === 'message' && item.artifacts?.length
  )
  expect(
    message?.type === 'message' &&
      message.artifacts?.find((a) => a.name === 'coverage_report.md')?.url
  ).toBe(report.url)
  expect(message?.type === 'message' && message.content).toContain(report.url)
  expect(result.resources.every((resource) => resource.blob.type === 'image/png')).toBe(true)
})

for (const status of [403, 404]) {
  test(`falls back to the verified archive when the extracted session returns ${status}`, async () => {
    const { requests } = await setup((path) =>
      path === 'session.json' ? new Response(null, { status }) : undefined
    )
    const result = await loadReplayPackage(info, 'sample', () => {})
    expect(result.session.title).toBe('Extracted sample')
    expect(requests).toEqual([`${base}session.json`, `${base}records.json`, info.url])
    expect(result.session.assets['files/coverage_report.md'].url).toStartWith('science-asset:')
  })
}

test('rejects corrupt metadata without silently downloading a large archive', async () => {
  const { requests } = await setup((path) =>
    path === 'session.json' ? Response.json({ version: 2, session: { messages: [] } }) : undefined
  )
  await expect(loadReplayPackage(info, 'sample', () => {})).rejects.toThrow('session.json')
  expect(requests).not.toContain(info.url)
})

test('does not fall back on transient storage failures', async () => {
  const { requests } = await setup(() => new Response(null, { status: 503 }))
  await expect(loadReplayPackage(info, 'sample', () => {})).rejects.toThrow('503')
  expect(requests).toHaveLength(2)
})

test('empty sessions need no notebook or archive after the independent metadata requests', async () => {
  const { requests } = await setup((path) =>
    path === 'session.json'
      ? Response.json({ version: 2, session: { title: 'Empty session', messages: [] } })
      : undefined
  )
  const result = await loadReplayPackage(info, 'sample', () => {})
  expect(result.session.title).toBe('Empty session')
  expect(result.session.items).toEqual([])
  expect(requests).toEqual([`${base}session.json`, `${base}records.json`])
})

for (const extracted of [true, false]) {
  for (const [filename, fragment] of [
    ['report).md', 'report%29.md'],
    ['report(.md', 'report%28.md']
  ]) {
    test(`preserves one Markdown-safe filename fragment for ${filename} (${extracted ? 'extracted' : 'archive'})`, async () => {
      await setup((path) =>
        !extracted && path === 'session.json' ? new Response(null, { status: 404 }) : undefined
      )
      const { session } = await loadReplayPackage(info, 'sample', () => {})
      const asset = session.assets[`files/${filename}`]
      if (extracted) expect(asset.url.split('#')[1]).toBe(fragment)
      const message = session.items.find(
        (item) => item.type === 'message' && item.artifacts?.length
      )
      const url = extracted ? asset.url : `${asset.url}#${fragment}`
      expect(message?.type === 'message' && message.content).toContain(`](${url})`)
    })
  }
}

test('maps an unchanged session storage key directly to the restored directory', async () => {
  const { requests } = await setup((path) =>
    path === 'session.json'
      ? Response.json({
          version: 2,
          session: {
            title: 'Published Wordle artifact',
            messages: [
              {
                id: 'answer',
                role: 'assistant',
                content: '[Results](wordle-results.csv)',
                artifactIds: ['result']
              }
            ],
            artifacts: [
              {
                id: 'result',
                path: '$DATA/artifacts/cmuchpzre0000rxicgzmt5my5/01a0c89a-3411-7040-a549-6f01a2551e02/.provenance/20f824df-908d-46f0-a1b7-07e4258037e5/versions/bbe7d541-de9f-4b70-a1d6-966911fe045b/content',
                name: 'wordle-results.csv',
                sha256: 'b91b7dca3fa11e91744ee7fed46fccbb8f1aedc92d7473c15d9ca9cfee05322b',
                size: 962
              }
            ]
          }
        })
      : undefined
  )
  const { session } = await loadReplayPackage(info, 'sample', () => {})
  const message = session.items[0]
  expect(message.type === 'message' && message.artifacts?.[0].url).toBe(
    `${base}artifacts/cmuchpzre0000rxicgzmt5my5/01a0c89a-3411-7040-a549-6f01a2551e02/.provenance/20f824df-908d-46f0-a1b7-07e4258037e5/versions/bbe7d541-de9f-4b70-a1d6-966911fe045b/content#wordle-results.csv`
  )
  expect(requests).toEqual([`${base}session.json`, `${base}records.json`])
})

for (const status of [403, 404]) {
  test(`keeps the transcript and artifacts when optional notebook metadata returns ${status}`, async () => {
    const { requests } = await setup((path) =>
      path.startsWith('notebooks/') ? new Response(null, { status }) : undefined
    )
    const result = await loadReplayPackage(info, 'sample', () => {})
    expect(result.session.title).toBe('Extracted sample')
    expect(Object.keys(result.session.assets)).toHaveLength(9)
    expect(requests).not.toContain(info.url)
  })
}

test('rejects a JSON null session rather than falling back to the archive', async () => {
  const { requests } = await setup((path) =>
    path === 'session.json' ? Response.json(null) : undefined
  )
  await expect(loadReplayPackage(info, 'sample', () => {})).rejects.toThrow('invalid session.json')
  expect(requests).toEqual([`${base}session.json`, `${base}records.json`])
})

for (const storageKey of [
  '../outside',
  '/outside',
  'files/../../outside',
  'https://evil.test/file',
  'files\\outside'
]) {
  test(`rejects unsafe extracted storage key ${storageKey}`, async () => {
    const { requests } = await setup((path) =>
      path === 'session.json'
        ? Response.json({
            version: 2,
            session: {
              title: 'Unsafe',
              messages: [],
              artifacts: [{ path: storageKey, name: 'file' }]
            }
          })
        : undefined
    )
    await expect(loadReplayPackage(info, 'sample', () => {})).rejects.toThrow('storage key')
    expect(requests).toEqual([`${base}session.json`, `${base}records.json`])
  })
}

test('encodes storage path segments without changing their directory structure', async () => {
  const path = '$DATA/artifacts/中文 folder/report (1)#?.md'
  await setup((file) =>
    file === 'session.json'
      ? Response.json({
          version: 2,
          session: {
            title: 'Special paths',
            messages: [],
            artifacts: [{ path, name: 'report (1)#?.md' }]
          }
        })
      : undefined
  )
  const { session } = await loadReplayPackage(info, 'sample', () => {})
  expect(session.assets[path.slice(6)].url).toBe(
    `${base}artifacts/%E4%B8%AD%E6%96%87%20folder/report%20%281%29%23%3F.md#report%20%281%29%23%3F.md`
  )
})

test('loads full notebook outputs from the restored notebook directory', async () => {
  const { requests } = await setup()
  const { session } = await loadReplayPackage(info, 'sample', () => {})
  expect(requests).toEqual([
    `${base}session.json`,
    `${base}records.json`,
    `${base}notebooks/mock-project/mock-session/run.json`
  ])
  expect(
    session.items.some(
      (item) => item.type === 'activity-group' && item.activities.some((a) => a.run?.outputs.length)
    )
  ).toBe(true)
})

for (const status of [403, 404]) {
  test(`uses the verified archive for missing reviewer records (${status})`, async () => {
    const { requests } = await setup((path) =>
      path === 'records.json' ? new Response(null, { status }) : undefined
    )
    const result = await loadReplayPackage(info, 'sample', () => {})
    expect(result.session.reviews).toHaveLength(2)
    expect(requests.filter((url) => url === info.url)).toHaveLength(1)
    expect(result.session.assets['files/coverage_report.md'].url).toStartWith(base)
  })
}

test('does not replace corrupt or unavailable review records with a silent archive download', async () => {
  for (const response of [Response.json({ tables: null }), new Response(null, { status: 503 })]) {
    const { requests } = await setup((path) => (path === 'records.json' ? response : undefined))
    await expect(loadReplayPackage(info, 'sample', () => {})).rejects.toThrow()
    expect(requests).not.toContain(info.url)
  }
})

test('buffers out-of-order records and unresolved dependencies until complete blocks can be finalized', async () => {
  const source = {
    version: 2,
    session: {
      title: 'Buffered order',
      messages: [
        {
          id: 'answer',
          role: 'agent',
          content: '```ts\nconst x = 1\n```\n\n| A |\n| - |\n| B |',
          createdAt: 20
        }
      ],
      conversationGraph: {
        activities: [
          { id: 'after', createdAt: 30, providerToolName: 'Read' },
          { id: 'before-a', createdAt: 10, providerToolName: 'Read' },
          { id: 'before-b', createdAt: 15, providerToolName: 'Read' },
          {
            id: 'compact',
            createdAt: 5,
            providerToolName: 'ContextCompaction',
            status: 'completed',
            rawOutput: 'INTERNAL DO NOT DISPLAY'
          }
        ]
      },
      artifacts: []
    }
  }
  const json = JSON.stringify(source)
  let body!: ReadableStreamDefaultController<Uint8Array>
  let records!: (value: Response) => void
  globalThis.fetch = mock(async (url: string | URL) =>
    String(url).endsWith('session.json')
      ? new Response(
          new ReadableStream({
            start(controller) {
              body = controller
            }
          })
        )
      : new Promise<Response>((resolve) => {
          records = resolve
        })
  ) as unknown as typeof fetch
  let settled = false
  const pending = loadReplayPackage(info, 'buffered', () => {})
  void pending.then(() => {
    settled = true
  })
  const encoder = new TextEncoder()
  for (let i = 0; i < 30; i++) await Promise.resolve()
  const boundary = json.indexOf(',"conversationGraph"')
  body.enqueue(encoder.encode(json.slice(0, boundary)))
  for (let i = 0; i < 30; i++) await Promise.resolve()
  expect(settled).toBe(false)
  body.enqueue(encoder.encode(json.slice(boundary)))
  body.close()
  for (let i = 0; i < 80; i++) await Promise.resolve()
  expect(settled).toBe(false)
  records(new Response(null, { status: 404 }))
  const result = await pending
  expect(result.session.items.map((item) => item.id)).toEqual([
    'compact',
    'before-a',
    'answer',
    'after'
  ])
  const group = result.session.items[1]
  expect(group.type === 'activity-group' && group.activities.map((item) => item.id)).toEqual([
    'before-a',
    'before-b'
  ])
  expect(JSON.stringify(result.session)).not.toContain('INTERNAL DO NOT DISPLAY')
  expect(result.session.items[2]).toMatchObject({ content: source.session.messages[0].content })
  expect(JSON.stringify(source)).toBe(json)
})
