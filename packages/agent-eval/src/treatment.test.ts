import {describe, expect, test, vi} from 'vitest'
import {VirtualSandbox} from './sandbox'
import {ControlTreatment, TreatmentSchema, TreatmentSetupSchema} from './treatment'

describe('TreatmentSchema', () => {
  test('parses the control treatment', () => {
    expect(TreatmentSchema.parse(ControlTreatment)).toEqual({
      name: 'Control',
    })
  })

  test('parses and runs a setup function', async () => {
    const setup = vi.fn(async () => {})
    const treatment = TreatmentSchema.parse({
      name: 'Example',
      setup,
    })
    const sandbox = await VirtualSandbox.create()

    await treatment.setup?.({sandbox})

    expect(setup).toHaveBeenCalledWith({sandbox})
  })

  test('rejects invalid setup return values', async () => {
    const setup = TreatmentSetupSchema.parse(() => {
      return 'invalid'
    })
    const sandbox = await VirtualSandbox.create()

    await expect(setup({sandbox})).rejects.toThrow()
  })
})
