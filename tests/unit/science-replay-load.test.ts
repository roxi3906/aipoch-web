import { afterEach, expect, mock, test } from 'bun:test'
import type { WorkerReply } from '../../lib/science-package/protocol'

const waitForMock = mock(async () => {})
mock.module('../../mocks/ready', () => ({ waitForBrowserMock: waitForMock }))
const info = {
  url: 'https://cdn.test/a.science',
  filename: 'a.science',
  sizeBytes: 10,
  sha256: 'a'.repeat(64)
}
const { loadReplay } = await import('../../lib/science-package/load')
const original = {
  fetch: globalThis.fetch,
  worker: globalThis.Worker,
  create: URL.createObjectURL,
  revoke: URL.revokeObjectURL
}
class TestWorker {
  static instances: TestWorker[] = []
  onmessage?: (event: { data: WorkerReply }) => void
  onerror?: (event: { message: string }) => void
  terminate = mock(() => {})
  postMessage = mock((_message: unknown) => {})
  constructor() {
    TestWorker.instances.push(this)
  }
  emit(data: WorkerReply) {
    this.onmessage?.({ data })
  }
}
const prepare = () => {
  TestWorker.instances = []
  waitForMock.mockReset().mockResolvedValue(undefined)
  globalThis.Worker = TestWorker as unknown as typeof Worker
  globalThis.fetch = mock(async () =>
    Response.json({
      url: 'https://cdn.test/a.science',
      filename: 'a.science',
      sizeBytes: 10,
      sha256: 'a'.repeat(64)
    })
  ) as unknown as typeof fetch
  URL.createObjectURL = mock(() => 'blob:test')
  URL.revokeObjectURL = mock(() => {})
}
afterEach(() => {
  globalThis.fetch = original.fetch
  globalThis.Worker = original.worker
  URL.createObjectURL = original.create
  URL.revokeObjectURL = original.revoke
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
test('unmount terminates the worker, revokes assets and ignores late messages', async () => {
  prepare()
  const update = mock(() => {})
  const cancel = loadReplay('case', info, update)
  await tick()
  expect(globalThis.fetch).not.toHaveBeenCalled()
  const worker = TestWorker.instances[0]
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'load', slug: 'case', info })
  worker.emit({ type: 'resources', resources: [{ id: 'science-asset:0', blob: new Blob(['a']) }] })
  expect(worker.postMessage).toHaveBeenLastCalledWith({
    type: 'urls',
    urls: { 'science-asset:0': 'blob:test' }
  })
  cancel()
  expect(worker.terminate).toHaveBeenCalledTimes(1)
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  const count = update.mock.calls.length
  worker.emit({ type: 'error', message: 'Too late' })
  expect(update.mock.calls.length).toBe(count)
})
test('worker failures release assets and retry creates a fresh task', async () => {
  prepare()
  const update = mock(() => {})
  const cancel = loadReplay('case', info, update)
  await tick()
  const worker = TestWorker.instances[0]
  worker.emit({ type: 'resources', resources: [{ id: 'science-asset:0', blob: new Blob(['a']) }] })
  worker.emit({ type: 'error', message: 'Invalid gzip' })
  expect(update).toHaveBeenLastCalledWith({ status: 'error', message: 'Invalid gzip' })
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  const count = update.mock.calls.length
  worker.emit({ type: 'progress', progress: { stage: 'parsing' } })
  expect(update.mock.calls.length).toBe(count)
  cancel()
  const cancelRetry = loadReplay('case', info, update)
  await tick()
  expect(TestWorker.instances).toHaveLength(2)
  cancelRetry()
})
test('leaving before mock readiness never starts a worker or performs a fetch', async () => {
  prepare()
  let ready: () => void = () => {}
  waitForMock.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        ready = resolve
      })
  )
  const update = mock(() => {})
  const cancel = loadReplay('case', info, update)
  cancel()
  ready()
  await tick()
  expect(TestWorker.instances).toHaveLength(0)
  expect(globalThis.fetch).not.toHaveBeenCalled()
  expect(update).toHaveBeenCalledTimes(1)
})

