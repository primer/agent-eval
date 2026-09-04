import {expect, test} from 'vitest'
import {
  BenchmarkConfigSchema,
  ControlTreatment,
  ExperimentConfigSchema,
  ScenarioConfigSchema,
  TreatmentSchema,
  TrialResultSchema,
  TrialSchema,
  defineBenchmarkConfig,
  defineExperimentConfig,
  defineScenarioConfig,
} from './index'

test('exports the public configuration helpers and schemas', () => {
  expect(defineBenchmarkConfig).toBeTypeOf('function')
  expect(defineExperimentConfig).toBeTypeOf('function')
  expect(defineScenarioConfig).toBeTypeOf('function')
  expect(BenchmarkConfigSchema).toBeDefined()
  expect(ExperimentConfigSchema).toBeDefined()
  expect(ScenarioConfigSchema).toBeDefined()
  expect(TreatmentSchema.parse(ControlTreatment)).toEqual(ControlTreatment)
  expect(TrialSchema).toBeDefined()
  expect(TrialResultSchema).toBeDefined()
})
