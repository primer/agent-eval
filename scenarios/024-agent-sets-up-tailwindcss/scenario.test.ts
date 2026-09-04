import fs from 'node:fs/promises'
import path from 'node:path'
import {expect, test} from 'vitest'

async function readOptional(relativePath: string): Promise<string> {
  try {
    return await fs.readFile(path.resolve(import.meta.dirname, relativePath), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

const packageJson = JSON.parse(await fs.readFile(path.resolve(import.meta.dirname, 'package.json'), 'utf8'))
const viteConfig = await readOptional('vite.config.ts')
const styles = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'styles.css'), 'utf8')
const app = await fs.readFile(path.resolve(import.meta.dirname, 'src', 'App.tsx'), 'utf8')
const dependencies = {...packageJson.dependencies, ...packageJson.devDependencies}

test('installs Tailwind CSS and its Vite plugin', () => {
  expect(dependencies).toHaveProperty('tailwindcss')
  expect(dependencies).toHaveProperty('@tailwindcss/vite')
})

test('configures the Tailwind Vite plugin', () => {
  expect(viteConfig).toMatch(/from\s+['"]@tailwindcss\/vite['"]/)
  expect(viteConfig).toMatch(/\btailwindcss\(\)/)
})

test('loads Tailwind CSS', () => {
  expect(styles).toMatch(/@import\s+['"]tailwindcss['"]/)
})

test('uses utility classes in the default page', () => {
  expect(app).toMatch(/className=["'][^"']*(?:flex|grid|gap-|p-|m-)[^"']*["']/)
})
