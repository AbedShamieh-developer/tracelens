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
  private readonly workers: Worker[]
  private readonly idleWorkers: Worker[]
  private readonly pending = new Map<number, PendingTask>()
  private readonly queue: PendingTask[] = []
  private nextId = 0
  private destroyed = false

  constructor(workerCount = 2) {
    const count = Math.max(1, workerCount)
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
  }

  parse(key: string, buffer: ArrayBuffer): Promise<LogEntry[]> {
    if (this.destroyed) {
      return Promise.reject(new Error('Parser pool has been destroyed'))
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
    if (this.destroyed) {
      return
    }

    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.idleWorkers.pop()
      const task = this.queue.shift()

      if (!worker || !task) {
        continue
      }

      this.pending.set(task.request.id, task)
      worker.postMessage(task.request, [task.request.buffer])
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
    for (const [id, pending] of this.pending.entries()) {
      pending.reject(new Error(message))
      this.pending.delete(id)
    }

    const index = this.idleWorkers.indexOf(worker)
    if (index >= 0) {
      this.idleWorkers.splice(index, 1)
    }
  }
}

export function createLogParsePool(workerCount = 2) {
  return new LogParsePool(workerCount)
}
