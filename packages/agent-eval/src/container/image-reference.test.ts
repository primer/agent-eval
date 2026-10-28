import {expect, test} from 'vitest'
import {ImageTag} from './image-tag'
import {ImageReference} from './image-reference'

test('create image reference', () => {
  const tag = ImageTag.create({
    dockerfile: 'FROM scratch',
  })
  const path = 'test'
  const ref = ImageReference.create({
    path,
    tag,
  })
  expect(ref.unwrap()).toBe(`${path}:${tag.unwrap()}`)
})

test('create image reference with namespace', () => {
  const tag = ImageTag.create({
    dockerfile: 'FROM scratch',
  })
  const namespace = 'namespace'
  const path = 'test'
  const ref = ImageReference.create({
    namespace,
    path,
    tag,
  })
  expect(ref.unwrap()).toBe(`${namespace}/${path}:${tag.unwrap()}`)
})

test('create image reference with nested path', () => {
  const tag = ImageTag.create({
    dockerfile: 'FROM scratch',
  })
  const path = 'test/nested'
  const ref = ImageReference.create({
    path,
    tag,
  })
  expect(ref.unwrap()).toBe(`${path}:${tag.unwrap()}`)
})

test('create image reference with nested path and namespace', () => {
  const tag = ImageTag.create({
    dockerfile: 'FROM scratch',
  })
  const namespace = 'namespace'
  const path = 'test/nested'
  const ref = ImageReference.create({
    namespace,
    path,
    tag,
  })
  expect(ref.unwrap()).toBe(`${namespace}/${path}:${tag.unwrap()}`)
})
