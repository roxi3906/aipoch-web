import { expect, test } from 'bun:test'

const { readJsonStream } = await import('../../lib/science-package/json-stream')
const encoder = new TextEncoder()
const chunks = (bytes: Uint8Array, step: number) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += step) controller.enqueue(bytes.slice(i, i + step))
      controller.close()
    }
  })
const record = {
  version: 2,
  session: {
    messages: [
      {
        id: 'later',
        createdAt: 20,
        content: '中文🙂\n```ts\nconst a = "}\\"\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |'
      },
      { id: 'earlier', createdAt: 10, content: 'First' }
    ],
    conversationGraph: {
      activities: [
        {
          id: 'middle',
          createdAt: 15,
          providerToolName: 'ContextCompaction',
          status: 'completed',
          rawOutput: 'INTERNAL SECRET'
        }
      ]
    },
    title: 'Arbitrary field order',
    artifacts: []
  }
}
for (const step of [1, 2, 7, 31])
  test(`parses complete records across ${step}-byte chunks without damaging UTF-8, escaped strings, Markdown or tables`, async () => {
    expect(await readJsonStream(chunks(encoder.encode(JSON.stringify(record)), step))).toEqual(
      record
    )
  })

test('retains exact long strings, escaped chunk edges and adjacent literals', async () => {
  const value = { body: '\\"中文🙂\n'.repeat(10000), next: [true, false, null, 1.25e30, 'tail'] }
  const bytes = encoder.encode(JSON.stringify(value))
  expect(await readJsonStream(chunks(bytes, 4093))).toEqual(value)
  for (const literal of ['12345', 'true', 'false', 'null', '"root\\nstring"']) {
    expect(await readJsonStream(chunks(encoder.encode(literal), 1))).toEqual(JSON.parse(literal))
  }
})
for (const invalid of [
  '{"x":',
  '{"x":1,}',
  '[1,]',
  '{"x":true false}',
  '{"x":"bad\\q"}',
  '{}{}',
  '{"x":01}',
  '   '
]) {
  test(`rejects an incomplete or malformed document: ${invalid}`, async () => {
    await expect(readJsonStream(chunks(encoder.encode(invalid), 1))).rejects.toThrow()
  })
}
test('preserves JSON duplicate-key semantics and treats __proto__ as data', async () => {
  const value = await readJsonStream(
    chunks(
      encoder.encode('{"x":1,"x":2,"__proto__":{"polluted":true},"a":[null,false,-1.25e+2]}'),
      1
    )
  )
  expect(value).toEqual(JSON.parse('{"x":2,"__proto__":{"polluted":true},"a":[null,false,-125]}'))
  expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
})

test('does not publish a partial record or mistake an early closed array for a complete ordered transcript', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>
  let settled = false
  const pending = readJsonStream(
    new ReadableStream({
      start(controller) {
        source = controller
      }
    })
  )
  void pending.then(() => {
    settled = true
  })
  source.enqueue(encoder.encode('{"session":{"messages":[{"content":"later","createdAt":20}],'))
  for (let i = 0; i < 20; i++) await Promise.resolve()
  expect(settled).toBe(false)
  source.enqueue(encoder.encode('"conversationGraph":{"activities":[{"createdAt":10}]}}}'))
  source.close()
  expect(await pending).toEqual({
    session: {
      messages: [{ content: 'later', createdAt: 20 }],
      conversationGraph: { activities: [{ createdAt: 10 }] }
    }
  })
})

test('rejects an invalid complete record before waiting for the remaining download', async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>
  let rejected = false
  const pending = readJsonStream(
    new ReadableStream({
      start(controller) {
        source = controller
      }
    })
  )
  void pending.catch(() => {
    rejected = true
  })
  source.enqueue(encoder.encode('{"messages":[{"content":"bad\\q"}],'))
  for (let i = 0; i < 30; i++) await Promise.resolve()
  try {
    expect(rejected).toBe(true)
  } finally {
    try {
      source.close()
    } catch {
      /* The invalid stream was already canceled. */
    }
    await pending.catch(() => {})
  }
})
