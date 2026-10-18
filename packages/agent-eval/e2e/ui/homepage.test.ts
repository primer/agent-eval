import {test, expect} from '@playwright/test'

test('GET /', async ({page}) => {
  await page.goto('/')

  expect(await page.textContent('h1')).toBe('agent-eval')
})
