import type { ReplayReview, UseCasePackage, UseCaseSession } from '../use-case-types'
import type { PackageProgress } from './archive'

export type ReviewState =
  | { status: 'loading' }
  | { status: 'ready'; reviews: ReplayReview[] }
  | { status: 'error' }

export type WorkerRequest =
  | { type: 'load'; slug: string; info: UseCasePackage }
  | { type: 'retry-reviews' }
  | { type: 'urls'; urls: Record<string, string> }
export type WorkerReply =
  | { type: 'reviews'; state: ReviewState }
  | { type: 'progress'; progress: PackageProgress }
  | { type: 'resources'; resources: { id: string; blob: Blob }[] }
  | { type: 'ready'; data: UseCaseSession }
  | { type: 'error'; message: string }
