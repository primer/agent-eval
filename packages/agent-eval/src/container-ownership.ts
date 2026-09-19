import {createHash, randomUUID} from 'node:crypto'
import {hostname, homedir, userInfo} from 'node:os'
import * as z from 'zod/mini'

const OWNER_LABEL = 'io.primer.agent-eval.owner'
const RUN_LABEL = 'io.primer.agent-eval.run'
const PID_LABEL = 'io.primer.agent-eval.pid'
const TRIAL_LABEL = 'io.primer.agent-eval.trial'
const owner = createHash('sha256')
  .update(JSON.stringify([hostname(), homedir(), userInfo().username]))
  .digest('hex')
const defaultRunId = randomUUID()

function parseRunId(input: unknown): string {
  return z.uuid().parse(input)
}

function containerLabels(runId: string = defaultRunId, trialId?: string): Record<string, string> {
  return {
    [OWNER_LABEL]: owner,
    [RUN_LABEL]: parseRunId(runId),
    [PID_LABEL]: String(process.pid),
    ...(trialId ? {[TRIAL_LABEL]: trialId} : {}),
  }
}

function recoveryFilters(runId: string): Array<string> {
  return [`${OWNER_LABEL}=${owner}`, `${RUN_LABEL}=${parseRunId(runId)}`]
}

function isRecoverableContainer(labels: Record<string, string>, runId: string): boolean {
  if (labels[OWNER_LABEL] !== owner || labels[RUN_LABEL] !== runId) {
    return false
  }
  const pid = z
    .pipe(
      z.string().check(z.regex(/^[1-9]\d*$/)),
      z.coerce.number<string>().check(z.int(), z.positive(), z.maximum(2_147_483_647)),
    )
    .parse(labels[PID_LABEL])
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      if (error.code === 'ESRCH') {
        return true
      }
      if (error.code === 'EPERM') {
        return false
      }
    }
    throw error
  }
}

export {containerLabels, isRecoverableContainer, parseRunId, recoveryFilters}
