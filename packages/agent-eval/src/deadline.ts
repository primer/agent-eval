type DeadlineOptions = {
  timeoutMs: number
  description: string
  signal?: AbortSignal
}

async function withDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  {timeoutMs, description, signal}: DeadlineOptions,
): Promise<T> {
  const controller = new AbortController()
  const abort = () => {
    controller.abort(signal?.reason)
  }
  signal?.throwIfAborted()
  signal?.addEventListener('abort', abort, {once: true})
  const timer = setTimeout(() => {
    controller.abort(new Error(`${description} exceeded its ${timeoutMs}ms deadline`))
  }, timeoutMs)
  let rejectOnAbort: () => void = () => {}
  const aborted = new Promise<never>((_, reject) => {
    rejectOnAbort = () => {
      reject(controller.signal.reason)
    }
    controller.signal.addEventListener('abort', rejectOnAbort, {once: true})
  })

  try {
    return await Promise.race([operation(controller.signal), aborted])
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', rejectOnAbort)
  }
}

export {withDeadline}
