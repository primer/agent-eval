import {describe, expect, test, vi} from 'vitest'
import {createCapturedStream} from './captured-stream'

describe('createCapturedStream', () => {
  test('logs complete lines while preserving captured output', () => {
    const onLine = vi.fn()
    const captured = createCapturedStream(onLine)

    captured.stream.write('first line\nsecond ')
    captured.stream.write('line\r\nthird line\r')
    captured.stream.write('\nfourth line\rfifth line')
    captured.flush()

    expect(onLine.mock.calls).toEqual([
      ['first line'],
      ['second line'],
      ['third line'],
      ['fourth line'],
      ['fifth line'],
    ])
    expect(captured.read()).toBe('first line\nsecond line\r\nthird line\r\nfourth line\rfifth line')
  })

  test('flushes a final line without a delimiter', () => {
    const onLine = vi.fn()
    const captured = createCapturedStream(onLine)

    captured.stream.write('final line')

    expect(onLine).not.toHaveBeenCalled()

    captured.flush()

    expect(onLine).toHaveBeenCalledOnce()
    expect(onLine).toHaveBeenCalledWith('final line')
  })

  test('preserves multibyte characters split across chunks', () => {
    const onLine = vi.fn()
    const captured = createCapturedStream(onLine)
    const output = Buffer.from('hello 👋\n')

    captured.stream.write(output.subarray(0, output.length - 3))
    captured.stream.write(output.subarray(output.length - 3))
    captured.flush()

    expect(onLine).toHaveBeenCalledWith('hello 👋')
    expect(captured.read()).toBe('hello 👋\n')
  })
})
