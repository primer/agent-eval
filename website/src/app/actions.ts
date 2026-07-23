'use server'

import {revalidatePath} from 'next/cache'
import {redirect} from 'next/navigation'
import type {CreateExperimentInput, CreateScenarioInput} from '../lib/domain'
import {
  createExperiment,
  createScenario,
  isModelId,
  queueExperimentRun,
  updateExperiment,
  updateScenario,
} from '../lib/repository'

function requiredString(formData: FormData, name: string): string {
  const value = formData.get(name)
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required.`)
  }
  return value.trim()
}

function stringList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean)
}

function lineList(formData: FormData, name: string): string[] {
  const value = formData.get(name)
  if (typeof value !== 'string') {
    return []
  }
  return value
    .split('\n')
    .map(item => item.trim())
    .filter(Boolean)
}

function experimentInput(formData: FormData): CreateExperimentInput {
  const models = stringList(formData, 'models').filter(isModelId)
  const scenarioIds = stringList(formData, 'scenarioIds')
  const treatments = lineList(formData, 'treatments').map(name => ({name, description: ''}))
  if (models.length === 0 || scenarioIds.length === 0 || treatments.length === 0) {
    throw new Error('At least one model, scenario, and treatment are required.')
  }
  return {
    name: requiredString(formData, 'name'),
    description: requiredString(formData, 'description'),
    models,
    scenarioIds,
    treatments,
  }
}

function scenarioInput(formData: FormData): CreateScenarioInput {
  return {
    name: requiredString(formData, 'name'),
    description: requiredString(formData, 'description'),
    prompt: requiredString(formData, 'prompt'),
    tags: lineList(formData, 'tags'),
  }
}

export async function createExperimentAction(formData: FormData) {
  const experiment = createExperiment(experimentInput(formData))
  revalidatePath('/')
  revalidatePath('/experiments')
  redirect(`/experiments/${experiment.id}`)
}

export async function updateExperimentAction(id: string, formData: FormData) {
  updateExperiment(id, experimentInput(formData))
  revalidatePath('/')
  revalidatePath('/experiments')
  revalidatePath(`/experiments/${id}`)
  redirect(`/experiments/${id}?saved=1`)
}

export async function queueExperimentRunAction(id: string) {
  const run = queueExperimentRun(id)
  revalidatePath('/')
  revalidatePath(`/experiments/${id}`)
  redirect(`/experiments/${id}?run=${run.id}`)
}

export async function createScenarioAction(formData: FormData) {
  const scenario = createScenario(scenarioInput(formData))
  revalidatePath('/')
  revalidatePath('/scenarios')
  redirect(`/scenarios/${scenario.id}`)
}

export async function updateScenarioAction(id: string, formData: FormData) {
  updateScenario(id, scenarioInput(formData))
  revalidatePath('/')
  revalidatePath('/scenarios')
  revalidatePath(`/scenarios/${id}`)
  redirect(`/scenarios/${id}?saved=1`)
}
