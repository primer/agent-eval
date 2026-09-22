import {spawn} from 'node:child_process'
import {randomUUID} from 'node:crypto'
import fs from 'node:fs/promises'
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const directory = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function contains(parent, child) {
  const relative = path.relative(parent, child)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function canonicalPath(filepath) {
  try {
    return await fs.realpath(filepath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return path.join(await canonicalPath(path.dirname(filepath)), path.basename(filepath))
  }
}

async function packageDirectory(name) {
  let resolved
  try {
    resolved = require.resolve(`${name}/package.json`)
  } catch {
    resolved = require.resolve(name)
  }
  let current = path.dirname(resolved)
  for (;;) {
    try {
      const manifest = JSON.parse(await fs.readFile(path.join(current, 'package.json'), 'utf8'))
      if (manifest.name === name) return current
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error(`Cannot locate installed package "${name}"`)
    current = parent
  }
}

async function runNext(workspace, options) {
  const next = require.resolve('next/dist/bin/next')
  const args = [next, options.mode, '--webpack']
  if (options.mode === 'dev') args.push('--hostname', '127.0.0.1', '--port', options.port ?? '3000')
  const child = spawn(process.execPath, args, {
    cwd: workspace,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      AGENT_EVAL_UI_RESULTS: options.results,
      AGENT_EVAL_UI_MODE: options.mode,
      PAGES_BASE_PATH: options.basePath ?? '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  })
  let interrupted = false
  let timer
  function kill(signal) {
    if (!child.pid) return
    try {
      if (process.platform === 'win32') child.kill(signal)
      else process.kill(-child.pid, signal)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  function interrupt(signal) {
    interrupted = true
    process.exitCode = signal === 'SIGINT' ? 130 : 143
    kill(signal)
    timer ??= setTimeout(() => kill('SIGKILL'), 5000)
    timer.unref()
  }
  const onInterrupt = () => interrupt('SIGINT')
  const onTerminate = () => interrupt('SIGTERM')
  process.on('SIGINT', onInterrupt)
  process.on('SIGTERM', onTerminate)
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => {
        if (code === 0 || interrupted) resolve()
        else reject(new Error(`Next.js ${options.mode} failed (${signal ?? `exit ${code}`})`))
      })
    })
  } finally {
    clearTimeout(timer)
    process.off('SIGINT', onInterrupt)
    process.off('SIGTERM', onTerminate)
    kill('SIGTERM')
  }
  return !interrupted
}

/** @param {import('./runtime.js').UiOptions} options */
export async function runUi(options) {
  const results = await canonicalPath(path.resolve(options.results))
  let stats
  try {
    stats = await fs.stat(results)
  } catch (error) {
    if (options.mode !== 'dev' || error.code !== 'ENOENT') throw error
  }
  if (stats && !stats.isDirectory() && !stats.isFile()) throw new Error('Results must be a directory or JSON bundle')
  const basePath = options.basePath ?? ''
  if (basePath && !/^\/[A-Za-z0-9/_-]+$/.test(basePath)) throw new Error('Invalid UI base path')
  if (basePath.endsWith('/') || basePath.includes('//')) throw new Error('UI base path must not end with a slash')
  if (options.mode !== 'dev' && options.mode !== 'build') throw new Error('Unknown UI mode')
  if (options.port !== undefined && (!/^\d+$/.test(options.port) || +options.port < 1 || +options.port > 65535)) {
    throw new Error('UI port must be between 1 and 65535')
  }
  let output
  if (options.mode === 'build') {
    output = await canonicalPath(path.resolve(options.outputDirectory ?? 'out'))
    const dataRoot = stats.isDirectory() ? results : path.dirname(results)
    if (contains(dataRoot, output) || contains(output, dataRoot)) {
      throw new Error('UI output directory must not overlap the results directory')
    }
    try {
      if ((await fs.readdir(output)).length > 0) throw new Error('UI output directory must be empty')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  const workspace = path.join(process.cwd(), `.agent-eval-ui-${randomUUID()}`)
  await fs.mkdir(workspace)
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
    await fs.writeFile(
      path.join(workspace, 'package.json'),
      JSON.stringify({private: true, type: 'module', browserslist: ['defaults']}),
    )
    await fs.cp(path.join(directory, 'src'), path.join(workspace, 'src'), {
      recursive: true,
      filter: source =>
        !source.includes('.test.') && !source.endsWith('/test') && !source.endsWith('/test-fixtures.ts'),
    })
    const app = path.join(workspace, 'src/app')
    for (const entry of await fs.readdir(app)) {
      if (!['components', 'layout.tsx', 'globals.css'].includes(entry)) {
        await fs.rm(path.join(app, entry), {recursive: true, force: true})
      }
    }
    await fs.copyFile(path.join(directory, 'src/local/page.tsx'), path.join(app, 'page.tsx'))
    await fs.mkdir(path.join(app, 'local-data.json'))
    await fs.writeFile(
      path.join(app, 'local-data.json/route.ts'),
      `export {GET} from '../../local/data-route'\nexport const dynamic = '${options.mode === 'build' ? 'force-static' : 'force-dynamic'}'\n`,
    )
    await fs.mkdir(path.join(app, 'local-media/[...asset]'), {recursive: true})
    await fs.writeFile(
      path.join(app, 'local-media/[...asset]/route.ts'),
      `export {GET, generateStaticParams} from '../../../local/media-route'\nexport const dynamic = '${options.mode === 'build' ? 'force-static' : 'force-dynamic'}'\n`,
    )
    for (const name of ['tsconfig.json', 'postcss.config.js']) {
      await fs.copyFile(path.join(directory, name), path.join(workspace, name))
    }
    await fs.writeFile(
      path.join(workspace, 'next.config.mjs'),
      `export default ${JSON.stringify({
        agentRules: false,
        output: options.mode === 'build' ? 'export' : undefined,
        basePath,
        reactCompiler: true,
        reactStrictMode: true,
        serverExternalPackages: ['@primer/agent-eval'],
        experimental: {cpus: 2},
      })}\n`,
    )
    for (const name of Object.keys(manifest.dependencies)) {
      const destination = path.join(workspace, 'node_modules', name)
      await fs.mkdir(path.dirname(destination), {recursive: true})
      await fs.symlink(await packageDirectory(name), destination, 'junction')
    }
    if ((await runNext(workspace, {...options, results, basePath})) && output) {
      await fs.writeFile(path.join(workspace, 'out/.nojekyll'), '')
      await fs.mkdir(output, {recursive: true})
      for (const entry of await fs.readdir(path.join(workspace, 'out'))) {
        await fs.cp(path.join(workspace, 'out', entry), path.join(output, entry), {
          recursive: true,
          force: false,
          errorOnExist: true,
        })
      }
      console.log(`UI exported to ${output}`)
    }
  } finally {
    await fs.rm(workspace, {recursive: true, force: true})
  }
}
