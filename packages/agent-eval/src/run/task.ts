type Task<T> = (signal: AbortSignal) => Promise<T> | T

function cancelable<T>(task: Task<T>): Task<T> {
  return async (signal: AbortSignal) => {
    signal.throwIfAborted()
    using promise = aborted(signal)
    return await Promise.race([promise, task(signal)])
  }
}

function deadline(deadlineMs: number): <T>(task: Task<T>) => Task<T> {
  return task => {
    return async signal => {
      signal.throwIfAborted()
      const wrapped = AbortSignal.any([signal, AbortSignal.timeout(deadlineMs)])
      using promise = aborted(wrapped)
      return Promise.race([promise, task(wrapped)])
    }
  }
}

function retry(attempts: number): <T>(task: Task<T>) => Task<T> {
  if (attempts < 1) {
    throw new Error(`retry attempts must be at least 1, got ${attempts}`)
  }

  return task => {
    return async signal => {
      let lastError: unknown

      for (let i = 0; i < attempts; i++) {
        signal.throwIfAborted()
        try {
          return await task(signal)
        } catch (error) {
          signal.throwIfAborted()
          lastError = error
        }
      }

      throw lastError
    }
  }
}

function pipe<T>(task: Task<T>, ...decorators: Array<(task: Task<T>) => Task<T>>): Task<T> {
  return decorators.reduce((acc, decorator) => {
    return decorator(acc)
  }, task)
}

function pipeRight<T>(task: Task<T>, ...decorators: Array<(task: Task<T>) => Task<T>>): Task<T> {
  return decorators.reduceRight((acc, decorator) => {
    return decorator(acc)
  }, task)
}

function compose<T>(...decorators: Array<(task: Task<T>) => Task<T>>): (task: Task<T>) => Task<T> {
  return task => {
    return decorators.reduceRight((acc, decorator) => {
      return decorator(acc)
    }, task)
  }
}

function noop() {}

function aborted(signal: AbortSignal): Disposable & Promise<never> {
  const {promise, reject} = Promise.withResolvers<never>()
  if (signal.aborted) {
    reject(signal.reason)
    return {
      ...promise,
      [Symbol.dispose]: noop,
    }
  }

  const onAbort = () => {
    reject(signal.reason)
  }

  signal.addEventListener('abort', onAbort, {
    once: true,
  })

  return {
    ...promise,
    [Symbol.dispose]() {
      signal.removeEventListener('abort', onAbort)
    },
  }
}

export {pipe, compose, cancelable, retry, deadline}
export type {Task}
