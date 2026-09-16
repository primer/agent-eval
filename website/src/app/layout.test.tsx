import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test, vi} from 'vitest'
import Layout from './layout'

vi.mock('./components/PageHeader', () => {
  return {
    PageHeader: () => {
      return <header>Navigation</header>
    },
  }
})

test('renders the root attributes added by the focus-visible polyfill before hydration', () => {
  const html = renderToStaticMarkup(
    <Layout>
      <p>Content</p>
    </Layout>,
  )
  expect(html).toContain('class="js-focus-visible"')
  expect(html).toContain('data-js-focus-visible=""')
  expect(html).toContain('data-color-mode="auto"')
  expect(html).toContain('<main><p>Content</p></main>')
})
