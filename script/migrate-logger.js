import assert from 'node:assert/strict'
import {readdir, readFile, writeFile} from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import {fileURLToPath} from 'node:url'
import ts from 'typescript'

const root = fileURLToPath(new URL('../', import.meta.url))
const sourceRoot = path.join(root, 'packages/agent-eval/src')
const levels = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
const excludedDirectories = new Set(['node_modules', 'dist', 'generated', 'artifacts', '.next'])

function includesFile(filepath) {
  return (
    /\.[jt]sx?$/.test(filepath) &&
    !/\.(test|spec)\.[jt]sx?$/.test(filepath) &&
    filepath !== path.join(sourceRoot, 'logger.ts')
  )
}

async function discover(directory) {
  const files = []
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    const filepath = path.join(directory, entry.name)
    if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
      files.push(...(await discover(filepath)))
    } else if (entry.isFile() && includesFile(filepath)) {
      files.push(filepath)
    }
  }
  return files.sort()
}

function migrate(text, filepath = path.join(root, 'fixture.ts')) {
  const options = {
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  }
  const host = ts.createCompilerHost(options)
  const source = ts.createSourceFile(filepath, text, options.target, true)
  host.getSourceFile = filename => {
    return filename === filepath ? source : undefined
  }
  const checker = ts.createProgram([filepath], options, host).getTypeChecker()
  const imports = source.statements.filter(statement => {
    return (
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      statement.moduleSpecifier.text.startsWith('.') &&
      /\/logger(?:\.[jt]s)?$/.test(statement.moduleSpecifier.text) &&
      statement.importClause?.namedBindings &&
      ts.isNamedImports(statement.importClause.namedBindings)
    )
  })
  const targets = imports.flatMap(declaration => {
    return declaration.importClause.namedBindings.elements
      .filter(specifier => {
        return (specifier.propertyName ?? specifier.name).text === 'logger' && !specifier.isTypeOnly
      })
      .map(specifier => {
        return {
          declaration,
          specifier,
        }
      })
  })
  if (targets.length === 0) {
    return {text, calls: 0, retained: false}
  }
  if (targets.length !== 1) {
    throw new Error('Multiple logger imports are unsupported')
  }
  const {declaration, specifier} = targets[0]
  const symbol = checker.getSymbolAtLocation(specifier.name)
  const calls = []
  const names = new Set()
  let retained = false

  function visit(node) {
    if (ts.isIdentifier(node)) {
      if (node !== specifier.name && checker.getSymbolAtLocation(node) === symbol) {
        const access = node.parent
        if (!ts.isPropertyAccessExpression(access) || access.expression !== node || access.questionDotToken) {
          throw new Error(`Unsupported logger reference at offset ${node.getStart(source)}`)
        }
        if (levels.has(access.name.text)) {
          if (
            !ts.isCallExpression(access.parent) ||
            access.parent.expression !== access ||
            access.parent.questionDotToken
          ) {
            throw new Error(`Unsupported logger method reference at offset ${access.getStart(source)}`)
          }
          calls.push(access)
        } else {
          retained = true
        }
      } else if (!(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node)) {
        names.add(node.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  if (calls.length === 0) {
    return {text, calls: 0, retained}
  }

  const methods = [
    ...new Set(
      calls.map(call => {
        return call.name.text
      }),
    ),
  ].sort()
  const aliases = new Map()
  for (const method of methods) {
    let name = method
    if (names.has(name)) {
      const base = `log${method[0].toUpperCase()}${method.slice(1)}`
      name = base
      let suffix = 2
      while (names.has(name)) {
        name = `${base}${suffix++}`
      }
    }
    names.add(name)
    aliases.set(method, name)
  }
  const specifiers = declaration.importClause.namedBindings.elements
    .filter(element => {
      return element !== specifier || retained
    })
    .map(element => {
      return element.getText(source)
    })
  for (const method of methods) {
    const alias = aliases.get(method)
    specifiers.push(alias === method ? method : `${method} as ${alias}`)
  }
  if (declaration.importClause.name || declaration.importClause.isTypeOnly || declaration.attributes) {
    throw new Error('Default, type-only, or attributed logger imports are unsupported')
  }
  const replacements = [
    {
      start: declaration.getStart(source),
      end: declaration.end,
      text: `import {${specifiers.join(', ')}} from ${declaration.moduleSpecifier.getText(source)}`,
    },
    ...calls.map(call => {
      return {
        start: call.getStart(source),
        end: call.end,
        text: aliases.get(call.name.text),
      }
    }),
  ].sort((a, b) => {
    return b.start - a.start
  })
  for (const replacement of replacements) {
    text = text.slice(0, replacement.start) + replacement.text + text.slice(replacement.end)
  }
  return {text, calls: calls.length, retained}
}

function selfTest() {
  const fixtures = [
    {
      input: "import {logger} from './logger'\nlogger.info('hello')",
      expected: "import {info} from './logger'\ninfo('hello')",
    },
    {
      input: "import {logger} from './logger'\ntry {} catch (error) { logger.error({err: error}, 'failed') }",
      expected: "import {error as logError} from './logger'\ntry {} catch (error) { logError({err: error}, 'failed') }",
    },
    {
      input: "import {logger, levels} from './logger'\nlogger.level = 'debug'\nlogger.child({})\nlogger.debug('hello')",
      expected:
        "import {logger, levels, debug} from './logger'\nlogger.level = 'debug'\nlogger.child({})\ndebug('hello')",
    },
    {
      input: "import {logger as log} from './logger'\nlog.warn('hello')",
      expected: "import {warn} from './logger'\nwarn('hello')",
    },
    {
      input: "import {logger} from './logger'\nfunction run(logger) { logger.info('local') }\nlogger.info('global')",
      expected: "import {info} from './logger'\nfunction run(logger) { logger.info('local') }\ninfo('global')",
    },
  ]
  for (const fixture of fixtures) {
    const result = migrate(fixture.input)
    assert.equal(result.text, fixture.expected)
    assert.equal(migrate(result.text).text, result.text)
  }
  assert.throws(() => {
    migrate("import {logger} from './logger'\nconst write = logger.info")
  }, /Unsupported logger method reference/)
  assert.equal(includesFile(path.join(sourceRoot, 'logger.ts')), false)
  assert.equal(includesFile(path.join(sourceRoot, 'logger.test.ts')), false)
  assert.equal(includesFile(path.join(sourceRoot, 'example.browser.test.ts')), false)
  assert.equal(includesFile(path.join(sourceRoot, 'trial/run.ts')), true)
  console.log('Migration self-tests passed')
}

const mode = process.argv[2] ?? '--dry-run'
if (process.argv.length > 3 || !['--dry-run', '--write', '--check', '--self-test'].includes(mode)) {
  throw new Error('Usage: node script/migrate-logger.js [--dry-run|--write|--check|--self-test]')
}
if (mode === '--self-test') {
  selfTest()
} else {
  const changes = []
  for (const filepath of await discover(sourceRoot)) {
    const original = await readFile(filepath, 'utf8')
    const result = migrate(original, filepath)
    if (result.text !== original) {
      changes.push({filepath, ...result})
    }
  }
  for (const change of changes) {
    console.log(
      `${path.relative(root, change.filepath)}: ${change.calls} calls${change.retained ? ' (preserves direct non-level usage)' : ''}`,
    )
    if (mode === '--write') {
      await writeFile(change.filepath, change.text)
    }
  }
  console.log(`${changes.length} files ${mode === '--write' ? 'updated' : 'pending'}`)
  if (mode === '--check' && changes.length > 0) {
    process.exitCode = 1
  }
}
