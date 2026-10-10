/**
 * Normalized render model for imported open-science session packages.
 *
 * Shared between `scripts/import-session-package.ts` (producer) and the
 * use-cases renderer under `app/(commonLayout)/open-science/use-cases`
 * (consumer). Keep this file free of runtime code.
 */

export interface UseCaseAsset {
  url: string
  filename: string
  sizeBytes: number
  kind: string
}

export interface NormalizedOutput {
  type: string
  name?: string
  text?: string
  data?: Record<string, string>
  [key: string]: unknown
}

export interface NormalizedRun {
  runId: string
  status: string
  script?: string
  text?: string
  cellId?: string
  startedAt?: number
  endedAt?: number
  outputs: NormalizedOutput[]
}

export interface NormalizedActivity {
  id: string
  title: string
  providerToolName?: string
  toolKind?: string
  status: string
  toolDisposition?: string
  createdAt: number
  updatedAt: number
  input?: unknown
  output?: unknown
  contentBlocks?: unknown[]
  locations?: { path: string; line?: number | null }[]
  run?: NormalizedRun
  /** Present only in the essential tier when oversized payloads were shortened. */
  essentialTruncated?: boolean
}

export interface MessageArtifact {
  name: string
  mimeType?: string
  size?: number
  url?: string
  /** Essential tier only: the file ships in the full tier, so no URL here. */
  fullOnly?: boolean
}

export type TranscriptItem =
  | {
      type: 'message'
      id: string
      role: 'user' | 'assistant'
      content: string
      status: string
      createdAt: number
      completedAt?: number
      parts?: unknown[]
      artifacts?: MessageArtifact[]
    }
  | {
      type: 'elicitation'
      id: string
      message: string
      fields: unknown[]
      status: string
      createdAt: number
      /** Present when the user responded in the original session. */
      state?: string
      answers?: { fieldId: string; value: unknown }[]
      respondedAt?: number
    }
  | { type: 'activity-group'; id: string; activities: NormalizedActivity[] }

export interface UseCaseSession {
  schemaVersion: 1
  slug: string
  title: string
  description?: string
  projectName: string
  exportedAt: number
  sessionCreatedAt: number
  items: TranscriptItem[]
  assets: Record<string, UseCaseAsset>
  omissions: string[]
  excludedFiles: { storageKey: string; filename: string; sizeBytes: number }[]
}

export interface UseCaseIndexEntry {
  slug: string
  title: string
  description?: string
  exportedAt?: number
  /** Optional taxonomy label shown as a pill (e.g. "Agriculture"). */
  category?: string
  /** Gallery card visual on the list page. */
  preview?: UseCasePreview
  /** Publisher-designated report file; the detail page prefers its own payload. */
  report?: UseCaseReportRef
}

export interface UseCasePreview {
  /** Card visual: first notebook figure, else first image artifact. */
  image?: string
}

export interface UseCaseReportRef {
  /** Direct URL to the report file (PDF or markdown). */
  url: string
  /** Printed page count, shown as "19-page report" in the detail meta line. */
  pageCount?: number
  /**
   * Markdown source rendered as the detail page body. Designated by the data
   * side (CDN pipeline); the frontend never picks a file itself.
   */
  contentUrl?: string
}

/** Detail metadata derived from the shared manifest snapshot. */
export interface UseCaseDetail {
  slug: string
  title: string
  description?: string
  exportedAt?: number
  package?: UseCasePackage
  introductionUrl?: string
  /** Taxonomy label shown as a pill in the detail header. */
  category?: string
  /** Cover image for the hero card. */
  coverImage?: string
  /** Number of image figures the session produced. */
  figureCount?: number
  /** Publisher/data-side designated report; every field is optional. */
  report?: {
    /** Markdown source rendered as the page body ("What this research found"). */
    contentUrl?: string
    /** Original file behind the "Read the full report" button. */
    url?: string
    /** Printed page count, shown as "N-page report" in the meta line. */
    pageCount?: number
  }
}

export interface UseCasePackage {
  /** Published metadata and content-addressed objects used for browser replay. */
  extractedBaseUrl?: string
  url: string
  filename: string
  sizeBytes: number
  sha256: string
}

export interface UseCaseManifestEntry extends UseCaseIndexEntry {
  package: UseCasePackage
  introductionUrl?: string
}

export interface UseCaseManifestResource {
  file_name: string
  bytes: number
  sha256: string
  /** Unused source metadata; it is neither required nor validated. */
  path?: unknown
}

export interface UseCaseManifestItem {
  title: string
  name: string
  cover: UseCaseManifestResource
  case: UseCaseManifestResource & { release_url: string }
  introduction?: UseCaseManifestResource
}
