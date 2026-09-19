import Queue from 'p-queue'
import {logger} from './logger'
import type {Sandbox} from './sandbox/types'

class SandboxCleanupQueue {
  readonly errors: Array<Error> = []
  #queue: Queue
  #capacity: number
  #allocated = 0
  #failure: Error | undefined
  #waiters = new Set<() => void>()

  constructor(concurrency: number) {
    this.#queue = new Queue({concurrency})
    this.#capacity = concurrency * 2
  }

  async create(create: () => Promise<Sandbox>): Promise<Sandbox> {
    while (this.#allocated >= this.#capacity && !this.#failure) {
      await new Promise<void>(resolve => {
        this.#waiters.add(resolve)
      })
    }
    if (this.#failure) {
      throw new Error('Container admission stopped because resource cleanup is unresolved', {cause: this.#failure})
    }
    this.#allocated++
    try {
      return await create()
    } catch (cause) {
      this.#failure = new Error('Container creation failed; resource state may be unresolved', {cause})
      this.#notify()
      throw this.#failure
    }
  }

  dispose(sandbox: Sandbox, trialId: string): Promise<boolean> {
    return this.#queue.add(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await sandbox[Symbol.asyncDispose]()
          this.#allocated--
          this.#notify()
          return true
        } catch (cause) {
          const error = new Error(`Failed to clean up sandbox for trial "${trialId}"`, {cause})
          logger.error({err: error, trialId, attempt: attempt + 1}, 'Sandbox cleanup failed')
          if (attempt === 2) {
            this.errors.push(error)
            this.#failure = error
            this.#notify()
            return false
          }
        }
      }
      throw new Error('Sandbox cleanup exhausted its attempts')
    })
  }

  async drain(): Promise<void> {
    await this.#queue.onIdle()
  }

  #notify() {
    for (const resolve of this.#waiters) {
      resolve()
    }
    this.#waiters.clear()
  }
}

export {SandboxCleanupQueue}
