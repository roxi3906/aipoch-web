import { cn } from '@/lib/utils'
import { AlertTriangle, BadgeInfo, Info, Lightbulb, XCircle } from 'lucide-react'
import { Children, cloneElement, isValidElement, type ReactNode } from 'react'

interface CalloutProps {
  children?: ReactNode
  // Injected by the Markdown renderer to assign a stable order to untyped callouts within each document.
  getUntypedCalloutOrder?: () => number
}

type CalloutType = 'info' | 'warning' | 'tip' | 'danger' | 'note'
type UntypedCalloutVariant = 'blue' | 'purple' | 'green'

const untypedCalloutVariants: UntypedCalloutVariant[] = ['blue', 'purple', 'green']

const icons: Record<CalloutType, typeof Info> = {
  info: Info,
  note: BadgeInfo,
  warning: AlertTriangle,
  tip: Lightbulb,
  danger: XCircle
}

const styles: Record<CalloutType, string> = {
  info: 'bg-zinc-50/50 text-zinc-900',
  note: 'bg-blue-50/50 text-blue-900',
  warning: 'bg-amber-50/40 text-amber-900',
  tip: 'bg-green-50/40 text-green-900',
  danger: 'bg-red-50/40 text-red-900'
}

const iconColors: Record<CalloutType, string> = {
  info: 'text-zinc-500',
  note: 'text-blue-500',
  warning: 'text-amber-500',
  tip: 'text-green-500',
  danger: 'text-red-500'
}

const untypedStyle = 'bg-zinc-50/50 text-zinc-900'

const calloutPattern = /^\[!\s*(info|note|warning|tip|danger)\s*\]\s*/i

function processText(text: string): { type: CalloutType | null; text: string } {
  const match = text.match(calloutPattern)
  if (match) {
    const type = match[1].toLowerCase() as CalloutType
    const remainingText = text.replace(calloutPattern, '').trim()
    return { type, text: remainingText }
  }
  return { type: null, text }
}

function processElement(element: ReactNode): { type: CalloutType | null; element: ReactNode } {
  if (!isValidElement(element)) {
    return { type: null, element }
  }

  const children = (element.props as { children?: ReactNode }).children

  // Handle string children
  if (typeof children === 'string') {
    const result = processText(children)
    if (result.type) {
      return {
        type: result.type,
        element: cloneElement(element, {}, result.text || undefined)
      }
    }
  }

  // Handle array children
  if (Array.isArray(children) && children.length > 0 && typeof children[0] === 'string') {
    const result = processText(children[0])
    if (result.type) {
      const newChildren = result.text ? [result.text, ...children.slice(1)] : children.slice(1)
      return {
        type: result.type,
        element: cloneElement(element, {}, newChildren.length === 1 ? newChildren[0] : newChildren)
      }
    }
  }

  return { type: null, element }
}

function extractCalloutType(children: ReactNode): { type: CalloutType | null; content: ReactNode } {
  let type: CalloutType | null = null
  let content: ReactNode = children

  const childArray = Children.toArray(children)

  // Filter out whitespace-only strings
  const meaningfulChildren = childArray.filter((child) => {
    if (typeof child === 'string') {
      return child.trim().length > 0
    }
    return true
  })

  if (meaningfulChildren.length === 0) {
    return { type, content }
  }

  // Try each child to find callout marker
  for (let i = 0; i < meaningfulChildren.length; i++) {
    const child = meaningfulChildren[i]

    // Direct string
    if (typeof child === 'string') {
      const result = processText(child)
      if (result.type) {
        type = result.type
        const newArray = [...meaningfulChildren]
        if (result.text) {
          newArray[i] = result.text
        } else {
          newArray.splice(i, 1)
        }
        content = newArray.length === 1 ? newArray[0] : newArray
        return { type, content }
      }
    }

    // Element (like <p>)
    if (isValidElement(child)) {
      const result = processElement(child)
      if (result.type) {
        type = result.type
        const newArray: ReactNode[] = [...meaningfulChildren]
        newArray[i] = result.element
        content = newArray.length === 1 ? newArray[0] : newArray
        return { type, content }
      }
    }
  }

  return { type, content }
}

export function Callout({ children, getUntypedCalloutOrder }: CalloutProps) {
  const { type, content } = extractCalloutType(children)
  const Icon = type ? icons[type] : null
  const iconColor = type ? iconColors[type] : undefined
  // Only untyped callouts rotate through blue, purple, and green; explicit types retain their styles and icons.
  const variant =
    type === null
      ? untypedCalloutVariants[(getUntypedCalloutOrder?.() ?? 0) % untypedCalloutVariants.length]
      : undefined

  return (
    <blockquote
      data-callout={type ?? undefined}
      data-callout-variant={variant}
      className={cn('my-6 border-l-4', type ? styles[type] : untypedStyle)}
    >
      <div className="flex items-start gap-3 py-4 pr-4">
        {Icon ? <Icon className={cn('size-5 shrink-0', iconColor)} /> : null}
        <div className="text-sm leading-normal">{content}</div>
      </div>
    </blockquote>
  )
}

export function createOrderedCallout() {
  let nextUntypedCalloutOrder = 0

  return function OrderedCallout({ children }: CalloutProps) {
    // Keep the counter in a closure instead of React context so this Markdown rendering path can remain a Server Component.
    return <Callout getUntypedCalloutOrder={() => nextUntypedCalloutOrder++}>{children}</Callout>
  }
}

/** Blog article quotes match Figma 1644:594 instead of rotating callout colors. */
export function BlogArticleQuote({ children }: { children?: ReactNode }) {
  return (
    <blockquote className="my-2 border-l-4 border-solid border-[#736761] bg-[#f4f2ec] pl-4">
      <div className="py-2 pr-4 text-sm leading-[22px] text-[#6b6b66] [&_p]:m-0">{children}</div>
    </blockquote>
  )
}
