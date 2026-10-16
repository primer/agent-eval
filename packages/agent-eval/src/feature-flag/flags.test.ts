import {test, expect} from 'vitest'
import {FeatureFlagsConfigSchema} from './flags'

test.each([
  ['empty-input', '', []],
  [
    'single-flag',
    'ui-command',
    [
      {
        name: 'ui-command',
        enabled: true,
      },
    ],
  ],
  [
    'single-disabled-flag',
    '!ui-command',
    [
      {
        name: 'ui-command',
        enabled: false,
      },
    ],
  ],
  [
    'multiple-flags',
    'ui-command,ui-command',
    [
      {
        name: 'ui-command',
        enabled: true,
      },
      {
        name: 'ui-command',
        enabled: true,
      },
    ],
  ],
  [
    'multiple-flags-mixed-values',
    'ui-command,ui-command,!ui-command',
    [
      {
        name: 'ui-command',
        enabled: true,
      },
      {
        name: 'ui-command',
        enabled: true,
      },
      {
        name: 'ui-command',
        enabled: false,
      },
    ],
  ],
])('parse `%s` config', (_name, input, expected) => {
  const result = FeatureFlagsConfigSchema.parse(input)
  expect(result).toEqual(expected)
})

test('parse fails on unknown flag', () => {
  expect(() => {
    FeatureFlagsConfigSchema.parse('unknown-flag')
  }).toThrowErrorMatchingInlineSnapshot(`
    [$ZodError: [
      {
        "code": "invalid_value",
        "values": [
          "ui-command"
        ],
        "path": [
          0,
          "name"
        ],
        "message": "Invalid input"
      }
    ]]
  `)
})
