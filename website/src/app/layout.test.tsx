import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test, vi} from 'vitest'
import Layout from './layout'
import fs from 'node:fs/promises'

vi.mock('./components/PageHeader', () => {
  return {
    PageHeader: () => {
      return <header>Navigation</header>
    },
  }
})

test('renders Primer focus-visible markers before hydration without suppressing hydration warnings', async () => {
  const layout = (
    <Layout>
      <button>Focusable content</button>
    </Layout>
  )
  const html = renderToStaticMarkup(layout)
  const template = await fs.readFile(new URL('../../index.html', import.meta.url), 'utf8')
  const openingTag = /<html\b[^>]*>/.exec(template)?.[0]

  expect(openingTag).toContain('class="js-focus-visible"')
  expect(openingTag).toContain('data-js-focus-visible=""')
  expect(openingTag).toContain('data-color-mode="auto"')
  expect(openingTag).toContain('data-light-theme="light"')
  expect(openingTag).toContain('data-dark-theme="dark"')
  expect(template).not.toContain('suppressHydrationWarning')
  expect(html).toContain('<main><button>Focusable content</button></main>')
})
