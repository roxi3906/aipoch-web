import { HttpResponse, http } from 'msw'
import { useCaseManifest } from '../fixtures'
import { buildCoveragePackage } from '../fixtures/science-coverage-package'

const packages = new Map(
  useCaseManifest.map((item) => [item.name, buildCoveragePackage(item.title)])
)

/** The HTTP adapter owns mock revisions, so SSR and browsers see one object version. */
export const useCaseManifestHandlers = (origin: string) => {
  let revision = 1
  let mode = 'normal'
  let titleSuffix = ''
  let delayMs = 0
  let requests = 0
  let notModified = 0
  let lastValidator: string | null = null
  let discoveryMode = 'available'
  let packageMode = 'normal'
  let packageDelayMs = 0
  let packageRequests = 0
  let replayChunkDelayMs = 0
  let recordsChunkDelayMs = 0
  let recordsMode = 'normal'
  return [
    http.get(`${origin}/use-case-manifest/manifest.json`, async ({ request }) => {
      requests += 1
      lastValidator = request.headers.get('if-none-match')
      const validator = lastValidator
      const responseMode = mode
      const responseSuffix = titleSuffix
      const etag = `"use-case-manifest-${revision}"`
      const headers = { ETag: etag, 'Cache-Control': 'no-store' }
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs))
      if (responseMode === 'error') return new HttpResponse(null, { status: 503 })
      if (responseMode === 'invalid') return HttpResponse.text('invalid json', { headers })
      if (validator === etag) {
        notModified += 1
        return new HttpResponse(null, { status: 304, headers })
      }
      return HttpResponse.json(
        responseMode === 'empty'
          ? []
          : useCaseManifest.map((item) => ({
              ...item,
              title: `${item.title}${responseSuffix}`,
              case: {
                ...item.case,
                release_url: item.case.release_url
                  ? `${origin}/use-case-manifest/releases/${item.name}.science`
                  : '',
                bytes: packages.get(item.name)?.sizeBytes,
                sha256: packages.get(item.name)?.sha256
              }
            })),
        { headers }
      )
    }),
    // Development-only controls and counters make after-response refresh observable.
    http.get(`${origin}/__mock/use-case-manifest`, () =>
      HttpResponse.json({
        revision,
        requests,
        notModified,
        lastValidator,
        packageRequests,
        discoveryMode
      })
    ),
    http.put(`${origin}/__mock/use-case-manifest`, async ({ request }) => {
      const update = (await request.json()) as {
        discoveryMode?: string
        mode?: string
        titleSuffix?: string
        delayMs?: number
        packageMode?: string
        packageDelayMs?: number
        replayChunkDelayMs?: number
        recordsChunkDelayMs?: number
        recordsMode?: string
      }
      if (
        (update.discoveryMode !== undefined &&
          !['available', 'unavailable', 'incompatible', 'timeout'].includes(
            update.discoveryMode
          )) ||
        (update.mode !== undefined &&
          !['normal', 'empty', 'error', 'invalid'].includes(update.mode)) ||
        (update.titleSuffix !== undefined && typeof update.titleSuffix !== 'string') ||
        (update.packageMode !== undefined &&
          !['normal', 'error', 'empty', 'oversized'].includes(update.packageMode)) ||
        (update.packageDelayMs !== undefined &&
          (!Number.isInteger(update.packageDelayMs) ||
            update.packageDelayMs < 0 ||
            update.packageDelayMs > 5000)) ||
        (update.replayChunkDelayMs !== undefined &&
          (!Number.isInteger(update.replayChunkDelayMs) ||
            update.replayChunkDelayMs < 0 ||
            update.replayChunkDelayMs > 5000)) ||
        (update.recordsChunkDelayMs !== undefined &&
          (!Number.isInteger(update.recordsChunkDelayMs) ||
            update.recordsChunkDelayMs < 0 ||
            update.recordsChunkDelayMs > 5000)) ||
        (update.recordsMode !== undefined &&
          !['normal', 'error', 'missing'].includes(update.recordsMode)) ||
        (update.delayMs !== undefined &&
          (!Number.isInteger(update.delayMs) || update.delayMs < 0 || update.delayMs > 5000))
      )
        return new HttpResponse(null, { status: 400 })
      discoveryMode = update.discoveryMode ?? 'available'
      mode = update.mode ?? 'normal'
      titleSuffix = update.titleSuffix ?? ''
      delayMs = update.delayMs ?? 0
      packageMode = update.packageMode ?? 'normal'
      packageDelayMs = update.packageDelayMs ?? 0
      replayChunkDelayMs = update.replayChunkDelayMs ?? 0
      recordsChunkDelayMs = update.recordsChunkDelayMs ?? 0
      recordsMode = update.recordsMode ?? 'normal'
      revision += 1
      return HttpResponse.json({ revision })
    }),
    http.get(`${origin}/use-case-manifest/*`, async ({ request }) => {
      const path = decodeURIComponent(
        new URL(request.url).pathname.slice('/use-case-manifest/'.length)
      )
      for (const item of useCaseManifest) {
        // Serve unchanged session JSON and objects restored to their storage-key directories.
        const prefix = `${item.name}/extracted/`
        if (path.startsWith(prefix)) {
          const file = path.slice(prefix.length)
          if (file === 'records.json' && recordsMode !== 'normal')
            return new HttpResponse(null, { status: recordsMode === 'missing' ? 404 : 503 })
          const bytes = packages.get(item.name)?.extractedFiles[file]
          if (!bytes) return new HttpResponse(null, { status: 404 })
          const chunkDelay =
            file === 'session.json'
              ? replayChunkDelayMs
              : file === 'records.json'
                ? recordsChunkDelayMs
                : 0
          return new HttpResponse(
            chunkDelay ? delayedBody(bytes, chunkDelay) : (bytes as BodyInit),
            {
              headers: {
                'Content-Type': file.endsWith('.json')
                  ? 'application/json'
                  : 'application/octet-stream'
              }
            }
          )
        }
        if (path === `${item.name}/${item.cover.file_name}`) {
          return new HttpResponse(
            '<svg xmlns="http://www.w3.org/2000/svg" width="626" height="292"><rect width="626" height="292" fill="#e8e8e4"/><text x="30" y="150" font-size="32">Research case preview</text></svg>',
            { headers: { 'Content-Type': 'image/svg+xml' } }
          )
        }
        if (item.introduction && path === `${item.name}/${item.introduction.file_name}`)
          return HttpResponse.text(`# ${item.title}\n\nLocal sample introduction.`, {
            headers: { 'Content-Type': 'text/markdown' }
          })
        if (
          path === `${item.name}/${item.case.file_name}` ||
          (item.case.release_url && path === `releases/${item.name}.science`)
        ) {
          packageRequests += 1
          const responseMode = packageMode
          if (packageDelayMs) await new Promise((resolve) => setTimeout(resolve, packageDelayMs))
          if (responseMode === 'error') return new HttpResponse(null, { status: 503 })
          if (responseMode === 'empty') return new HttpResponse(new Uint8Array())
          if (responseMode === 'oversized')
            return new HttpResponse('too large', {
              headers: { 'Content-Length': String(2 * 1024 ** 3 + 1) }
            })
          const sample = packages.get(item.name)
          if (!sample) return new HttpResponse(null, { status: 404 })
          return new HttpResponse(
            replayChunkDelayMs
              ? delayedBody(sample.bytes, replayChunkDelayMs)
              : (sample.bytes as BodyInit),
            {
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': String(sample.sizeBytes),
                'Content-Disposition': 'attachment; filename="sample.science"'
              }
            }
          )
        }
      }
      return new HttpResponse(null, { status: 404 })
    })
  ]
}

// Slow but active response bodies exercise idle deadlines through the real HTTP adapter.
const delayedBody = (bytes: Uint8Array, delayMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  let offset = 0
  const size = Math.ceil(bytes.length / 18)
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        const end = Math.min(offset + size, bytes.length)
        controller.enqueue(bytes.slice(offset, end))
        offset = end
        if (offset === bytes.length) controller.close()
        else timer = setTimeout(send, delayMs)
      }
      send()
    },
    cancel() {
      clearTimeout(timer)
    }
  })
}