const session: import('../../lib/use-case-types').UseCaseSession = {
  schemaVersion: 1,
  slug: 'case',
  title: 'Ordered',
  projectName: '',
  exportedAt: 0,
  sessionCreatedAt: 0,
  assets: {},
  omissions: [],
  excludedFiles: [],
  items: Array.from({ length: 25 }, (_, index) => ({
    type: 'message' as const,
    id: `m${index}`,
    role: 'assistant' as const,
    content: `Complete block ${index}`,
    createdAt: index,
    status: 'complete'
  }))
}
test('reveals only contiguous complete blocks and never revises already published blocks', async () => {
  prepare()
  const states: import('../../lib/science-package/load').ReplayState[] = []
  const cancel = loadReplay('case', info, (state) => states.push(state))
  await tick()
  const worker = TestWorker.instances[0]
  worker.emit({ type: 'ready', data: session })
  expect(states.at(-1)?.status).toBe('rendering')
  const first = states.at(-1)
  expect(first && 'visibleCount' in first && first.visibleCount).toBeGreaterThan(0)
  expect(first && 'visibleCount' in first && first.visibleCount).toBeLessThan(25)
  await new Promise((resolve) => setTimeout(resolve, 100))
  expect(states.at(-1)).toEqual({ status: 'ready', data: session })
  let previous = 0
  for (const state of states) {
    if (state.status !== 'rendering') continue
    expect(state.data).toBe(session)
    expect(state.visibleCount).toBeGreaterThan(previous)
    expect(state.data.items.slice(0, previous)).toEqual(session.items.slice(0, previous))
    previous = state.visibleCount
  }
  cancel()
})
test('a failure after partial rendering retains its prefix and asset URLs until unmount', async () => {
  prepare()
  const states: import('../../lib/science-package/load').ReplayState[] = []
  const cancel = loadReplay('case', info, (state) => states.push(state))
  await tick()
  const worker = TestWorker.instances[0]
  worker.emit({
    type: 'resources',
    resources: [{ id: 'science-asset:0', blob: new Blob(['asset']) }]
  })
  worker.emit({ type: 'ready', data: session })
  const before = states.at(-1)
  worker.emit({ type: 'error', message: 'Worker disconnected' })
  const failed = states.at(-1)
  expect(failed).toMatchObject({ status: 'error', message: 'Worker disconnected', data: session })
  expect(failed && 'visibleCount' in failed && failed.visibleCount).toBe(
    before && 'visibleCount' in before && before.visibleCount
  )
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  const count = states.length
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(states).toHaveLength(count)
  cancel()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
})
test('unmount cancels a partially rendered replay without publishing later blocks', async () => {
  prepare()
  const states: import('../../lib/science-package/load').ReplayState[] = []
  const cancel = loadReplay('case', info, (state) => states.push(state))
  await tick()
  const worker = TestWorker.instances[0]
  worker.emit({ type: 'ready', data: session })
  cancel()
  const count = states.length
  await new Promise((resolve) => setTimeout(resolve, 40))
  expect(states).toHaveLength(count)
  expect(worker.terminate).toHaveBeenCalledTimes(1)
})

test('independent review failure and retry never replace the ready transcript', async () => {
  prepare()
  const states: import('../../lib/science-package/load').ReplayState[] = []
  const reviews = mock(() => {})
  const cancel = loadReplay('case', info, (state) => states.push(state), reviews)
  await tick()
  const worker = TestWorker.instances[0]
  worker.emit({ type: 'ready', data: session })
  await new Promise((r) => setTimeout(r, 100))
  const before = states.at(-1)
  worker.emit({ type: 'reviews', state: { status: 'error' } })
  expect(reviews).toHaveBeenLastCalledWith({ status: 'error' })
  cancel.retryReviews()
  expect(worker.postMessage).toHaveBeenLastCalledWith({ type: 'retry-reviews' })
  worker.emit({ type: 'reviews', state: { status: 'ready', reviews: [] } })
  expect(states.at(-1)).toBe(before)
  expect(before).toEqual({ status: 'ready', data: session })
  cancel()
  const count = reviews.mock.calls.length
  worker.emit({ type: 'reviews', state: { status: 'ready', reviews: [] } })
  expect(reviews.mock.calls).toHaveLength(count)
})
