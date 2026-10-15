import path from 'node:path'
import type {Host} from '../host'

const instruction = 'When working with agent-eval, first read `node_modules/@primer/agent-eval/docs/AGENTS.md`.'
const startMarker = '<!-- BEGIN:agent-eval -->'
const endMarker = '<!-- END:agent-eval -->'

async function setupInstructions(host: Host, directory: string) {
  const candidates = ['AGENTS.md', '.github/copilot-instructions.md', 'copilot-instructions.md']
  let filepath = path.resolve(directory, 'AGENTS.md')
  let contents = ''

  for (const candidate of candidates) {
    const candidatePath = path.resolve(directory, candidate)
    if (host.fs.existsSync(candidatePath)) {
      contents = await host.fs.promises.readFile(candidatePath, 'utf-8')
      filepath = candidatePath
      break
    }
  }

  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const block = `${startMarker}${newline}## agent-eval${newline}${newline}${instruction}${newline}${endMarker}`
  const start = contents.indexOf(startMarker)
  const end = contents.indexOf(endMarker)

  if (start !== -1 || end !== -1) {
    if (
      start === -1 ||
      end < start ||
      contents.lastIndexOf(startMarker) !== start ||
      contents.lastIndexOf(endMarker) !== end
    ) {
      throw new Error(`Invalid agent-eval comment markers in ${filepath}; expected one matching BEGIN/END pair`)
    }

    const updatedContents = contents.slice(0, start) + block + contents.slice(end + endMarker.length)
    if (updatedContents === contents) {
      return {filepath, updated: false}
    }

    await host.fs.promises.writeFile(filepath, updatedContents, 'utf-8')
    return {filepath, updated: true}
  }

  if (contents.includes(instruction)) {
    return {filepath, updated: false}
  }

  const separator =
    contents.length === 0
      ? ''
      : contents.endsWith(`${newline}${newline}`)
        ? ''
        : contents.endsWith(newline)
          ? newline
          : `${newline}${newline}`
  await host.fs.promises.appendFile(filepath, `${separator}${block}${newline}`, 'utf-8')

  return {filepath, updated: true}
}

export {setupInstructions}
