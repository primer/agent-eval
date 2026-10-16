import type {NextConfig} from 'next'

const exporting = process.env.AGENT_EVAL_UI_OUTPUT === 'export'

const config: NextConfig = {
  agentRules: false,
  output: exporting ? 'export' : 'standalone',
  basePath: exporting ? (process.env.AGENT_EVAL_UI_BASE_PATH ?? '') : '',
  trailingSlash: true,
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
  typedRoutes: true,
}

export default config
