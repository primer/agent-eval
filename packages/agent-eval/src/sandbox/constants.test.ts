import path from 'node:path'
import {expect, test} from 'vitest'
import {
  AGENT_INSTRUCTIONS_PATH,
  AGENTS_DIR,
  CONTAINER_WORKDIR,
  COPILOT_DIR,
  COPILOT_PLUGIN_SOURCES_DIR,
  CUSTOM_AGENTS_DIR,
  MCP_CONFIG_PATH,
  NODE_USER,
  NPM_GLOBAL_DIR,
  SANDBOX_GID,
  SANDBOX_UID,
  SKILLS_DIR,
} from './constants'

test('sandbox paths and user values remain internally consistent', () => {
  expect(AGENT_INSTRUCTIONS_PATH).toBe(path.posix.join(CONTAINER_WORKDIR, 'AGENTS.md'))
  expect(CUSTOM_AGENTS_DIR).toBe(path.posix.join(COPILOT_DIR, 'agents'))
  expect(COPILOT_PLUGIN_SOURCES_DIR).toBe(path.posix.join(COPILOT_DIR, 'plugin-sources'))
  expect(MCP_CONFIG_PATH).toBe(path.posix.join(COPILOT_DIR, 'mcp-config.json'))
  expect(SKILLS_DIR).toBe(path.posix.join(AGENTS_DIR, 'skills'))
  expect(NODE_USER).toBe(`${SANDBOX_UID}:${SANDBOX_GID}`)
  expect(NPM_GLOBAL_DIR).toBe('/home/node/.npm-global')
})
