import type {NextConfig} from 'next'

const nextConfig: NextConfig = {
  reactCompiler: true,
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
}

export default nextConfig
