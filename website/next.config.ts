import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: process.env.PAGES_BASE_PATH,
  // Next's development streaming/compression path retains drain listeners on large responses.
  compress: process.env.NODE_ENV !== 'development',
  output: 'export',
  reactCompiler: true,
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
  typedRoutes: true,
}

export default nextConfig
