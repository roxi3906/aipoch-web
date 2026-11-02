import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import ts from 'typescript'

test('large streamed JSON strings stay within a bounded Chromium heap budget', async () => {
  const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] })
  try {
    const page = await browser.newPage()
    // Exercise the actual parser in V8, where per-character concatenation retains rope nodes.
    const source = ts.transpileModule(readFileSync('lib/science-package/json-stream.ts', 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
    }).outputText
    expect(source).toContain('export const readJsonStream =')
    await page.addScriptTag({
      content: source.replace('export const readJsonStream =', 'globalThis.readJsonStream =')
    })
    const result = await page.evaluate(async () => {
      const runtime = globalThis as unknown as {
        readJsonStream: (stream: ReadableStream<Uint8Array>) => Promise<{ body: string }>
      }
      const memory = () =>
        (performance as unknown as { memory: { usedJSHeapSize: number } }).memory.usedJSHeapSize
      const baseline = memory()
      let peak = baseline
      const size = 16 * 1024 * 1024
      const encoder = new TextEncoder()
      const chunk = encoder.encode('a'.repeat(64 * 1024))
      let cursor = -1
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          peak = Math.max(peak, memory())
          if (cursor === -1) {
            controller.enqueue(encoder.encode('{"body":"'))
            cursor = 0
          } else if (cursor < size) {
            controller.enqueue(chunk)
            cursor += chunk.length
          } else {
            controller.enqueue(encoder.encode('"}'))
            controller.close()
          }
        }
      })
      const value = await runtime.readJsonStream(stream)
      peak = Math.max(peak, memory())
      return { length: value.body.length, extraHeap: peak - baseline, size }
    })
    expect(result.length).toBe(result.size)
    // Leave ample GC/engine headroom; the old implementation uses over 20x the payload.
    expect(result.extraHeap).toBeLessThan(result.size * 8)
  } finally {
    await browser.close()
  }
}, 30000)
