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
  /** Links the tool call to its notebook run record (app: executionInvocationId). */
  executionInvocationId?: string
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

/** A file the user attached to a message; url is present only when the package bundles the bytes. */
export interface MessageUpload {
  name: string
  mimeType?: string
  size?: number
  url?: string
  /** Raw export fields; extracted mode derives the content URL from them. */
  id?: string
  versionId?: string
  /** True when the upload came from an @-mention part: it renders inline in
   * the message text instead of as a chip above it. */
  mention?: boolean
  /** The part's own name, when it differs from the display name; used to
   * match inline mention pills to this upload. */
  partName?: string
}

/** A PDF text-quote card sent with a user message (app: SentAnnotationCards). */
export interface MessagePdfQuoteAnnotation {
  id: string
  kind: 'quote'
  /** e.g. "StoryScope.pdf · Page 6". */
  source: string
  /** The quoted text. */
  content: string
  /** The user's note attached to the annotation. */
  note?: string
  /** Preview URL of the source PDF, when resolvable from the package. */
  url?: string
}

/** A PDF region card sent with a user message (app: SentAnnotationCards). */
export interface MessagePdfAreaAnnotation {
  id: string
  kind: 'area'
  /** e.g. "StoryScope.pdf · Page 23". */
  source: string
  /** The region's extracted text. */
  content: string
  /** Cropped region image. */
  image?: { mimeType: string; data: string }
  /** The region image was dropped to the session image budget (app notice). */
  imageOmitted?: boolean
  /** The user's note attached to the annotation. */
  note?: string
  /** Preview URL of the source PDF, when resolvable from the package. */
  url?: string
}

/** Any annotation card sent with a user message (app: SentAnnotationCards). */
export type MessageAnnotation =
  | MessagePdfQuoteAnnotation
  | MessagePdfAreaAnnotation
  | Readonly<{
      /** Quote from conversation text or a project file. */
      id: string
      kind: 'text'
      content: string
      source?: string
      note?: string
      url?: string
    }>
  | Readonly<{
      /** A marked point on an image; number is its 1-based order among image
       * points in the message (app: prepareImagePointAnnotations). */
      id: string
      kind: 'image-point'
      number: number
      /** Normalized 0–1 coordinates. */
      x: number
      y: number
      /** Natural image size, when the export retained it (pixel display). */
      naturalSize?: { width: number; height: number }
      source?: string
      note: string
      url?: string
    }>

/** Application-generated correction prompts retain a user transport role in exported history. */
export interface ReviewerCorrectionAttribution {
  kind: 'application'
  feature: 'reviewer'
  purpose: 'correction'
  causeReviewId: string
  continuation?: { round: number; maxRounds: number; findingIds: string[] }
}

export type TranscriptItem =
  | {
      /** Display-only lifecycle; provider content never crosses this boundary. */
      type: 'compaction'
      id: string
      status: 'in_progress' | 'completed' | 'failed' | 'cancelled' | 'unknown'
      createdAt: number
    }
  | {
      type: 'message'
      id: string
      role: 'user' | 'assistant'
      attribution?: ReviewerCorrectionAttribution
      responseToMessageId?: string
      content: string
      status: string
      createdAt: number
      completedAt?: number
      parts?: unknown[]
      artifacts?: MessageArtifact[]
      uploads?: MessageUpload[]
      annotations?: MessageAnnotation[]
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
  | {
      type: 'activity-group'
      id: string
      activities: NormalizedActivity[]
    }
  | {
      /** Standalone generate_plan card (app: plan-activity); never folds into groups. */
      type: 'plan'
      id: string
      activity: NormalizedActivity
    }

export interface ReplayReviewCheck {
  id: string
  kind: 'new' | 'tracked'
  status: 'pass' | 'warn' | 'fail'
  claim: string
  evidence: string
  sortIndex: number | null
  disposition?: string
  legacyAssessment?: boolean
}

export interface ReplayReview {
  id: string
  anchorMessageId: string
  lifecycle: 'running' | 'complete' | 'error'
  outcome?: 'pass' | 'flagged'
  model: string
  errorMessage?: string
  createdAt: number
  stale: boolean
  verificationUnavailable: boolean
  checks: ReplayReviewCheck[]
}

export interface UseCaseSession {
  schemaVersion: 1
  slug: string
  title: string
  description?: string
  projectName: string
  exportedAt: number
  sessionCreatedAt: number
  items: TranscriptItem[]
  reviews?: ReplayReview[]
  assets: Record<string, UseCaseAsset>
  omissions: string[]
  excludedFiles: { storageKey: string; filename: string; sizeBytes: number }[]
}

export interface UseCaseVideo {
  type: 'youtube'
  id: string
  title?: string
}

export interface UseCaseIndexEntry {
  video?: UseCaseVideo
  slug: string
  title: string
  description?: string
  exportedAt?: number
  /** Optional taxonomy label shown as a pill (e.g. "Agriculture"). */
  category?: string
  /** Taxonomy display label (manifest `catalog`, e.g. "AI Research"). */
  catalog?: string
  /** Kebab-case taxonomy key for gallery filtering (manifest `catalog_name`). */
  catalogKey?: string
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
  video?: UseCaseVideo
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
  /** Static archive URL for browser fetches; ordinary downloads may use a release URL. */
  importUrl?: string
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
  video?: { type: string; file_path: string; file_name?: string }
  title: string
  name: string
  cover: UseCaseManifestResource
  case: UseCaseManifestResource & { release_url: string }
  introduction?: UseCaseManifestResource
  /** Optional taxonomy: display label plus its kebab-case key. */
  catalog?: string
  catalog_name?: string
}
