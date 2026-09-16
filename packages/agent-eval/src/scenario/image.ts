import path from 'node:path'
import {DefaultHost, type Host} from '../host'
import {DEFAULT_DOCKER_IMAGE, type SandboxCreateOptions} from '../sandbox'
import type {Scenario} from './scenario'

function getScenarioImageOptions(scenario: Scenario, dockerImage: string): SandboxCreateOptions {
  const workspace = scenario.workspace
  if (workspace?.dockerfile !== undefined) {
    return {
      dockerBuild: {
        dockerfile: path.resolve(scenario.directory, workspace.dockerfile),
        context: path.resolve(scenario.directory, workspace.context ?? '.'),
      },
    }
  }
  if (workspace) {
    return {dockerImage: workspace.image}
  }

  return {
    dockerImage,
    scenario: {
      directory: scenario.directory,
      exclude: Array.from(
        new Set([
          'scenario.config.ts',
          'scenario.test.ts',
          'browser.test.ts',
          'scenario.browser.test.ts',
          'node_modules',
          '.next',
          'dist',
          ...[...scenario.checks, ...scenario.judges].flatMap(evaluator => {
            return evaluator.files.map(({filepath}) => {
              return path.relative(scenario.directory, filepath)
            })
          }),
        ]),
      ),
    },
  }
}

async function buildScenarioImage({
  scenario,
  dockerImage = DEFAULT_DOCKER_IMAGE,
  host = DefaultHost,
}: {
  scenario: Scenario
  dockerImage?: string
  host?: Host
}): Promise<string> {
  return host.buildSandboxImage(getScenarioImageOptions(scenario, dockerImage))
}

export {buildScenarioImage}
