import path from 'node:path'

/**
 * Working directory inside the sandbox.
 */
const CONTAINER_WORKDIR = '/home/sandbox/workspace'

/**
 * Directory for Copilot CLI configuration.
 */
const COPILOT_DIR = '/home/node/.copilot'

/**
 * Directory for custom Copilot agents.
 */
const CUSTOM_AGENTS_DIR = '/home/node/.copilot/agents'

/**
 * Directory for agent configuration and skills.
 */
const AGENTS_DIR = '/home/node/.agents'

/**
 * Directory for agent skills.
 */
const SKILLS_DIR = '/home/node/.agents/skills'

/**
 * Directory for local plugin sources copied into the sandbox.
 */
const COPILOT_PLUGIN_SOURCES_DIR = path.posix.join(COPILOT_DIR, 'plugin-sources')

/**
 * Path for project agent instructions.
 */
const AGENT_INSTRUCTIONS_PATH = path.posix.join(CONTAINER_WORKDIR, 'AGENTS.md')

/**
 * Path for MCP server configuration.
 */
const MCP_CONFIG_PATH = path.posix.join(COPILOT_DIR, 'mcp-config.json')

/**
 * Node.js images provide a non-root node user with this UID and GID.
 */
const SANDBOX_UID = 1000
const SANDBOX_GID = 1000
const NODE_USER = `${SANDBOX_UID}:${SANDBOX_GID}` as const

/**
 * Directory for npm packages installed globally by the non-root user.
 */
const NPM_GLOBAL_DIR = '/home/node/.npm-global'

export {
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
}
