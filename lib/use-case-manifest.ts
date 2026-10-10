import type { UseCaseManifestEntry, UseCaseManifestResource } from './use-case-types'

type ScheduleAfterResponse = (task: () => Promise<void>) => unknown
type Snapshot = { entries: UseCaseManifestEntry[]; etag: string | null }
const LOG_PREFIX = '[use-case-manifest]'

// Only schema paths, expectations and value types are safe to include in diagnostics.
class ManifestValidationError extends Error {
  readonly actualType: string

  constructor(
    readonly fieldPath: string,
    readonly expected: string,
    value: unknown
  ) {
    super(`Invalid manifest field ${fieldPath}: expected ${expected}`)
    this.name = 'ManifestValidationError'
    this.actualType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
  }
}

const record = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ManifestValidationError(path, 'object', value)
  }
  return value as Record<string, unknown>
}

const resource = (value: unknown, path: string): UseCaseManifestResource => {
  const item = record(value, path)
  if (
    typeof item.file_name !== 'string' ||
    !item.file_name.trim() ||
    item.file_name === '.' ||
    item.file_name === '..' ||
    /[/\\]/.test(item.file_name) ||
    Array.from(item.file_name).some((character) => character.charCodeAt(0) < 32)
  )
    throw new ManifestValidationError(
      `${path}.file_name`,
      'safe non-empty file name',
      item.file_name
    )
  if (!Number.isSafeInteger(item.bytes) || (item.bytes as number) < 0)
    throw new ManifestValidationError(`${path}.bytes`, 'non-negative safe integer', item.bytes)
  if (typeof item.sha256 !== 'string' || !/^[a-f\d]{64}$/i.test(item.sha256))
    throw new ManifestValidationError(`${path}.sha256`, '64 hexadecimal characters', item.sha256)
  if (
    typeof item.path !== 'string' ||
    !item.path ||
    item.path.includes('\\') ||
    Array.from(item.path).some((character) => character.charCodeAt(0) < 32) ||
    item.path.split('/').some((part) => !part || part === '.' || part === '..') ||
    /^[a-z][a-z\d+.-]*:/i.test(item.path)
  )
    throw new ManifestValidationError(`${path}.path`, 'safe relative resource path', item.path)
  return item as unknown as UseCaseManifestResource
}

const httpUrl = (value: string, path = 'manifestUrl'): URL => {
  // URL parser exceptions can echo signed URLs; replace them with value-free diagnostics.
  try {
    const url = new URL(value)
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url
  } catch {
    // Report the same safe validation error for malformed and disallowed URLs.
  }
  throw new ManifestValidationError(path, 'HTTP(S) URL without credentials', value)
}

/** Published objects use the case slug and raw file name; path is source metadata. */
export const parseUseCaseManifest = (
  value: unknown,
  manifestUrl: string
): UseCaseManifestEntry[] => {
  if (!Array.isArray(value)) throw new ManifestValidationError('$', 'array', value)
  const base = new URL('.', httpUrl(manifestUrl))
  const names = new Set<string>()
  return value.map((value, index) => {
    const path = `$[${index}]`
    const item = record(value, path)
    if (typeof item.title !== 'string' || !item.title.trim())
      throw new ManifestValidationError(`${path}.title`, 'non-empty string', item.title)
    if (typeof item.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.name))
      throw new ManifestValidationError(`${path}.name`, 'lowercase kebab-case slug', item.name)
    if (names.has(item.name))
      throw new ManifestValidationError(`${path}.name`, 'unique slug', item.name)
    names.add(item.name)
    const resourceUrl = (resource: UseCaseManifestResource) =>
      new URL(`${item.name}/${encodeURIComponent(resource.file_name)}`, base).href
    const cover = resource(item.cover, `${path}.cover`)
    const archive = resource(item.case, `${path}.case`)
    const releaseUrl = record(item.case, `${path}.case`).release_url
    if (typeof releaseUrl !== 'string')
      throw new ManifestValidationError(`${path}.case.release_url`, 'string', releaseUrl)

    return {
      slug: item.name,
      title: item.title,
      preview: { image: resourceUrl(cover) },
      package: {
        extractedBaseUrl: new URL(`${item.name}/extracted/`, base).href,
        url: releaseUrl
          ? httpUrl(releaseUrl, `${path}.case.release_url`).href
          : resourceUrl(archive),
        filename: archive.file_name,
        sizeBytes: archive.bytes,
        sha256: archive.sha256
      },
      ...(item.introduction === undefined
        ? {}
        : {
            introductionUrl: resourceUrl(resource(item.introduction, `${path}.introduction`))
          })
    }
  })
}

// Manifest entries and resource contents stay out of cache diagnostics.
const snapshotSummary = (snapshot: Snapshot | undefined) => ({
  etag: snapshot?.etag ?? null,
  count: snapshot?.entries.length ?? 0
})

