'use client'

import type {TranscriptEntry, TrialDetails} from './run-details'

const detailsCache = new Map<string, Promise<TrialDetails>>()
const transcriptCache = new Map<string, Promise<Array<TranscriptEntry>>>()

function loadJson<T>(url: string, cache: Map<string, Promise<T>>): Promise<T> {
  const cached = cache.get(url)
  if (cached) {
    return cached
  }
  const pending: Promise<T> = fetch(url)
    .then(response => {
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`)
      }
      return response.json()
    })
    .catch(error => {
      cache.delete(url)
      throw error
    })
  cache.set(url, pending)
  return pending
}

function loadTrialDetails(url: string): Promise<TrialDetails> {
  return loadJson(url, detailsCache)
}

function loadTrialTranscript(url: string): Promise<Array<TranscriptEntry>> {
  return loadJson(url, transcriptCache)
}

export {loadTrialDetails, loadTrialTranscript}
