import 'server-only'
import path from 'node:path'
import {Fragment} from 'react'
import {bundledLanguages, bundledLanguagesInfo, codeToTokens, type BundledLanguage} from 'shiki'
import type {WorkspaceFile} from '../../workspace-files'
import styles from './FileExplorer.module.css'

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

async function FilePreview({file}: {file: WorkspaceFile}) {
  if (file.preview.type === 'unavailable') {
    return <p className="p-3 m-0 text-muted">{file.preview.reason}</p>
  }

  const content = file.preview.content
  if (content.length === 0) {
    return <p className="p-3 m-0 text-muted">This file is empty.</p>
  }

  const language = getFileLanguage(file.path)
  if (language === 'text') {
    return (
      <pre aria-label={file.path} className={styles.code} tabIndex={0}>
        <code>{content}</code>
      </pre>
    )
  }

  const {tokens} = await codeToTokens(content, {
    lang: language,
    themes: {light: 'github-light-default', dark: 'github-dark-default'},
    defaultColor: false,
  })
  let previousEnd = 0
  const highlighted = tokens.flat().map((token, index) => {
    // Token offsets let us retain the original line endings and blank lines.
    const gap = content.slice(previousEnd, token.offset)
    previousEnd = token.offset + token.content.length
    return (
      <Fragment key={index}>
        {gap}
        <span style={token.htmlStyle}>{token.content}</span>
      </Fragment>
    )
  })

  return (
    <pre aria-label={file.path} className={styles.code} tabIndex={0}>
      <code>
        {highlighted}
        {content.slice(previousEnd)}
      </code>
    </pre>
  )
}

export {FilePreview, getFileLanguage}
