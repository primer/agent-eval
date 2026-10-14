import path from 'node:path'
import type {Host} from '../host'

const instruction = 'When working with agent-eval, first read `node_modules/@primer/agent-eval/docs/AGENTS.md`.'

async function setupInstructions(host: Host, directory: string) {
  const candidates = ['AGENTS.md', '.github/copilot-instructions.md', 'copilot-instructions.md']
  let filepath = path.resolve(directory, 'AGENTS.md')
  let contents = ''

  for (const candidate of candidates) {
    const candidatePath = path.resolve(directory, candidate)
    try {
      contents = await host.fs.promises.readFile(candidatePath, 'utf-8')
      filepath = candidatePath
      break
    } catch (error) {
      if (typeof error !== 'object' || error === null || !('code' in error) || error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  if (contents.includes(instruction)) {
    return {filepath, updated: false}
  }

  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const separator =
    contents.length === 0
      ? ''
      : contents.endsWith(`${newline}${newline}`)
        ? ''
        : contents.endsWith(newline)
          ? newline
          : `${newline}${newline}`
  await host.fs.promises.appendFile(
    filepath,
    `${separator}## agent-eval${newline}${newline}${instruction}${newline}`,
    'utf-8',
  )

  return {filepath, updated: true}
}

export {setupInstructions}
