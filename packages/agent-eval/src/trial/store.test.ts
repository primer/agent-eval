import {Effect, Option} from 'effect'
import {expect, test} from 'vitest'
import {VirtualHost} from '../host'
import {ControlTreatment} from '../treatment'
import type {RunTrialResult} from './run'
import {createTrialStore, TrialStoreError} from './store'
import type {Trial} from './trial'

const OUTPUT_DIRECTORY = '/output'
const TRIAL_DIRECTORY = '/output/artifacts/trial'
const STAGING_DIRECTORY = '/output/.agent-eval/staging'

function createTrial(): Trial {
  return {
    id: 'trial',
    model: {name: 'gpt-5.5', reasoningEffort: 'high'},
    runner: 'copilot-sdk',
    treatment: {...ControlTreatment},
    scenario: {
      id: 'example',
      directory: '/scenarios/example',
      prompt: 'Update the example',
      tags: [],
      judges: [],
      image: {type: 'Default'},
      checks: [],
    },
  }
}

function createResult(trial: Trial): RunTrialResult {
  return {
    agent: {
      sessions: [
        {
          turns: 1,
          outputTokens: 10,
          premiumRequests: 1,
          totalApiDurationMs: 100,
          sessionDurationMs: 200,
          tools: {bash: 2},
          messages: [],
        },
      ],
    },
    artifacts: {
      directory: TRIAL_DIRECTORY,
      copilotConfigDirectory: `${TRIAL_DIRECTORY}/.copilot`,
      skillsConfigDirectory: `${TRIAL_DIRECTORY}/.agents`,
      walkthroughDirectory: `${TRIAL_DIRECTORY}/walkthrough`,
      workspaceDirectory: `${TRIAL_DIRECTORY}/workspace`,
    },
    checks: [
      {
        check: {name: 'build', files: []},
        result: {type: 'outcomes', outcomes: [{type: 'outcome', status: 'passed', annotations: []}]},
      },
    ],
    judges: [],
    trial,
    walkthrough: {type: 'Screenshot', filepath: 'walkthrough/screenshot.png'},
  }
}

function commitTrial(host: VirtualHost, trial: Trial, files: Record<string, string> = {}) {
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})

  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const location = yield* store.stage(trial)
        for (const [name, contents] of Object.entries(files)) {
          host.fs.mkdirSync(`${location.stagingDirectory}/workspace`, {recursive: true})
          host.fs.writeFileSync(`${location.stagingDirectory}/workspace/${name}`, contents)
        }
        yield* store.commit(location, trial, createResult(trial))
      }),
    ),
  )
}

test('committed trial loads with its staged files and the live trial', async () => {
  const host = VirtualHost.create()
  const trial = createTrial()
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})
  await commitTrial(host, trial, {'index.ts': 'export {}'})

  const loaded = await Effect.runPromise(store.load(trial))

  expect(loaded).toStrictEqual(Option.some(createResult(trial)))
  expect(Option.getOrThrow(loaded).trial).toBe(trial)
  expect(host.fs.readFileSync(`${TRIAL_DIRECTORY}/workspace/index.ts`, 'utf-8')).toBe('export {}')
  expect(host.fs.readdirSync(STAGING_DIRECTORY)).toEqual([])
})

test('load resolves artifact paths from the current output directory', async () => {
  const host = VirtualHost.create()
  const trial = createTrial()
  await commitTrial(host, trial)
  host.fs.renameSync(OUTPUT_DIRECTORY, '/moved')
  const store = createTrialStore({host, outputDirectory: '/moved'})

  const loaded = Option.getOrThrow(await Effect.runPromise(store.load(trial)))

  expect(loaded.artifacts).toStrictEqual({
    directory: '/moved/artifacts/trial',
    copilotConfigDirectory: '/moved/artifacts/trial/.copilot',
    skillsConfigDirectory: '/moved/artifacts/trial/.agents',
    walkthroughDirectory: '/moved/artifacts/trial/walkthrough',
    workspaceDirectory: '/moved/artifacts/trial/workspace',
  })
})

test('load treats a trial directory without a commit record as not committed', async () => {
  const host = VirtualHost.create({[`${TRIAL_DIRECTORY}/workspace/index.ts`]: 'export {}'})
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})

  const loaded = await Effect.runPromise(store.load(createTrial()))

  expect(loaded).toStrictEqual(Option.none())
})

test.each([
  {
    name: 'a different scenario',
    update: (trial: Trial) => {
      return {...trial, scenario: {...trial.scenario, id: 'other'}}
    },
  },
  {
    name: 'a different capability',
    update: (trial: Trial) => {
      return {...trial, capability: {id: 'capability'}}
    },
  },
])('load rejects a commit record for $name', async ({update}) => {
  const host = VirtualHost.create()
  const trial = createTrial()
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})
  await commitTrial(host, trial)

  const loaded = Effect.runPromise(store.load(update(trial)))

  await expect(loaded).rejects.toBeInstanceOf(TrialStoreError)
  await expect(loaded).rejects.toThrow(/belongs to a different trial.*fresh output directory/)
})

test('load rejects an unparseable commit record', async () => {
  const host = VirtualHost.create({[`${TRIAL_DIRECTORY}/.agent-eval-trial.json`]: '{"version": 1'})
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})

  const loaded = Effect.runPromise(store.load(createTrial()))

  await expect(loaded).rejects.toThrow(/Invalid trial commit record.*fresh output directory/)
})

test('commit replaces an existing trial directory with the staged files', async () => {
  const host = VirtualHost.create({[`${TRIAL_DIRECTORY}/workspace/stale.ts`]: 'stale'})

  await commitTrial(host, createTrial(), {'index.ts': 'export {}'})

  expect(host.fs.readdirSync(`${TRIAL_DIRECTORY}/workspace`)).toEqual(['index.ts'])
})

test('stage discards uncommitted work when the attempt fails', async () => {
  const host = VirtualHost.create()
  const trial = createTrial()
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})
  const error = new Error('task failed')

  const attempt = Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const location = yield* store.stage(trial)
        host.fs.writeFileSync(`${location.stagingDirectory}/index.ts`, 'export {}')
        return yield* Effect.fail(error)
      }),
    ),
  )

  await expect(attempt).rejects.toBe(error)
  expect(host.fs.existsSync(TRIAL_DIRECTORY)).toBe(false)
  expect(host.fs.readdirSync(STAGING_DIRECTORY)).toEqual([])
  await expect(Effect.runPromise(store.load(trial))).resolves.toStrictEqual(Option.none())
})

test('stage clears stale staging for the trial without touching other trials', async () => {
  const host = VirtualHost.create({
    [`${STAGING_DIRECTORY}/trial/previous-attempt/index.ts`]: 'stale',
    [`${STAGING_DIRECTORY}/other/attempt/index.ts`]: 'in progress',
  })
  const store = createTrialStore({host, outputDirectory: OUTPUT_DIRECTORY})

  const staged = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const location = yield* store.stage(createTrial())
        return {
          attempts: host.fs.readdirSync(`${STAGING_DIRECTORY}/trial`),
          contents: host.fs.readdirSync(location.stagingDirectory),
          location,
        }
      }),
    ),
  )

  expect(staged.attempts).toEqual([staged.location.stagingDirectory.split('/').at(-1)])
  expect(staged.contents).toEqual([])
  expect(staged.location.directory).toBe(TRIAL_DIRECTORY)
  expect(host.fs.readFileSync(`${STAGING_DIRECTORY}/other/attempt/index.ts`, 'utf-8')).toBe('in progress')
})
