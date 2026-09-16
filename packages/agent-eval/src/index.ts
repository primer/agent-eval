import {getScenario as getScenarioInternal} from './scenario/get'
import {listScenarios as listScenariosInternal} from './scenario/list'
import type {Scenario as InternalScenario} from './scenario/scenario'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- Preserve the public name during declaration emit.
interface Scenario extends InternalScenario {}

const getScenario: (...args: Parameters<typeof getScenarioInternal>) => Promise<Scenario> = getScenarioInternal
const listScenarios: (...args: Parameters<typeof listScenariosInternal>) => Promise<Array<Scenario>> =
  listScenariosInternal

export {getBenchmark} from './benchmark/get'
export {listBenchmarks} from './benchmark/list'
export type {Benchmark} from './benchmark/benchmark'
export {BenchmarkOutputFileSchema, BenchmarkTrialOutputSchema, parseBenchmarkTrialOutput} from './benchmark/output'
export type {BenchmarkOutput, BenchmarkTrialOutput} from './benchmark/output'
export {getExperiment} from './experiment/get'
export {listExperiments} from './experiment/list'
export type {Experiment} from './experiment/experiment'
export type {CopilotRunner} from './copilot-runner'
export {ExperimentOutputFileSchema, ExperimentTrialOutputSchema} from './experiment/output'
export type {ExperimentOutput, ExperimentTrialOutput} from './experiment/output'
export {getScenario, listScenarios}
export type {Scenario}
export type {CheckOutput} from './check'
export type {JudgeOutput} from './judge'
export {addCheckResults, formatCheckSummaries, getCheckDimensions, getCheckValue} from './report/checks'
export type {CheckSummary} from './report/checks'
export {createTrialSummary, createTrialSummaryComparator} from './trial/report'
export type {TrialSummary} from './trial/report'
