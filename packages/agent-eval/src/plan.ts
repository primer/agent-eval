import * as z from 'zod/mini'
import {TrialSchema} from './trial'
import type {Trial} from './trial'

const PlanSchema = z.object({
  trials: z.array(TrialSchema),
})

/**
 * A plan is an ordered list of trials to be ran.
 */
type Plan = z.infer<typeof PlanSchema>

// TODO: support plan with sharding
async function createPlan(trials: Array<Trial>): Promise<Plan> {
  return {
    trials: randomize(trials),
  }
}

function randomize<T>(input: Array<T>): Array<T> {
  const randomized: Array<T> = input.slice()

  // Fisher–Yates shuffle
  for (let i = randomized.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[randomized[i], randomized[j]] = [randomized[j], randomized[i]]
  }

  return randomized
}

export {createPlan}
export type {Plan}