// Fetch/JSON error messages and stacks may contain URLs or body fragments. Use safe
// summaries and allowlisted transport codes, including Node's nested fetch cause.
const errorSummary = (error: unknown) => {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const errorType = [
    'Error',
    'TypeError',
    'SyntaxError',
    'TimeoutError',
    'AbortError',
    'ManifestValidationError'
  ].includes(name)
    ? name
    : 'UnknownError'
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : undefined
  const code = [error, cause]
    .map((value) =>
      value && typeof value === 'object' && 'code' in value ? value.code : undefined
    )
    .find(
      (value) =>
        typeof value === 'string' &&
        [
          'ECONNRESET',
          'ECONNREFUSED',
          'ENOTFOUND',
          'EAI_AGAIN',
          'ETIMEDOUT',
          'ENETUNREACH',
          'EHOSTUNREACH',
          'CERT_HAS_EXPIRED',
          'DEPTH_ZERO_SELF_SIGNED_CERT',
          'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
          'ERR_TLS_CERT_ALTNAME_INVALID',
          'UND_ERR_CONNECT_TIMEOUT',
          'UND_ERR_HEADERS_TIMEOUT',
          'UND_ERR_BODY_TIMEOUT',
          'UND_ERR_SOCKET'
        ].includes(value)
    )
  return { errorType, ...(code ? { errorCode: code } : {}) }
}

/** One cache per manifest source in a server runtime; no TTL or eviction timer. */
export const createUseCaseManifestCache = (url: string) => {
  httpUrl(url)
  let snapshot: Snapshot | undefined
  let inFlight: Promise<Snapshot> | undefined
  let completedChecks = 0

  const download = async (): Promise<Snapshot> => {
    const startedAt = Date.now()
    let httpStatus: number | undefined
    let failureStage: 'request' | 'http' | 'json' | 'validation' = 'request'
    const headers: Record<string, string> = snapshot?.etag ? { 'If-None-Match': snapshot.etag } : {}
    // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
    console.info(
      LOG_PREFIX,
      'fetch.start',
      JSON.stringify({
        cacheStatus: snapshot ? 'hit' : 'miss',
        etag: snapshot?.etag ?? null,
        conditional: Boolean(snapshot?.etag)
      })
    )
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(15_000)
      })
      httpStatus = response.status
      failureStage = 'http'
      if (response.status === 304) {
        if (!snapshot?.etag) throw new Error('Unexpected 304 without a cached validator')
        // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
        console.info(
          LOG_PREFIX,
          'cache.unchanged',
          JSON.stringify({
            cacheStatus: 'unchanged',
            ...snapshotSummary(snapshot),
            httpStatus,
            durationMs: Date.now() - startedAt
          })
        )
        return snapshot
      }
      if (response.status !== 200) throw new Error(`Manifest HTTP ${response.status}`)
      failureStage = 'json'
      const value = await response.json()
      failureStage = 'validation'
      const entries = parseUseCaseManifest(value, url)
      const previous = snapshot
      // Publish only a fully validated snapshot with the validator from this GET.
      snapshot = { entries, etag: response.headers.get('etag') }
      // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
      console.info(
        LOG_PREFIX,
        'cache.updated',
        JSON.stringify({
          cacheStatus: 'updated',
          reason: previous ? 'refresh' : 'initial-load',
          previousEtag: previous?.etag ?? null,
          ...snapshotSummary(snapshot),
          httpStatus,
          durationMs: Date.now() - startedAt
        })
      )
      return snapshot
    } catch (error) {
      const summary = errorSummary(error)
      let errorMessage = {
        request: 'Manifest request failed',
        http:
          httpStatus === 304
            ? 'Unexpected 304 without a cached validator'
            : `Manifest HTTP ${httpStatus}`,
        json:
          error instanceof SyntaxError
            ? 'Manifest response is not valid JSON'
            : 'Manifest response body could not be read',
        validation: 'Manifest normalization failed'
      }[failureStage]
      if (error instanceof ManifestValidationError) errorMessage = error.message
      else if (summary.errorType === 'TimeoutError') errorMessage = 'Manifest request timed out'
      else if (summary.errorType === 'AbortError') errorMessage = 'Manifest request aborted'
      // Do not log source URLs, response bodies, or signed credentials.
      // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
      console.error(
        LOG_PREFIX,
        'fetch.failed',
        JSON.stringify({
          cacheStatus: snapshot ? 'retained' : 'miss',
          ...snapshotSummary(snapshot),
          httpStatus,
          retainedCache: Boolean(snapshot),
          failureStage,
          ...summary,
          errorMessage,
          ...(error instanceof ManifestValidationError
            ? {
                fieldPath: error.fieldPath,
                expected: error.expected,
                actualType: error.actualType
              }
            : {}),
          durationMs: Date.now() - startedAt
        })
      )
      throw error
    }
  }

  const refresh = (): Promise<Snapshot> => {
    if (inFlight) return inFlight
    inFlight = download().finally(() => {
      completedChecks += 1
      inFlight = undefined
    })
    return inFlight
  }

  const read = async (schedule: ScheduleAfterResponse): Promise<UseCaseManifestEntry[]> => {
    const current = snapshot
    if (!current) {
      // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
      console.info(
        LOG_PREFIX,
        'cache.miss',
        JSON.stringify({ cacheStatus: 'miss', ...snapshotSummary(undefined) })
      )
      return (await refresh()).entries
    }
    // biome-ignore lint/suspicious/noConsole: Manifest diagnostics are intentionally console-only.
    console.info(
      LOG_PREFIX,
      'cache.hit',
      JSON.stringify({ cacheStatus: 'hit', ...snapshotSummary(current) })
    )
    const observedChecks = completedChecks
    schedule(async () => {
      // Delayed callbacks from the same request wave need not check twice.
      if (completedChecks !== observedChecks) return
      try {
        await refresh()
      } catch {
        // download() logged the failure; a later request retries without a TTL.
      }
    })
    return current.entries
  }
  return { read }
}
