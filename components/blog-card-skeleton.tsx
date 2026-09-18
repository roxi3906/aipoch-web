import { Skeleton } from '@/components/ui/skeleton'

/** Blog card skeleton while loading more posts via Show more. */
export function BlogCardSkeleton() {
  return (
    <div className="flex h-[360px] flex-col justify-between border border-[#e5e7eb] bg-white p-6">
      <Skeleton className="h-6 w-32 rounded-none bg-black/5" />
      <div className="space-y-3">
        <Skeleton className="h-7 w-full rounded bg-black/5" />
        <Skeleton className="h-7 w-4/5 rounded bg-black/5" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-full rounded bg-black/5" />
        <Skeleton className="h-4 w-full rounded bg-black/5" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-4 w-20 rounded bg-black/5" />
      </div>
    </div>
  )
}
