import { afterEach, expect, jest, mock, test } from 'bun:test'
import * as loader from '../../lib/science-package/extracted'

const originalFetch = globalThis.fetch
let fakeClock = false
const info = {
  url: 'https://cdn.test/a.science',
  filename: 'a.science',
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
  extractedBaseUrl: 'https://cdn.test/extracted/'
}
const session = {
  id: 's',
  projectId: 'p',
  title: 'Body first',
  messages: [
    {
      id: 'm',
      role: 'agent',
      createdAt: 1,
      content: '```js\nconst x = 1\n```\n\n| A |\n| - |\n| B |'
    }
  ]
}
const records = {
  tables: {
    Review: [
      {
        id: 'r2',
        sessionId: 's',
        projectId: 'p',
        turnMessageId: 'm',
        createdAt: 3,
        lifecycle: 'complete'
      },
      {
        id: 'r1',
        sessionId: 's',
        projectId: 'p',
        turnMessageId: 'm',
        createdAt: 2,
        lifecycle: 'complete'
      }
    ],
    Finding: [
      {
        id: 'f',
        reviewId: 'r1',
        status: 'pass',
        claim: 'Complete finding',
        evidence: 'Complete evidence',
        sortIndex: 0
      }
    ]
  }
}
afterEach(() => {
  globalThis.fetch = originalFetch
  if (fakeClock) {
    jest.clearAllTimers()
    jest.useRealTimers()
    fakeClock = false
  }
})
test('existing session waits for late earlier records and never requests a derived replay format', async () => {
  let body!: ReadableStreamDefaultController<Uint8Array>
  const requests: string[] = []
  globalThis.fetch = mock(async (url: string | URL) => {
    requests.push(String(url))
    if (String(url).endsWith('records.json')) return Response.json(records)
    return new Response(
      new ReadableStream({
        start(c) {
          body = c
        }
      })
    )
  }) as unknown as typeof fetch
  let ready = false
  const pending = loader
    .prepareReplayPackage(info, 'case', () => {})
    .then((value) => {
      ready = true
      return value
    })
  const earlier = { id: 'earlier', role: 'user', createdAt: 0, content: 'First question' }
  const json = JSON.stringify({
    version: 2,
    session: {
      ...session,
      messages: [...session.messages, earlier]
    }
  })
  const split = json.indexOf(',{"id":"earlier"')
  expect(split).toBeGreaterThan(0)
  body.enqueue(new TextEncoder().encode(json.slice(0, split)))
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(ready).toBe(false)
  body.enqueue(new TextEncoder().encode(json.slice(split)))
  body.close()
  const result = await pending
  expect(result.session.items.map((item) => item.id)).toEqual(['earlier', 'm'])
  expect(result.session.items[1]).toMatchObject({ content: session.messages[0].content })
  expect(requests).toEqual([
    `${info.extractedBaseUrl}session.json`,
    `${info.extractedBaseUrl}records.json`
  ])
  await result.loadReviews()
})
test('starts records beside session, exposes complete body before records, then orders complete associated reviews', async () => {
  const requests: string[] = []
  let body!: ReadableStreamDefaultController<Uint8Array>
  globalThis.fetch = mock(async (url: string | URL) => {
    requests.push(String(url))
    return String(url).endsWith('session.json')
      ? Response.json({ version: 2, session })
      : new Response(
          new ReadableStream({
            start(c) {
              body = c
            }
          })
        )
  }) as unknown as typeof fetch
  expect(typeof loader.prepareReplayPackage).toBe('function')
  const result = await loader.prepareReplayPackage(info, 'case', () => {})
  expect(requests).toEqual([
    `${info.extractedBaseUrl}session.json`,
    `${info.extractedBaseUrl}records.json`
  ])
  const before = JSON.stringify(result.session)
  expect(result.session.items[0]).toMatchObject({ content: session.messages[0].content })
  let settled = false
  const pending = result.loadReviews().then((value) => {
    settled = true
    return value
  })
  const json = JSON.stringify(records)
  const split = json.indexOf(',"Finding"')
  body.enqueue(new TextEncoder().encode(json.slice(0, split)))
  await new Promise((r) => setTimeout(r, 0))
  expect(settled).toBe(false)
  body.enqueue(new TextEncoder().encode(json.slice(split)))
  body.close()
  const reviews = await pending
  expect(reviews.map((r) => r.id)).toEqual(['r1', 'r2'])
  expect(reviews[0].checks[0].claim).toBe('Complete finding')
  expect(JSON.stringify(result.session)).toBe(before)
})
test('review failure and retry leave the body unchanged and refetch only records', async () => {
  let attempts = 0
  const requests: string[] = []
  globalThis.fetch = mock(async (url: string | URL) => {
    requests.push(String(url))
    if (String(url).endsWith('session.json')) return Response.json({ version: 2, session })
    return ++attempts === 1 ? new Response(null, { status: 503 }) : Response.json(records)
  }) as unknown as typeof fetch
  expect(typeof loader.prepareReplayPackage).toBe('function')
  const result = await loader.prepareReplayPackage(info, 'case', () => {})
  const before = JSON.stringify(result.session)
  await expect(result.loadReviews()).rejects.toThrow('503')
  expect(await result.loadReviews()).toHaveLength(2)
  expect(requests.filter((url) => url.endsWith('session.json'))).toHaveLength(1)
  expect(JSON.stringify(result.session)).toBe(before)
})
test('cancels pending records when the consumer leaves after the body is ready', async () => {
  const canceled = mock(() => {})
  const controller = new AbortController()
  globalThis.fetch = mock(async (url: string | URL) =>
    String(url).endsWith('session.json')
      ? Response.json({ version: 2, session })
      : new Response(new ReadableStream({ cancel: canceled }))
  ) as unknown as typeof fetch
  expect(typeof loader.prepareReplayPackage).toBe('function')
  const result = await loader.prepareReplayPackage(info, 'case', () => {}, controller.signal)
  const pending = result.loadReviews()
  controller.abort()
  await expect(pending).rejects.toThrow()
  expect(canceled).toHaveBeenCalled()
})

