import {renderToStaticMarkup} from 'react-dom/server'
import type {Route} from 'next'
import {afterEach, expect, test, vi} from 'vitest'
import {createBenchmarkRunDetails, createExperimentRunDetails} from '../../run-details'
import type {WalkthroughUrls} from '../../run-details'
import {createBenchmarkOutput, createExperimentOutput, createTrial} from '../../test-fixtures'
import {RunDetailsPage} from './RunDetailsPage'
import {RunDetailsView} from './RunDetailsView'
import {UiWalkthrough} from './UiWalkthrough'
import {RunDetailsLoading} from './RunDetailsLoading'

vi.mock('server-only', () => {
  return {}
})
vi.mock('./RunDetailsView', async importOriginal => {
  const original = await importOriginal<typeof import('./RunDetailsView')>()
  return {RunDetailsView: vi.fn(original.RunDetailsView)}
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

const resource = {
  id: 'noop',
  name: 'Noop',
  collectionLabel: 'Experiments',
  collectionHref: '/experiments' as const,
  href: '/experiments/noop' as Route,
}

test('provides a selector for every repeated trial and the new checks tab', async () => {
  const run = await createExperimentRunDetails(
    '2026-09-15',
    createExperimentOutput([createTrial(), createTrial({id: 'trial-2'})]),
  )
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('Trial 1 (trial-1)')
  expect(html).toContain('Trial 2 (trial-2)')
  expect(html).toContain('result-0-checks-tab')
  expect(html).toContain('result-0-code-tab')
  expect(html).not.toContain('Tests passed')
  expect(html).toContain('No UI walkthrough was recorded.')
  expect(html).not.toContain('empty state renders')
})

test('renders an empty state for a current run without trials', () => {
  const html = renderToStaticMarkup(
    <RunDetailsPage
      resource={resource}
      run={{
        date: '2026-09-15',
        results: [],
      }}
    />,
  )

  expect(html).toContain('No trial results were recorded.')
})

test.each([
  {runner: undefined, label: 'Copilot CLI'},
  {runner: 'copilot-cli', label: 'Copilot CLI'},
  {runner: 'copilot-sdk', label: 'Copilot SDK'},
] as const)('labels the selected trial runner as $label ($runner)', async ({runner, label}) => {
  const run = await createExperimentRunDetails('2026-09-15', createExperimentOutput([createTrial({runner})]))
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain(`aria-label="Runner: ${label}"`)
  expect(html).toContain(`>${label}</span>`)
  expect(html).toContain('result-0-code-tab')
})

test('identifies each runner in the trial selector for a mixed run', async () => {
  const run = await createExperimentRunDetails(
    '2026-09-15',
    createExperimentOutput([createTrial({runner: 'copilot-cli'}), createTrial({id: 'trial-2', runner: 'copilot-sdk'})]),
  )
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('Trial 1 (trial-1) - Copilot CLI')
  expect(html).toContain('Trial 2 (trial-2) - Copilot SDK')
})

test.each(['benchmarks', 'experiments'] as const)(
  'passes lightweight %s preview references instead of file contents or tokens',
  async collection => {
    vi.stubEnv('PAGES_BASE_PATH', '/agent-eval')
    const content = 'const generatedSource = "not part of the run payload"\n'.repeat(1000)
    const run = await createExperimentRunDetails(
      '2026-09-03',
      createExperimentOutput([createTrial({id: 'trial 1', runner: 'copilot-sdk'})]),
      collection,
    )
    run.results[0].workspace = {
      type: 'available',
      truncated: false,
      entries: [
        {
          type: 'directory',
          name: 'src',
          path: 'src',
          children: [
            {
              type: 'file',
              name: 'index.ts',
              path: 'src/index.ts',
              size: content.length,
              preview: {type: 'text', content},
            },
          ],
        },
      ],
    }
    renderToStaticMarkup(
      <RunDetailsPage resource={{...resource, id: 'test-id', collectionHref: `/${collection}`}} run={run} />,
    )
    const props = vi.mocked(RunDetailsView).mock.calls[0][0]
    expect(props.run.results[0].runner).toBe('copilot-sdk')
    const payload = JSON.stringify(props.run)
    expect(payload).not.toContain('generatedSource')
    expect(payload).not.toContain('--shiki-')
    expect(payload).toContain(`/agent-eval/file-previews/${collection}/test-id/2026-09-03/trial%201/`)
    expect(payload).toContain('/preview.json')
    expect(payload).toContain(`/agent-eval/run-data/${collection}/`)
    expect(Buffer.byteLength(payload)).toBeLessThan(2000)
  },
)

test('keeps a shared scenario separate per capability and exposes capability filtering', async () => {
  const run = await createBenchmarkRunDetails({
    id: '2026-09-15',
    name: '2026-09-15',
    date: new Date('2026-09-15'),
    directory: '/results',
    output: createBenchmarkOutput([
      {...createTrial(), capabilityId: 'a'},
      {...createTrial({id: 'trial-2'}), capabilityId: 'b'},
    ]),
  })
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).toContain('First capability / empty-state')
  expect(html).toContain('Overlapping capability / empty-state')
  expect(html).toContain('All capabilities')
  expect(html).toContain('value="a"')
  expect(html).toContain('value="b"')
  const scenarioIds = [...html.matchAll(/<article[^>]+id="([^"]+)"/g)].map(match => {
    return match[1]
  })
  expect(scenarioIds).toHaveLength(2)
  expect(new Set(scenarioIds).size).toBe(2)
})

