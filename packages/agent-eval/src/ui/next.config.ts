import type {NextConfig} from 'next'

const {AGENT_EVAL_UI_BASE_PATH, AGENT_EVAL_UI_OUTPUT, AGENT_EVAL_UI_OUTPUT_DIRECTORY} = process.env

const basePath = AGENT_EVAL_UI_BASE_PATH ? AGENT_EVAL_UI_BASE_PATH : undefined
const distDir = AGENT_EVAL_UI_OUTPUT_DIRECTORY ? AGENT_EVAL_UI_OUTPUT_DIRECTORY : undefined
const output = AGENT_EVAL_UI_OUTPUT === 'export' ? 'export' : undefined

const config: NextConfig = {
  agentRules: false,
  basePath,
  distDir,
  output,
  reactCompiler: true,
  reactStrictMode: true,
  typedRoutes: true,
}

export default config
