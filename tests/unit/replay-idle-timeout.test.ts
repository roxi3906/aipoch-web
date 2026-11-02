import { afterEach, expect, jest, mock, test } from 'bun:test'
import { downloadPackage } from '../../lib/science-package/archive'
import { loadReplayPackage } from '../../lib/science-package/extracted'
import { Sha256 } from '../../lib/science-package/sha256'

const originalFetch = globalThis.fetch
const encoder = new TextEncoder()
const document = encoder.encode(
  JSON.stringify({ version: 2, session: { title: 'Slow', messages: [] } })
)
const info = {
  url: 'https://cdn.test/a.science',
  filename: 'a.science',
  sizeBytes: 1,
  sha256: 'a'.repeat(64),
  extractedBaseUrl: 'https://cdn.test/extracted/'
}
let source: ReadableStreamDefaultController<Uint8Array> | undefined
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve()
}
const start = (options: { archive?: boolean; signal?: AbortSignal } = {}) => {
  jest.useFakeTimers()
  const canceled = mock(() => {})
  globalThis.fetch = mock(async (url: string | URL) =>
    String(url).endsWith('records.json')
      ? new Response(null, { status: 404 })
      : new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              source = controller
            },
            cancel: canceled
          })
        )
  ) as unknown as typeof fetch
  const hash = new Sha256()
  hash.update(document)
  const promise = options.archive
    ? downloadPackage(
        { ...info, sizeBytes: document.length, sha256: hash.hex() },
        () => {},
        options.signal
      )
    : loadReplayPackage(info, 'slow', () => {}, options.signal)
  let result: 'pending' | 'ready' | 'error' = 'pending'
  let error: unknown
  void promise.then(
    () => {
      result = 'ready'
    },
    (reason) => {
      result = 'error'
      error = reason
    }
  )
  return { promise, canceled, result: () => result, error: () => error }
}
afterEach(() => {
  try {
    source?.close()
  } catch {
    /* Already closed or canceled. */
  }
  source = undefined
  globalThis.fetch = originalFetch
  jest.clearAllTimers()
  jest.useRealTimers()
})

for (const archive of [false, true]) {
  test(`${archive ? 'archive' : 'metadata'} times out before the first nonempty body chunk`, async () => {
    const s = start({ archive })
    await flush()
    source?.enqueue(new Uint8Array())
    jest.advanceTimersByTime(29_999)
    await flush()
    expect(s.result()).toBe('pending')
    jest.advanceTimersByTime(1)
    await flush()
    expect(s.result()).toBe('error')
    expect(s.error()).toBeInstanceOf(Error)
    expect(s.canceled).toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  })
  test(`${archive ? 'archive' : 'metadata'} accepts continuous downloads lasting over 30 seconds and clears the timer at EOF`, async () => {
    const s = start({ archive })
    await flush()
    for (const part of [document.slice(0, 10), document.slice(10, 20), document.slice(20)]) {
      jest.advanceTimersByTime(20_000)
      source?.enqueue(part)
      await flush()
      expect(s.result()).toBe('pending')
    }
    source?.close()
    await s.promise
    expect(jest.getTimerCount()).toBe(0)
    jest.advanceTimersByTime(30_000)
    await flush()
    expect(s.result()).toBe('ready')
  })
  test(`${archive ? 'archive' : 'metadata'} times out after a stalled body even if empty chunks arrive`, async () => {
    const s = start({ archive })
    await flush()
    jest.advanceTimersByTime(20_000)
    source?.enqueue(document.slice(0, 10))
    await flush()
    jest.advanceTimersByTime(29_999)
    source?.enqueue(new Uint8Array())
    await flush()
    expect(s.result()).toBe('pending')
    jest.advanceTimersByTime(1)
    await flush()
    expect(s.result()).toBe('error')
    expect(jest.getTimerCount()).toBe(0)
  })
}

test('caller cancellation cancels the pending read and clears the idle timer', async () => {
  const abort = new AbortController()
  const s = start({ archive: true, signal: abort.signal })
  await flush()
  abort.abort(new DOMException('Stopped', 'AbortError'))
  await flush()
  expect(s.result()).toBe('error')
  expect(s.canceled).toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})

test('a failed stream releases its idle timer', async () => {
  const s = start()
  await flush()
  source?.error(new Error('Network disconnected'))
  await expect(s.promise).rejects.toThrow('Network disconnected')
  expect(jest.getTimerCount()).toBe(0)
})

test('the first-byte deadline includes waiting for response headers', async () => {
  jest.useFakeTimers()
  globalThis.fetch = mock(
    (_url: unknown, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
          once: true
        })
      })
  ) as unknown as typeof fetch
  const pending = loadReplayPackage(info, 'slow', () => {})
  let error: unknown
  void pending.catch((reason) => {
    error = reason
  })
  jest.advanceTimersByTime(30_000)
  await flush()
  expect(error).toBeInstanceOf(DOMException)
  expect((error as DOMException).name).toBe('TimeoutError')
  expect(jest.getTimerCount()).toBe(0)
})
test('metadata cancellation interrupts a pending read and releases the timer', async () => {
  const controller = new AbortController()
  const s = start({ signal: controller.signal })
  await flush()
  controller.abort()
  await flush()
  expect(s.result()).toBe('error')
  expect(s.canceled).toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})
test('malformed complete JSON cancels the remaining body and releases the timer', async () => {
  const s = start()
  await flush()
  source?.enqueue(encoder.encode('{"messages":[{"x":truX}],'))
  await flush()
  expect(s.result()).toBe('error')
  expect(s.canceled).toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
})
