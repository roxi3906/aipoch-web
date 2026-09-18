'use client'

import dynamic from 'next/dynamic'
import Image, { type StaticImageData } from 'next/image'
import type { FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

import discordIcon from './assets/discord.svg'
import reproducibleIcon from './assets/reproducible.svg'
import researchBackground from './assets/research-background.png'
import traceableIcon from './assets/traceable.svg'
import verifiableIcon from './assets/verifiable.svg'
import type {
  MedFlowRedesignPreviewResult,
  MedFlowRedesignPreviewState
} from './medflow-redesign-state'

const MedFlowRedesignConfetti = dynamic(
  () => import('./medflow-redesign-confetti').then((module) => module.MedFlowRedesignConfetti),
  { ssr: false }
)

const previewFields: Record<
  MedFlowRedesignPreviewState,
  { consent: boolean; email: string; name: string }
> = {
  default: { consent: false, email: '', name: '' },
  typing: { consent: true, email: 'maya.chen@research.', name: 'Dr. Maya Ch' },
  completed: {
    consent: true,
    email: 'maya.chen@research.org',
    name: 'Dr. Maya Chen'
  },
  error: { consent: true, email: 'maya.chen@', name: 'Dr. Maya Chen' },
  submitting: {
    consent: true,
    email: 'maya.chen@research.org',
    name: 'Dr. Maya Chen'
  },
  success: {
    consent: true,
    email: 'maya.chen@research.org',
    name: 'Dr. Maya Chen'
  },
  server: {
    consent: true,
    email: 'maya.chen@research.org',
    name: 'Dr. Maya Chen'
  },
  duplicate: {
    consent: true,
    email: 'maya.chen@research.org',
    name: 'Dr. Maya Chen'
  }
}

const formMessages: Partial<Record<MedFlowRedesignPreviewState, string>> = {
  duplicate: 'This email is already on the waitlist.',
  error: 'Enter a valid email address.',
  server: 'We couldn’t submit your request. Please try again.',
  submitting: 'Requesting…'
}

const errorStates = new Set<MedFlowRedesignPreviewState>(['error', 'server', 'duplicate'])

const principles: ReadonlyArray<{
  body: string
  icon: StaticImageData
  number: string
  title: string
}> = [
  {
    body: 'The same question, taken down the same path, returns the same answer — today, and a year from now.',
    icon: reproducibleIcon,
    number: '01',
    title: 'REPRODUCIBLE'
  },
  {
    body: "Confidence isn't an afterthought. It's built in long before you ever begin.",
    icon: verifiableIcon,
    number: '02',
    title: 'VERIFIABLE'
  },
  {
    body: 'Every step is accounted for and open to scrutiny — ready for any reviewer, any question.',
    icon: traceableIcon,
    number: '03',
    title: 'TRACEABLE'
  }
]

const DiscordIcon = () => (
  <Image className="mf-redesign-icon" src={discordIcon} alt="" width={18} height={18} />
)

type MedFlowRedesignExperienceProps = {
  initialState?: MedFlowRedesignPreviewState
  submissionResult?: MedFlowRedesignPreviewResult
}

export const MedFlowRedesignExperience = ({
  initialState = 'default',
  submissionResult = 'success'
}: MedFlowRedesignExperienceProps) => {
  const initialFields = previewFields[initialState]
  const [name, setName] = useState(initialFields.name)
  const [email, setEmail] = useState(initialFields.email)
  const [consent, setConsent] = useState(initialFields.consent)
  const [focusedField, setFocusedField] = useState<'email' | 'name' | null>(null)
  const [status, setStatus] = useState<MedFlowRedesignPreviewState>(initialState)
  const nameRef = useRef<HTMLInputElement>(null)
  const successRef = useRef<HTMLDivElement>(null)
  const submissionTimerRef = useRef<number | null>(null)

  const ready = Boolean(name.trim() && email.trim() && consent)
  const busy = status === 'submitting'
  const success = status === 'success'
  const message = formMessages[status]
  const hasError = errorStates.has(status)
  const formState =
    status !== 'default'
      ? status
      : focusedField || name || email || consent
        ? ready
          ? 'completed'
          : 'typing'
        : 'default'

  useEffect(() => {
    if (success) successRef.current?.focus()
  }, [success])

  useEffect(
    () => () => {
      if (submissionTimerRef.current !== null) window.clearTimeout(submissionTimerRef.current)
    },
    []
  )

  const resetStatus = () => setStatus('default')

  const focusNameField = () => {
    resetStatus()
    window.requestAnimationFrame(() => nameRef.current?.focus())
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!ready || busy) return

    setFocusedField(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setStatus('error')
      return
    }

    setStatus('submitting')
    // This authorized preview demonstrates the original states; it does not transmit form data.
    submissionTimerRef.current = window.setTimeout(() => {
      setStatus(submissionResult)
      submissionTimerRef.current = null
    }, 1400)
  }

  return (
    <div className="mf-redesign-shell" data-state={formState}>
      <div className="mf-redesign-background" aria-hidden="true">
        <Image
          src={researchBackground}
          alt=""
          fill
          preload
          sizes="(max-width: 900px) 100vw, 760px"
        />
      </div>

      <section className="mf-redesign-intro" aria-labelledby="mf-redesign-title">
        <p className="mf-redesign-eyebrow">A NEW SIGNAL IS COMING</p>
        <h1 id="mf-redesign-title">MEDFLOW</h1>
        <p className="mf-redesign-coming">COMING SOON</p>
        <p className="mf-redesign-lead">
          We're engineering a new way to turn the complexity of research into clarity you can trust.
        </p>
        <div className="mf-redesign-actions">
          <button
            className="mf-redesign-button mf-redesign-primary"
            type="button"
            onClick={focusNameField}
          >
            Join the waitlist <span aria-hidden="true">→</span>
          </button>
          <a
            className="mf-redesign-button"
            href="https://discord.gg/zxQAYjReRv"
            target="_blank"
            rel="noreferrer"
          >
            <DiscordIcon /> Join Discord
          </a>
        </div>
        <h2 className="mf-redesign-promise">
          Not just <em>faster.</em>
          <br />
          Built to be <em>certain.</em>
        </h2>
        <p className="mf-redesign-lead">
          MedFlow is the next signal from AIPOCH. We're not ready to reveal everything yet — but we
          can tell you what it's built on. Three things we refuse to compromise on.
        </p>
      </section>

      <section
        id="mf-redesign-waitlist"
        className="mf-redesign-card"
        aria-labelledby={success ? undefined : 'mf-redesign-waitlist-title'}
      >
        {success ? (
          <div
            ref={successRef}
            className="mf-redesign-success"
            role="status"
            aria-live="polite"
            aria-labelledby="mf-redesign-success-title"
            tabIndex={-1}
          >
            <div className="mf-redesign-check" aria-hidden="true">
              ✓
            </div>
            <h2 id="mf-redesign-success-title" className="mf-redesign-success-title">
              <span className="mf-redesign-success-prefix">You're in,&nbsp;</span>
              <span className="mf-redesign-success-name" title={name.trim()}>
                {name.trim()}
              </span>
              <span className="mf-redesign-success-suffix">!</span>
            </h2>
            <p>When MedFlow enters beta, you'll be among the very first to get in.</p>
            <p>
              Keep an eye on your inbox — that's where your <strong>activation code</strong> will
              arrive.
            </p>
            <p className="mf-redesign-activation">🔑 Your activation code ships at launch</p>
            <p>
              While you wait — <strong>join the community</strong> and follow along:
            </p>
            <div className="mf-redesign-actions mf-redesign-success-actions">
              <a
                className="mf-redesign-button mf-redesign-primary"
                href="https://discord.gg/zxQAYjReRv"
                target="_blank"
                rel="noreferrer"
              >
                <DiscordIcon /> Join our Discord
              </a>
              <a
                className="mf-redesign-button"
                href="https://x.com/aipoch_ai"
                target="_blank"
                rel="noreferrer"
              >
                <span aria-hidden="true">𝕏</span> Follow @aipoch_ai
              </a>
            </div>
            <div className="mf-redesign-success-bottom">
              <span>SIGNAL RECEIVED</span>
              <a href="https://aipoch.com/">Explore AIPOCH →</a>
            </div>
          </div>
        ) : (
          <div>
            <p className="mf-redesign-eyebrow">WAITLIST</p>
            <h2 id="mf-redesign-waitlist-title">Be first in line.</h2>
            <p>
              When MedFlow opens its private beta, everyone on the waitlist becomes one of our{' '}
              <strong>first testers</strong>. Leave your name and email — the moment we launch, your{' '}
              <strong>activation code</strong> lands straight in your inbox.
            </p>
            <form aria-label="MedFlow early access" onSubmit={submit} noValidate>
              <label>
                <span className="mf-redesign-field-label">Your name</span>
                <input
                  ref={nameRef}
                  aria-label="Your name"
                  placeholder="Your name"
                  name="name"
                  value={name}
                  disabled={busy}
                  onChange={(event) => {
                    setName(event.target.value)
                    resetStatus()
                  }}
                  onFocus={() => {
                    setFocusedField('name')
                    resetStatus()
                  }}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="name"
                />
              </label>
              <label>
                <span className="mf-redesign-field-label">Email address</span>
                <input
                  aria-label="Email address"
                  placeholder="Email address"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  disabled={busy}
                  aria-invalid={status === 'error'}
                  aria-describedby={message ? 'mf-redesign-form-message' : undefined}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    resetStatus()
                  }}
                  onFocus={() => {
                    setFocusedField('email')
                    resetStatus()
                  }}
                  onBlur={() => setFocusedField(null)}
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                />
              </label>
              <label className="mf-redesign-consent">
                <input
                  aria-label="I agree to the processing of my data described in the Privacy Policy"
                  name="consent"
                  type="checkbox"
                  checked={consent}
                  disabled={busy}
                  onChange={(event) => {
                    setConsent(event.target.checked)
                    resetStatus()
                  }}
                />
                <span>
                  You hereby acknowledge and agree that your above data will be processed by AIPOCH
                  PTE. LTD. for the purpose of processing your request and sending you a trial
                  activation code when MedFlow's private beta is ready. For additional information
                  please check our{' '}
                  <a href="https://aipoch.com/privacy-policy" target="_blank" rel="noreferrer">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>
              {message && (
                <p
                  id="mf-redesign-form-message"
                  className={hasError ? 'mf-redesign-error' : 'mf-redesign-progress'}
                  role={hasError ? 'alert' : 'status'}
                  aria-live="polite"
                >
                  {message}
                </p>
              )}
              <button type="submit" disabled={!ready || busy}>
                {busy ? 'Requesting…' : 'Request early access'}{' '}
                {!busy && <span aria-hidden="true">→</span>}
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="mf-redesign-principles" aria-label="MedFlow principles">
        {principles.map(({ body, icon, number, title }) => (
          <article key={number}>
            <span>{number}</span>
            <h2>
              <Image src={icon} alt="" width={21} height={21} />
              {title}
            </h2>
            <p>{body}</p>
          </article>
        ))}
      </section>

      <MedFlowRedesignConfetti active={success} />
    </div>
  )
}
