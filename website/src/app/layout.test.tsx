import {renderToStaticMarkup} from 'react-dom/server'
import {expect, test, vi} from 'vitest'
import Layout from './layout'

vi.mock('next/navigation', () => {
  return {
    usePathname: () => {
      return '/'
    },
  }
})

test('renders Primer focus-visible markers on the server without suppressing hydration warnings', () => {
  const layout = (
    <Layout>
      <button>Focusable content</button>
    </Layout>
  )
  const html = renderToStaticMarkup(layout)
  const openingTag = /<html\b[^>]*>/.exec(html)?.[0]

  expect(openingTag).toContain('class="js-focus-visible"')
  expect(openingTag).toContain('data-js-focus-visible=""')
  expect(openingTag).toContain('data-color-mode="auto"')
  expect(openingTag).toContain('data-light-theme="light"')
  expect(openingTag).toContain('data-dark-theme="dark"')
  expect(Layout({children: null}).props.suppressHydrationWarning).not.toBe(true)
  expect(html).toContain('Focusable content')
})
