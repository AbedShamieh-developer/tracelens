import { parseFlexibleLogText, parseGZ } from '../logParser'
import type { LogEntry } from '../types'

type ParseRequest = {
  id: number
  key: string
  buffer: ArrayBuffer
}

type ParseResponse = {
  id: number
  entries?: LogEntry[]
  error?: string
}

type PendingTask = {
  request: ParseRequest
  resolve: (entries: LogEntry[]) => void
  reject: (error: Error) => void
}

const WORKER_URL = new URL('../workers/logParseWorker.ts', import.meta.url)

export class LogParsePool {
  private workers: Worker[]
  private idleWorkers: Worker[]
  private readonly pending = new Map<number, PendingTask>()
  private readonly queue: PendingTask[] = []
  private nextId = 0
  private destroyed = false
  private fallbackMode = false

  constructor(workerCount = 2) {
    if (import.meta.env.PROD) {
      this.workers = []
      this.idleWorkers = []
      this.fallbackMode = true
      return
    }

    const count = Math.max(1, workerCount)
    this.workers = []
    this.idleWorkers = []

    try {
      this.workers = Array.from({ length: count }, () => {
        const worker = new Worker(WORKER_URL, { type: 'module' })
        worker.onmessage = (event: MessageEvent<ParseResponse>) => {
          this.handleMessage(worker, event.data)
        }
        worker.onerror = (event) => {
          this.handleWorkerError(worker, event.message || 'Unknown worker error')
        }
        return worker
      })
      this.idleWorkers = [...this.workers]
    } catch (error) {
      this.enableFallback(error instanceof Error ? error.message : 'Failed to initialize parser workers')
    }
  }

  parse(key: string, buffer: ArrayBuffer): Promise<LogEntry[]> {
    if (this.destroyed) {
      return Promise.reject(new Error('Parser pool has been destroyed'))
    }

    if (this.fallbackMode) {
      return this.parseDirect(key, buffer)
    }

    const id = ++this.nextId
    return new Promise<LogEntry[]>((resolve, reject) => {
      this.queue.push({
        request: { id, key, buffer },
        resolve,
        reject,
      })

      this.drain()
    })
  }

  destroy() {
    if (this.destroyed) {
      return
    }

    this.destroyed = true

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      task?.reject(new Error('Parser pool has been destroyed'))
    }

    for (const task of this.pending.values()) {
      task.reject(new Error('Parser pool has been destroyed'))
    }
    this.pending.clear()

    for (const worker of this.workers) {
      worker.terminate()
    }
  }

  private drain() {
    if (this.destroyed || this.fallbackMode) {
      return
    }

    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.idleWorkers.pop()
      const task = this.queue.shift()

      if (!worker || !task) {
        continue
      }

      this.pending.set(task.request.id, task)
      worker.postMessage(task.request)
    }
  }

  private handleMessage(worker: Worker, response: ParseResponse) {
    const task = this.pending.get(response.id)

    if (!task) {
      this.idleWorkers.push(worker)
      return
    }

    this.pending.delete(response.id)

    if (response.error) {
      task.reject(new Error(response.error))
    } else {
      task.resolve(response.entries ?? [])
    }

    this.idleWorkers.push(worker)
    this.drain()
  }

  private handleWorkerError(worker: Worker, message: string) {
    const index = this.idleWorkers.indexOf(worker)
    if (index >= 0) {
      this.idleWorkers.splice(index, 1)
    }

    this.enableFallback(message)
  }

  private enableFallback(message?: string) {
    if (this.fallbackMode || this.destroyed) {
      return
    }

    if (message) {
      console.warn(`[TraceLens] Parser workers unavailable, falling back to main-thread parsing: ${message}`)
    }

    this.fallbackMode = true

    for (const worker of this.workers) {
      worker.terminate()
    }

    this.workers = []
    this.idleWorkers.length = 0

    const pendingTasks = [...this.pending.values()]
    this.pending.clear()

    for (const task of pendingTasks) {
      this.queue.unshift(task)
    }

    void this.flushFallbackQueue()
  }

  private async flushFallbackQueue() {
    while (!this.destroyed && this.queue.length > 0) {
      const task = this.queue.shift()
      if (!task) {
        continue
      }

      try {
        const entries = await this.parseDirect(task.request.key, task.request.buffer)
        task.resolve(entries)
      } catch (error) {
        task.reject(error instanceof Error ? error : new Error('Failed to parse log object'))
      }
    }
  }

  private async parseDirect(key: string, buffer: ArrayBuffer) {
    if (key.toLowerCase().endsWith('.gz') || this.isGzipBuffer(buffer)) {
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

  private isGzipBuffer(buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer)
    return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  }
}

export function createLogParsePool(workerCount = 2) {
  return new LogParsePool(workerCount)
}
