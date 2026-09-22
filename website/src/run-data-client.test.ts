import {afterEach, beforeEach, expect, test, vi} from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('deduplicates in-flight loads and reuses loaded details without fetching transcripts', async () => {
  const details = {id: 'trial', checks: [], judges: [], walkthrough: {type: 'Unavailable'}}
  const fetchMock = vi.fn().mockResolvedValue(Response.json(details))
  vi.stubGlobal('fetch', fetchMock)
  const {loadTrialDetails} = await import('./run-data-client')
  const first = loadTrialDetails('/trial/details.json')
  expect(loadTrialDetails('/trial/details.json')).toBe(first)
  expect(await first).toEqual(details)
  expect(await loadTrialDetails('/trial/details.json')).toEqual(details)
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/trial/details.json')
})

test('loads and caches transcripts separately when requested', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => {
    return Response.json([])
  })
  vi.stubGlobal('fetch', fetchMock)
  const {loadTrialTranscript} = await import('./run-data-client')
  expect(await loadTrialTranscript('/trial/transcript.json')).toEqual([])
  expect(await loadTrialTranscript('/trial/transcript.json')).toEqual([])
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/trial/transcript.json')
})

test('does not retain inline local snapshots in the global request cache', async () => {
  const fetchMock = vi.fn().mockImplementation(async () => Response.json([]))
  vi.stubGlobal('fetch', fetchMock)
  const {loadTrialTranscript} = await import('./run-data-client')
  const url = 'data:application/json;base64,W10='
  expect(await loadTrialTranscript(url)).toEqual([])
  expect(await loadTrialTranscript(url)).toEqual([])
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

test.each([
  {
    name: 'HTTP errors',
    response: () => {
      return new Response('Not found', {status: 404})
    },
  },
  {
    name: 'invalid JSON',
    response: () => {
      return new Response('{')
    },
  },
])('surfaces $name and permits retry instead of caching a failed request', async ({response}) => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response()).mockResolvedValueOnce(Response.json([]))
  vi.stubGlobal('fetch', fetchMock)
  const {loadTrialTranscript} = await import('./run-data-client')
  await expect(loadTrialTranscript('/trial/transcript.json')).rejects.toThrow()
  expect(await loadTrialTranscript('/trial/transcript.json')).toEqual([])
  expect(fetchMock).toHaveBeenCalledTimes(2)
})
