import '@/components/landing/landing-effects.css'
import './medflow-redesign.css'
import type { Metadata } from 'next'
import { MedFlowRedesignExperience } from './medflow-redesign-experience'
import { resolveMedFlowRedesignResult, resolveMedFlowRedesignState } from './medflow-redesign-state'

export const metadata: Metadata = {
  title: 'MedFlow redesign — A new signal is coming · AIPOCH',
  description:
    'Explore the MedFlow redesign preview from AIPOCH and join the waitlist for a new way to turn research complexity into clarity.',
  alternates: {
    canonical: 'https://aipoch.com/medflow-redesign'
  },
  openGraph: {
    title: 'MedFlow redesign — A new signal is coming · AIPOCH',
    description:
      'Explore the MedFlow redesign preview from AIPOCH and join the waitlist for a new way to turn research complexity into clarity.',
    url: 'https://aipoch.com/medflow-redesign',
    siteName: 'AIPOCH',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MedFlow redesign — A new signal is coming · AIPOCH',
    description:
      'Explore the MedFlow redesign preview from AIPOCH and join the waitlist for a new way to turn research complexity into clarity.'
  }
}

type MedFlowRedesignPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

const MedFlowRedesignPage = async ({ searchParams }: MedFlowRedesignPageProps = {}) => {
  const parameters = (await searchParams) ?? {}

  // Authorized preview: intentionally excluded from the sitemap by product approval.
  // This authorized preview is intentionally independent from the production /medflow page.
  return (
    <main
      id="top"
      className="medflow-redesign-page min-h-screen overflow-hidden bg-[#f6f6f4] text-[#111111]"
    >
      <MedFlowRedesignExperience
        initialState={resolveMedFlowRedesignState(parameters.state)}
        submissionResult={resolveMedFlowRedesignResult(parameters.result)}
      />
    </main>
  )
}

export default MedFlowRedesignPage
