type EvalConfig = {
  prompt: string
  testFiles: Array<string>
}

function defineConfig(config: EvalConfig) {
  return config
}

export type {EvalConfig}
export {defineConfig}
