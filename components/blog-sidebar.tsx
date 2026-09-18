import { ArrowRight } from 'lucide-react'
import Link from 'next/link'

export function BlogSidebarCTA() {
  return (
    <div className="flex w-full flex-col gap-3 border border-[#dad8ce] bg-[#f4f2ec] p-5 text-[#111]">
      <h3 className="text-sm font-semibold leading-5">Ready to apply this?</h3>
      <p className="pb-3 pt-2 text-sm leading-5 text-[#6b6b66]">
        Browse our library of pre-built skills and start automating your research workflows today.
      </p>
      <Link
        href="/agent-skills"
        aria-label="Explore pre-built agent skills"
        className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#1a1a1a] px-4 text-sm font-medium uppercase leading-5 text-white transition-opacity duration-150 ease-out hover:opacity-80"
      >
        EXPLORE SKILLS
        <ArrowRight className="size-4 shrink-0" aria-hidden />
      </Link>
    </div>
  )
}