test('invalid session cancels its independently downloading records', async () => {
  const canceled = mock(() => {})
  globalThis.fetch = mock(async (url: string | URL) =>
    String(url).endsWith('session.json')
      ? Response.json({ version: 2, session: null })
      : new Response(new ReadableStream({ cancel: canceled }))
  ) as unknown as typeof fetch
  await expect(loader.prepareReplayPackage(info, 'case', () => {})).rejects.toThrow('session.json')
  expect(canceled).toHaveBeenCalled()
})

for (const stalled of [false, true]) {
  test(`records ${stalled ? 'stall fails independently and can retry' : 'stay active beyond 30 seconds without delaying the body'}`, async () => {
    jest.useFakeTimers()
    fakeClock = true
    let source!: ReadableStreamDefaultController<Uint8Array>
    let attempt = 0
    globalThis.fetch = mock(async (url: string | URL) => {
      if (String(url).endsWith('session.json')) return Response.json({ version: 2, session })
      if (++attempt > 1) return Response.json(records)
      return new Response(
        new ReadableStream({
          start(c) {
            source = c
          }
        })
      )
    }) as unknown as typeof fetch
    const result = await loader.prepareReplayPackage(info, 'case', () => {})
    const before = JSON.stringify(result.session)
    const pending = result.loadReviews()
    let error: unknown
    void pending.catch((e) => {
      error = e
    })
    const flush = async () => {
      for (let i = 0; i < 60; i++) await Promise.resolve()
    }
    const json = new TextEncoder().encode(JSON.stringify(records))
    source.enqueue(json.slice(0, 10))
    await flush()
    if (stalled) {
      jest.advanceTimersByTime(30000)
      await flush()
      expect((error as Error).name).toBe('TimeoutError')
      expect(await result.loadReviews()).toHaveLength(2)
    } else {
      for (const part of [json.slice(10, 20), json.slice(20, 30), json.slice(30)]) {
        jest.advanceTimersByTime(20000)
        source.enqueue(part)
        await flush()
        expect(error).toBeUndefined()
      }
      source.close()
      expect(await pending).toHaveLength(2)
    }
    expect(jest.getTimerCount()).toBe(0)
    expect(JSON.stringify(result.session)).toBe(before)
  })
}

test('body still waits for Notebook dependencies while reviews download independently', async () => {
  let finishRun!: (response: Response) => void
  const requests: string[] = []
  const source = {
    ...session,
    conversationGraph: {
      activities: [
        {
          id: 'run',
          createdAt: 2,
          executionInvocationId: 'invocation',
          providerToolName: 'Execute'
        }
      ]
    }
  }
  globalThis.fetch = mock(async (url: string | URL) => {
    requests.push(String(url))
    if (String(url).endsWith('session.json')) return Response.json({ version: 2, session: source })
    if (String(url).endsWith('records.json')) return Response.json(records)
    return new Promise<Response>((resolve) => {
      finishRun = resolve
    })
  }) as unknown as typeof fetch
  let ready = false
  const pending = loader
    .prepareReplayPackage(info, 'case', () => {})
    .then((value) => {
      ready = true
      return value
    })
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(ready).toBe(false)
  expect(requests.map((url) => url.slice(info.extractedBaseUrl.length))).toEqual([
    'session.json',
    'records.json',
    'notebooks/p/s/run.json'
  ])
  finishRun(Response.json({ runs: [] }))
  const result = await pending
  expect(result.session.items.map((item) => item.id)).toEqual(['m', 'run'])
  expect(await result.loadReviews()).toHaveLength(2)
})
