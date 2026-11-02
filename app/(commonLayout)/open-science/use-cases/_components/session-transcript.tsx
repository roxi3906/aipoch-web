import { createContext, useContext, useMemo } from 'react'
import { reviewerResponseStates } from '@/lib/science-package/reviewer'
import type { NormalizedActivity, ReplayReview, UseCaseSession } from '@/lib/use-case-types'
import { SessionActivityGroup } from './activity-group'
import { SessionCompactionItem } from './compaction-item'
import { SessionElicitationCard } from './elicitation-card'
import { FilePreviewProvider } from './file-preview'
import { SessionMessageItem } from './message-item'
import { PlanCard } from './plan-card'
import { projectGeneratePlanActivity } from './plan-projection'
import { ReviewerCard } from './reviewer-card'

// The "Completed" footer is a turn-level marker in the app: it appears once at
// the end of each turn (the last assistant message before the next user
// message), not under every assistant message.
const turnFinalMessageIds = (items: UseCaseSession['items']): Set<string> => {
  const ids = new Set<string>()
  let lastAssistantId: string | undefined
  const flush = () => {
    if (lastAssistantId) ids.add(lastAssistantId)
    lastAssistantId = undefined
  }
  for (const item of items) {
    if (item.type !== 'message') continue
    if (item.role === 'user') flush()
    else lastAssistantId = item.id
  }
  flush()
  return ids
}

// Standalone plan block: the app's plan-activity header plus the ported card
// body; no group or row chrome around it.
const SessionPlanItem = ({ activity }: { activity: NormalizedActivity }) => {
  const projection = projectGeneratePlanActivity(activity)
  return (
    <div className="px-4 pb-0.5 pt-2.5 md:px-6">
      <div className="w-full overflow-hidden rounded-[14px] bg-bg-200/70 px-1.5 py-1">
        <div className="flex items-center gap-2 py-[5px] pl-1.5 pr-2.5 text-[13px]">
          <span className="min-w-0 truncate text-left font-medium text-text-000">
            {projection.heading}
          </span>
        </div>
        <PlanCard projection={projection} />
      </div>
    </div>
  )
}

// Only these slots subscribe to late review data; finalized message elements stay cached.
const EMPTY_REVIEWS: ReplayReview[] = []
const ReviewContext = createContext<ReplayReview[]>(EMPTY_REVIEWS)
const MessageReviews = ({ messageId }: { messageId: string }) => {
  const reviews = useContext(ReviewContext).filter((review) => review.anchorMessageId === messageId)
  return reviews.length ? (
    <section aria-label="Message reviews">
      {reviews.map((review) => (
        <ReviewerCard key={review.id} review={review} />
      ))}
    </section>
  ) : null
}

// Read-only replay of one exported Open-Science session. The centered column matches the app's
// transcript width (max-w-4xl = 56rem); each row carries the app's own horizontal padding.
export const SessionTranscript = ({
  session,
  visibleCount = session.items.length,
  reviews = session.reviews ?? EMPTY_REVIEWS
}: {
  session: UseCaseSession
  visibleCount?: number
  reviews?: ReplayReview[]
}) => {
  // Cache finalized row elements and full-context markers so revealing more blocks does not
  // rerun earlier Markdown/renderers or recalculate turn/group boundaries.
  const rows = useMemo(() => {
    const turnFinal = turnFinalMessageIds(session.items)
    const correctionStates = reviewerResponseStates(session.items)
    return session.items.map((item) => {
      // content-visibility skips rendering for offscreen rows — the main
      // lever against long-transcript jank (the app does the same).
      const rowClassName = '[content-visibility:auto] [contain-intrinsic-size:auto_240px]'
      if (item.type === 'compaction') {
        return (
          <div key={item.id} data-replay-block={item.id} className={rowClassName}>
            <SessionCompactionItem item={item} />
          </div>
        )
      }
      if (item.type === 'message') {
        return (
          <div key={item.id} data-replay-block={item.id} className={rowClassName}>
            <SessionMessageItem
              message={item}
              showTurnCompletion={turnFinal.has(item.id)}
              reviewerCorrectionState={correctionStates.get(item.id)}
            />
            <MessageReviews messageId={item.id} />
          </div>
        )
      }
      if (item.type === 'activity-group') {
        return (
          <div key={item.id} data-replay-block={item.id} className={rowClassName}>
            <SessionActivityGroup activities={item.activities} assets={session.assets} />
          </div>
        )
      }
      if (item.type === 'plan') {
        return (
          <div key={item.id} data-replay-block={item.id} className={rowClassName}>
            <SessionPlanItem activity={item.activity} />
          </div>
        )
      }
      return (
        <div key={item.id} data-replay-block={item.id} className={rowClassName}>
          <SessionElicitationCard item={item} />
        </div>
      )
    })
  }, [session])
  return (
    <div className="osp-session text-text-000">
      <FilePreviewProvider>
        <ReviewContext.Provider value={reviews}>
          <div className="mx-auto w-full max-w-4xl pb-4 pt-4">{rows.slice(0, visibleCount)}</div>
        </ReviewContext.Provider>
      </FilePreviewProvider>
    </div>
  )
}
