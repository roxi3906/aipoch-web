import type { ReplayReview, UseCaseSession } from '../use-case-types'
import { prepareReplayPackage } from './extracted'
import type { WorkerReply, WorkerRequest } from './protocol'

const send = (message: WorkerReply) => self.postMessage(message)
let parsed: UseCaseSession | undefined
let reviewLoader: (() => Promise<ReplayReview[]>) | undefined
let reviewsPending = false
const loadReviews = async () => {
  if (!reviewLoader || reviewsPending) return
  reviewsPending = true
  send({ type: 'reviews', state: { status: 'loading' } })
  try {
    const reviews = await reviewLoader()
    send({ type: 'reviews', state: { status: 'ready', reviews } })
    reviewLoader = undefined
  } catch {
    // Network/association failures are isolated from the already finalized transcript.
    send({ type: 'reviews', state: { status: 'error' } })
  } finally {
    reviewsPending = false
  }
}
self.onmessage = async ({ data }: MessageEvent<WorkerRequest>) => {
  try {
    if (data.type === 'load') {
      const result = await prepareReplayPackage(data.info, data.slug, (progress) =>
        send({ type: 'progress', progress })
      )
      reviewLoader = result.loadReviews
      parsed = result.session
      send({ type: 'resources', resources: result.resources })
    } else if (data.type === 'retry-reviews') {
      await loadReviews()
    } else if (data.type === 'urls' && parsed) {
      // Blob URLs are owned by the page so they survive worker termination.
      const resolve = (value: unknown): unknown => {
        if (typeof value === 'string')
          return value.replace(/science-asset:\d+/g, (id) => data.urls[id] ?? '')
        if (Array.isArray(value)) return value.map(resolve)
        if (value && typeof value === 'object')
          return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [key, resolve(entry)])
          )
        return value
      }
      send({ type: 'ready', data: resolve(parsed) as UseCaseSession })
      parsed = undefined
      void loadReviews()
    }
  } catch (error) {
    send({
      type: 'error',
      message: error instanceof Error ? error.message : 'Package parsing failed.'
    })
  }
}
