import 'server-only'
import path from 'node:path'
import {bundledLanguages, bundledLanguagesInfo, codeToTokens, type BundledLanguage} from 'shiki'
import type {FilePreviewData} from './file-preview'
import type {WorkspaceFile} from './workspace-files'

const languages = new Map<string, string>()
for (const language of bundledLanguagesInfo) {
  languages.set(language.id, language.id)
  for (const alias of language.aliases ?? []) {
    languages.set(alias, language.id)
  }
}

function isBundledLanguage(language: string): language is BundledLanguage {
  return Object.hasOwn(bundledLanguages, language)
}

function getFileLanguage(filepath: string): BundledLanguage | 'text' {
  const name = path.posix.basename(filepath).toLowerCase()
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) {
    return 'docker'
  }
  if (name === 'makefile' || name === 'gnumakefile') {
    return 'make'
  }
  if (name === '.env' || name.startsWith('.env.')) {
    return 'dotenv'
  }
  const language = languages.get(path.posix.extname(name).slice(1))
  return language && isBundledLanguage(language) ? language : 'text'
}

async function highlightFile(file: WorkspaceFile): Promise<FilePreviewData> {
  if (file.preview.type === 'unavailable' || file.preview.content.length === 0) {
    return file.preview
  }

  const content = file.preview.content
  const language = getFileLanguage(file.path)
  if (language === 'text') {
    return {type: 'text', content}
  }

  const {tokens} = await codeToTokens(content, {
    lang: language,
    themes: {light: 'github-light-default', dark: 'github-dark-default'},
    defaultColor: false,
  })
  return {
    type: 'highlighted',
    content,
    tokens: tokens.flat().map(token => {
      return {content: token.content, offset: token.offset, style: token.htmlStyle ?? {}}
    }),
  }
}

export {getFileLanguage, highlightFile}
export {getFilePreviewKey} from './file-preview-key'
