import {describe, expect, test} from 'vitest'
import {detectTestRunner, getCopilotArgs, SCENARIO_COPY_EXCLUDES} from './run'

describe('detectTestRunner', () => {
  test.each([
    {field: 'dependencies', packageJson: {dependencies: {vitest: '^4.1.8'}}},
    {field: 'devDependencies', packageJson: {devDependencies: {vitest: '^4.1.8'}}},
  ])('detects Vitest in $field', ({packageJson}) => {
    expect(detectTestRunner(packageJson)).toBe('vitest')
  })

  test('returns undefined without a supported test runner dependency', () => {
    expect(detectTestRunner({devDependencies: {jest: '^30.0.0'}})).toBeUndefined()
  })
})

test('scenario copy excludes grading files', () => {
  expect(SCENARIO_COPY_EXCLUDES).toEqual(
    expect.arrayContaining(['scenario.config.ts', 'scenario.test.ts', 'scenario.browser.test.ts']),
  )
})

describe('getCopilotArgs', () => {
  test('omits reasoning effort when not configured', () => {
    expect(
      getCopilotArgs({
        prompt: 'Update the page',
        model: 'claude-haiku-4.5',
      }),
    ).not.toContain('--reasoning-effort')
  })

  test('forwards the model and reasoning effort', () => {
    expect(
      getCopilotArgs({
        prompt: 'Update the page',
        model: 'gpt-5.5',
        reasoningEffort: 'medium',
      }),
    ).toEqual([
      '-p',
      'Update the page',
      '--model',
      'gpt-5.5',
      '--allow-all',
      '--reasoning-effort',
      'medium',
      '--mode',
      'autopilot',
      '--output-format',
      'json',
    ])
  })
})
