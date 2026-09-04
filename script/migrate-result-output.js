#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

const [resultsDirectory] = process.argv.slice(2)

if (!resultsDirectory) {
  throw new Error('Usage: migrate-result-output.js <results-directory>')
}

const outputFiles = await findOutputFiles(path.resolve(resultsDirectory))
let migratedCount = 0

for (const outputFile of outputFiles) {
  if (await migrateOutput(outputFile)) {
    migratedCount += 1
  }
}

console.log(`Migrated ${migratedCount} result bundle${migratedCount === 1 ? '' : 's'}`)

async function findOutputFiles(directory) {
  let entries
  try {
    entries = await fs.readdir(directory, {withFileTypes: true})
  } catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }

    throw error
  }

  const files = []
  for (const entry of entries) {
    const filepath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await findOutputFiles(filepath)))
    } else if (entry.isFile() && entry.name === 'output.json') {
      files.push(filepath)
    }
  }

  return files
}

async function migrateOutput(outputFile) {
  const output = JSON.parse(await fs.readFile(outputFile, 'utf-8'))
  if (!isRecord(output) || !isRecord(output.trials)) {
    throw new Error(`Result output does not contain a trials map: ${outputFile}`)
  }

  const trials = Object.entries(output.trials)
  if (
    trials.some(([, trial]) => {
      return typeof trial !== 'string' && !isRecord(trial)
    })
  ) {
    throw new Error(`Result output contains mixed trial formats: ${outputFile}`)
  }

  const outputDirectory = path.dirname(outputFile)
  const references = {}
  const sourceFiles = []
  let changed = false

  for (const [trialId, value] of trials) {
    const sourceFile = typeof value === 'string' ? path.resolve(outputDirectory, value) : undefined
    const trial = typeof value === 'string' ? JSON.parse(await fs.readFile(sourceFile, 'utf-8')) : value
    if (trial.id !== trialId) {
      throw new Error(`Trial map key "${trialId}" does not match trial id "${trial.id}"`)
    }
    if (!isRecord(trial.artifacts) || typeof trial.artifacts.directory !== 'string') {
      throw new Error(`Trial "${trialId}" does not contain an artifact directory`)
    }
    if (path.isAbsolute(trial.artifacts.directory)) {
      throw new Error(`Trial "${trialId}" contains a non-portable artifact directory`)
    }

    const artifactDirectory = path.resolve(outputDirectory, trial.artifacts.directory)
    const trialFile = path.join(artifactDirectory, `${trialId}.json`)
    const relativeTrialFile = path.relative(outputDirectory, trialFile)
    if (relativeTrialFile.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTrialFile)) {
      throw new Error(`Trial "${trialId}" resolves outside its result bundle`)
    }

    await fs.mkdir(path.dirname(trialFile), {recursive: true})
    await fs.writeFile(trialFile, JSON.stringify(trial), 'utf-8')
    references[trialId] = relativeTrialFile.split(path.sep).join(path.posix.sep)
    if (value !== references[trialId]) {
      changed = true
    }
    if (sourceFile && sourceFile !== trialFile) {
      sourceFiles.push(sourceFile)
    }
  }

  if (!changed) {
    return false
  }

  await fs.writeFile(
    outputFile,
    JSON.stringify({
      ...output,
      trials: references,
    }),
    'utf-8',
  )

  await Promise.all(
    sourceFiles.map(sourceFile => {
      return fs.unlink(sourceFile)
    }),
  )

  return true
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
