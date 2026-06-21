import { parseFlexibleLogText, parseGZ } from '../logParser'
import type { LogEntry } from '../types'

type ParseWorkerRequest = {
  id: number
  key: string
  buffer: ArrayBuffer
}

type ParseWorkerResponse = {
  id: number
  entries?: LogEntry[]
  error?: string
}

function isGzipBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
}

async function parseBuffer(key: string, buffer: ArrayBuffer): Promise<LogEntry[]> {
  if (key.toLowerCase().endsWith('.gz') || isGzipBuffer(buffer)) {
    try {
      return await parseGZ(buffer)
    } catch {
      const text = new TextDecoder().decode(buffer)
      return parseFlexibleLogText(text)
    }
  }

  const text = new TextDecoder().decode(buffer)
  return parseFlexibleLogText(text)
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<ParseWorkerRequest>) => void) | null
  postMessage: (message: ParseWorkerResponse) => void
}

workerScope.onmessage = async (event: MessageEvent<ParseWorkerRequest>) => {
  const { id, key, buffer } = event.data

  try {
    const entries = await parseBuffer(key, buffer)
    const response: ParseWorkerResponse = { id, entries }
    workerScope.postMessage(response)
  } catch (error) {
    const response: ParseWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : 'Failed to parse log object',
    }
    workerScope.postMessage(response)
  }
}
