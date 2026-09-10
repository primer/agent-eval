import {expect, test} from 'vitest'
import {getScenarioAnchor} from './scenario-anchor'

test.each(['001-button', 'with spaces', 'nested/scenario', 'literal%20escape', 'hash#query?', 'caf\u00e9'])(
  'creates a valid target and matching URL fragment for %s',
  scenarioId => {
    const {id, fragment} = getScenarioAnchor(scenarioId)
    expect(id).not.toMatch(/\s/)
    expect(id).not.toContain('%')
    expect(decodeURIComponent(new URL(fragment, 'https://example.test').hash.slice(1))).toBe(id)
  },
)

test('keeps existing simple scenario links unchanged', () => {
  expect(getScenarioAnchor('001-button')).toEqual({
    id: 'scenario-001-button',
    fragment: '#scenario-001-button',
  })
})

test('does not confuse percent escapes with the characters they represent', () => {
  const anchors = ['a b', 'a%20b', 'a/b', 'a%2Fb', 'a_20b', 'a_2Fb', 'a%2520b'].map(scenarioId => {
    return getScenarioAnchor(scenarioId)
  })
  expect(
    new Set(
      anchors.map(anchor => {
        return anchor.id
      }),
    ).size,
  ).toBe(anchors.length)
  expect(
    new Set(
      anchors.map(anchor => {
        return anchor.fragment
      }),
    ).size,
  ).toBe(anchors.length)
})
