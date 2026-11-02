type Frame = {
  value: Record<string, unknown> | unknown[]
  state: 'key-or-end' | 'key' | 'colon' | 'value-or-end' | 'value' | 'comma-or-end'
  key?: string
}

/** Incrementally assemble JSON values; incomplete strings/records never leave this parser. */
class JsonStreamParser {
  private frames: Frame[] = []
  private tokenParts: string[] = []
  private literal = false
  private quoted = false
  private escaped = false
  private complete = false
  private value: unknown

  private invalid(): never {
    throw new Error('Invalid or incomplete session metadata JSON.')
  }

  private accept(value: unknown) {
    const frame = this.frames.at(-1)
    if (!frame) {
      if (this.complete) this.invalid()
      this.value = value
      this.complete = true
    } else if (frame.state === 'key' || frame.state === 'key-or-end') {
      if (typeof value !== 'string') this.invalid()
      frame.key = value
      frame.state = 'colon'
    } else if (frame.state === 'value' || frame.state === 'value-or-end') {
      if (Array.isArray(frame.value)) frame.value.push(value)
      else {
        // JSON keys, including __proto__, are data. Later duplicate keys win, as in JSON.parse.
        if (frame.key === undefined) this.invalid()
        Object.defineProperty(frame.value, frame.key, {
          value,
          writable: true,
          configurable: true,
          enumerable: true
        })
      }
      frame.state = 'comma-or-end'
    } else this.invalid()
  }

  write(text: string) {
    // Keep whole input slices, not one concatenation node per UTF-16 code unit.
    let tokenStart = 0
    for (let index = 0; index < text.length; index++) {
      const character = text[index]
      if (this.quoted) {
        if (this.escaped) this.escaped = false
        else if (character === '\\') this.escaped = true
        else if (character === '"') {
          this.quoted = false
          this.tokenParts.push(text.slice(tokenStart, index + 1))
          this.accept(JSON.parse(this.tokenParts.join('')))
          this.tokenParts = []
        }
        continue
      }
      // A number or literal is only complete at a JSON delimiter, possibly in the next chunk.
      if (this.literal) {
        if (!/[\s,\]}]/.test(character)) continue
        this.tokenParts.push(text.slice(tokenStart, index))
        this.accept(JSON.parse(this.tokenParts.join('')))
        this.tokenParts = []
        this.literal = false
      }
      if (/[\x20\t\r\n]/.test(character)) continue
      const frame = this.frames.at(-1)
      if (character === '}' || character === ']') {
        if (
          !frame ||
          Array.isArray(frame.value) !== (character === ']') ||
          !['comma-or-end', 'key-or-end', 'value-or-end'].includes(frame.state)
        )
          this.invalid()
        this.frames.pop()
        this.accept(frame.value)
      } else if (character === ',') {
        if (frame?.state !== 'comma-or-end') this.invalid()
        frame.state = Array.isArray(frame.value) ? 'value' : 'key'
      } else if (character === ':') {
        if (frame?.state !== 'colon') this.invalid()
        frame.state = 'value'
      } else {
        if (
          frame
            ? !['value', 'value-or-end', 'key', 'key-or-end'].includes(frame.state)
            : this.complete
        )
          this.invalid()
        if ((frame?.state === 'key' || frame?.state === 'key-or-end') && character !== '"')
          this.invalid()
        if (character === '{' || character === '[') {
          this.frames.push(
            character === '{'
              ? { value: {}, state: 'key-or-end' }
              : { value: [], state: 'value-or-end' }
          )
        } else if (character === '"') {
          this.quoted = true
          tokenStart = index
        } else if (/[-0-9tfn]/.test(character)) {
          this.literal = true
          tokenStart = index
        } else this.invalid()
      }
    }
    if (this.quoted || this.literal) this.tokenParts.push(text.slice(tokenStart))
  }

  finish() {
    if (this.literal) {
      this.accept(JSON.parse(this.tokenParts.join('')))
      this.tokenParts = []
      this.literal = false
    }
    if (!this.complete || this.frames.length || this.quoted) this.invalid()
    return this.value
  }
}

/** Cache complete values but wait for document EOF: JSON field order is not conversation order. */
export const readJsonStream = async (stream: ReadableStream<Uint8Array>): Promise<unknown> => {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  const parser = new JsonStreamParser()
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      parser.write(decoder.decode(next.value, { stream: true }))
    }
    parser.write(decoder.decode())
    return parser.finish()
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
