import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {normalizeBasePath} from './src/site-paths'

const basePath = normalizeBasePath(process.env.PAGES_BASE_PATH)

export default defineConfig({
  base: `${basePath}/`,
  plugins: [
    react(),
    {
      name: 'static-result-data',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          const url = new URL(request.url ?? '/', 'http://localhost')
          const pathname = url.pathname.startsWith(`${basePath}/`) ? url.pathname.slice(basePath.length) : url.pathname
          if (!/^\/(page-data|run-data|file-previews)\//.test(pathname)) return next()
          try {
            const module = await server.ssrLoadModule('/src/entry-server.tsx')
            const result: Response = await module.developmentResponse(pathname)
            response.statusCode = result.status
            result.headers.forEach((value, name) => response.setHeader(name, value))
            response.end(Buffer.from(await result.arrayBuffer()))
          } catch (error) {
            next(error)
          }
        })
      },
    },
  ],
  build: {outDir: 'dist/client', target: 'esnext'},
  ssr: {noExternal: ['@primer/react'], external: ['@primer/agent-eval']},
})