test.each([true, false])('reserves image placeholders before determining viewport loading when eager is %s', eager => {
  const html = renderToStaticMarkup(
    <UiWalkthrough
      scenarioId="example"
      eager={eager}
      walkthrough={{type: 'Screenshots', screenshots: ['/media/first.png', '/media/second.png']}}
    />,
  )
  const images = html.match(/<img[^>]+>/g) ?? []
  expect(images).toHaveLength(eager ? 1 : 0)
  if (eager) {
    expect(images[0]).toContain('loading="eager"')
  }
  expect(html).not.toContain('data:image')
  expect(html).not.toContain('/media/second.png')
  expect(html.match(/data-component="Spinner"/g)).toHaveLength(1)
  expect(html.match(/role="status"/g)).toHaveLength(2)
  expect(html.match(/aspect-\[8\/5\]/g)).toHaveLength(1)
})

test('renders one full-width carousel slide with labeled navigation and a live image count', () => {
  const html = renderToStaticMarkup(
    <UiWalkthrough
      scenarioId="example"
      eager
      walkthrough={{type: 'Screenshots', screenshots: ['/media/first.png', '/media/second.png']}}
    />,
  )
  expect(html).toContain('aria-roledescription="carousel"')
  expect(html).toContain('aria-label="UI walkthrough for example"')
  expect(html).toContain('aria-roledescription="slide"')
  expect(html).toContain('aria-label="1 of 2"')
  expect(html).toContain('aria-live="polite"')
  expect(html).toContain('Image 1 of 2')
  expect(html).toContain('alt="UI walkthrough step 1 for example"')
  expect(html).not.toContain('grid-cols')
  const previous = html.match(/<button[^>]*aria-label="Previous image"[^>]*>/)?.[0]
  const next = html.match(/<button[^>]*aria-label="Next image"[^>]*>/)?.[0]
  expect(previous).toContain('disabled=""')
  expect(next).toBeDefined()
  expect(next).not.toContain('disabled=""')
})

test.each([
  {type: 'Screenshot', screenshot: '/media/only.png'},
  {type: 'Screenshots', screenshots: ['/media/only.png']},
] satisfies Array<WalkthroughUrls>)('omits carousel controls for a single image ($type)', walkthrough => {
  const html = renderToStaticMarkup(<UiWalkthrough scenarioId="example" eager walkthrough={walkthrough} />)
  expect(html.match(/<img[^>]+>/g)).toHaveLength(1)
  expect(html).toContain('src="/media/only.png"')
  expect(html).not.toContain('Previous image')
  expect(html).not.toContain('Next image')
})

test('renders an empty state for an empty screenshots collection', () => {
  const html = renderToStaticMarkup(
    <UiWalkthrough scenarioId="example" eager walkthrough={{type: 'Screenshots', screenshots: []}} />,
  )
  expect(html).toContain('No UI walkthrough was recorded.')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('<button')
})

test('does not preload the bytes of an external walkthrough video', () => {
  const html = renderToStaticMarkup(
    <UiWalkthrough scenarioId="example" eager walkthrough={{type: 'Video', video: '/media/video.webm'}} />,
  )
  expect(html).toContain('preload="none"')
  expect(html).toContain('src="/media/video.webm"')
  expect(html).toContain('aspect-[8/5]')
  expect(html).not.toContain('data-component="Spinner"')
})

test('reserves one full-width browser frame while walkthrough details load', async () => {
  const run = await createExperimentRunDetails(
    '2026-09-15',
    createExperimentOutput([createTrial({walkthrough: {type: 'Screenshots', screenshots: ['one.png', 'two.png']}})]),
  )
  const html = renderToStaticMarkup(<RunDetailsPage resource={resource} run={run} />)
  expect(html).not.toContain('grid-cols-1 sm:grid-cols-2')
  expect(html.match(/data-component="Spinner"/g)).toHaveLength(1)
  expect(html.match(/aspect-\[8\/5\]/g)).toHaveLength(1)
  expect(html).toContain('Loading walkthrough image 1')
  expect(html).not.toContain('<img')
})

test.each(['checks', 'judges', 'transcript'] as const)(
  'uses Primer skeletons and an accessible spinner for %s',
  async tab => {
    const run = await createExperimentRunDetails('2026-09-15', createExperimentOutput())
    const html = renderToStaticMarkup(<RunDetailsLoading tab={tab} result={run.results[0]} />)
    expect(html).toContain('role="status"')
    expect(html).toContain(`Loading ${tab}`)
    expect(html).toContain('data-component="Spinner"')
    expect(html).toContain('data-component="SkeletonBox"')
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('min-h-64')
  },
)
