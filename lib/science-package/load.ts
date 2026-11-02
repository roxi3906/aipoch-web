import { waitForBrowserMock } from '../../mocks/ready'
import type { UseCasePackage, UseCaseSession } from '../use-case-types'
import type { PackageProgress } from './archive'
import type { ReviewState, WorkerReply } from './protocol'

export type ReplayState =
  | { status: 'loading'; progress: PackageProgress }
  | { status: 'rendering'; data: UseCaseSession; visibleCount: number }
  | { status: 'ready'; data: UseCaseSession }
  | { status: 'error'; message: string; data?: UseCaseSession; visibleCount?: number }

export function loadReplay(
  slug: string,
  info: UseCasePackage,
  update: (state: ReplayState) => void,
  updateReviews: (state: ReviewState) => void = () => {}
) {
  const urls: string[] = []
  let worker: Worker | undefined
  let active = true
  let bodyFinished = false
  let reviewsFinished = false
  let reviewState: ReviewState = { status: 'loading' }
  let prepared: UseCaseSession | undefined
  let visibleCount = 0
  let renderTimer: ReturnType<typeof setTimeout> | undefined
  const stop = () => {
    clearTimeout(renderTimer)
    renderTimer = undefined
    worker?.terminate()
    worker = undefined
  }
  const release = () => {
    stop()
    for (const url of urls) URL.revokeObjectURL(url)
    urls.length = 0
  }
  const fail = (message: string) => {
    if (!active) return
    active = false
    if (visibleCount > 0) stop()
    else release()
    console.error('[use-case-replay] load.failed', { slug, message })
    update({
      status: 'error',
      message,
      ...(visibleCount > 0 ? { data: prepared, visibleCount } : {})
    })
  }
  // Body ordering, compaction filtering and body dependencies settle before any block.
  // Keep the full model for turn/reviewer context; only the visible prefix grows.
  const reveal = () => {
    if (!active || !prepared) return
    visibleCount = Math.min(visibleCount + 8, prepared.items.length)
    if (visibleCount === prepared.items.length) {
      bodyFinished = true
      if (reviewsFinished) {
        active = false
        stop()
      }
      update({ status: 'ready', data: prepared })
    } else {
      update({ status: 'rendering', data: prepared, visibleCount })
      if (active) renderTimer = setTimeout(reveal, 16)
    }
  }
  updateReviews(reviewState)
  update({
    status: 'loading',
    progress: { stage: info.extractedBaseUrl ? 'metadata' : 'downloading' }
  })
  void (async () => {
    try {
      await waitForBrowserMock()
      if (!active) return
      worker = new Worker(new URL('./replay.worker.ts', import.meta.url), { type: 'module' })
      worker.onerror = (event) =>
        fail(
          event.message ||
            'The package worker could not run. Retry or use a browser with Web Worker and gzip support.'
        )
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (!active) return
        if (data.type === 'reviews') {
          reviewState = data.state
          reviewsFinished = data.state.status === 'ready'
          updateReviews(data.state)
          if (bodyFinished && reviewsFinished) {
            active = false
            stop()
          }
        } else if (data.type === 'error') fail(data.message)
        else if (prepared) return
        else if (data.type === 'progress') update({ status: 'loading', progress: data.progress })
        else if (data.type === 'resources') {
          try {
            const mapping = Object.fromEntries(
              data.resources.map(({ id, blob }) => {
                const url = URL.createObjectURL(blob)
                urls.push(url)
                return [id, url]
              })
            )
            worker?.postMessage({ type: 'urls', urls: mapping })
          } catch (error) {
            fail(error instanceof Error ? error.message : 'Could not create package resources.')
          }
        } else {
          prepared = data.data
          reveal()
        }
      }
      worker.postMessage({ type: 'load', slug, info })
    } catch (error) {
      if (active)
        fail(error instanceof Error ? error.message : 'Could not start the package worker.')
    }
  })()
  const cancel = () => {
    active = false
    release()
  }
  return Object.assign(cancel, {
    retryReviews: () => {
      if (!active || reviewState.status !== 'error' || !worker) return
      reviewState = { status: 'loading' }
      updateReviews(reviewState)
      worker.postMessage({ type: 'retry-reviews' })
    }
  })
}
