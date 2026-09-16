import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: process.env.PAGES_BASE_PATH,
  output: 'export',
  reactCompiler: true,
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
  typedRoutes: true,
}

export default nextConfig
