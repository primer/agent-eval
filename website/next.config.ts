import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  agentRules: false,
  basePath: process.env.PAGES_BASE_PATH,
  output: 'export',
  // Keep production memoization without running Babel on every cold dev route.
  reactCompiler: process.env.NODE_ENV === 'production',
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
  typedRoutes: true,
}

export default nextConfig
