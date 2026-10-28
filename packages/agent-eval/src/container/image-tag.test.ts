import {expect, test} from 'vitest'
import {ImageTag, type CreateImageTagOptions} from './image-tag'

test('same input produces same tag', () => {
  const dockerfile: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
  }
  expect(ImageTag.create(dockerfile).unwrap()).toEqual(ImageTag.create(dockerfile).unwrap())

  const context: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    context: 'context',
  }
  expect(ImageTag.create(context).unwrap()).toEqual(ImageTag.create(context).unwrap())

  const buildargs: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    buildargs: {
      FOO: 'bar',
    },
  }
  expect(ImageTag.create(buildargs).unwrap()).toEqual(ImageTag.create(buildargs).unwrap())

  const buildargsWithContext: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    context: 'context',
    buildargs: {
      FOO: 'bar',
    },
  }
  expect(ImageTag.create(buildargsWithContext).unwrap()).toEqual(ImageTag.create(buildargsWithContext).unwrap())

  const files: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    files: {
      'file.txt': 'content',
    },
  }
  expect(ImageTag.create(files).unwrap()).toEqual(ImageTag.create(files).unwrap())

  const filesWithContext: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    context: 'context',
    files: {
      'file.txt': 'content',
    },
  }
  expect(ImageTag.create(filesWithContext).unwrap()).toEqual(ImageTag.create(filesWithContext).unwrap())
})

test('new dockerfile changes tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
  }
  const original = ImageTag.create(input)

  const changed = ImageTag.create({
    ...input,
    dockerfile: 'FROM alpine',
  })

  expect(changed.unwrap()).not.toEqual(original.unwrap())
})

test('new context changes tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    context: 'context',
  }
  const original = ImageTag.create(input)

  const changed = ImageTag.create({
    ...input,
    context: 'new-context',
  })

  expect(changed.unwrap()).not.toEqual(original.unwrap())
})

test('new buildarg changes tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    buildargs: {
      FOO: 'bar',
    },
  }
  const original = ImageTag.create(input)

  const added = ImageTag.create({
    ...input,
    buildargs: {
      ...input.buildargs,
      BAZ: 'qux',
    },
  })
  const renamed = ImageTag.create({
    ...input,
    buildargs: {
      BAZ: 'bar',
    },
  })
  const changed = ImageTag.create({
    ...input,
    buildargs: {
      FOO: 'baz',
    },
  })

  expect(added.unwrap()).not.toEqual(original.unwrap())
  expect(renamed.unwrap()).not.toEqual(original.unwrap())
  expect(changed.unwrap()).not.toEqual(original.unwrap())
})

test('new file changes tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    files: {
      'file.txt': 'content',
    },
  }
  const original = ImageTag.create(input)

  const added = ImageTag.create({
    ...input,
    files: {
      ...input.files,
      'other.txt': 'other content',
    },
  })
  const renamed = ImageTag.create({
    ...input,
    files: {
      'other.txt': 'content',
    },
  })
  const changed = ImageTag.create({
    ...input,
    files: {
      'file.txt': 'new content',
    },
  })

  expect(added.unwrap()).not.toEqual(original.unwrap())
  expect(renamed.unwrap()).not.toEqual(original.unwrap())
  expect(changed.unwrap()).not.toEqual(original.unwrap())
})

test('reordering buildargs produces same tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    buildargs: {
      FOO: 'bar',
      BAZ: 'qux',
    },
  }
  const original = ImageTag.create(input)

  const reordered = ImageTag.create({
    ...input,
    buildargs: {
      BAZ: 'qux',
      FOO: 'bar',
    },
  })

  expect(reordered.unwrap()).toEqual(original.unwrap())
})

test('reordering files produces same tag', () => {
  const input: CreateImageTagOptions = {
    dockerfile: 'FROM scratch',
    files: {
      'file.txt': 'content',
      'other.txt': 'other content',
    },
  }
  const original = ImageTag.create(input)

  const reordered = ImageTag.create({
    ...input,
    files: {
      'other.txt': 'other content',
      'file.txt': 'content',
    },
  })

  expect(reordered.unwrap()).toEqual(original.unwrap())
})
