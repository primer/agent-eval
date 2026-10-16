/** @type {import('next').NextConfig} */
const config = {
  agentRules: false,
  trailingSlash: true,
  reactStrictMode: true,
  serverExternalPackages: ['@primer/agent-eval'],
  typedRoutes: true,
}

export default config
