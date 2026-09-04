---
'@primer/agent-eval': minor
---

Add benchmark configuration, discovery, execution, and output APIs through the new `@primer/agent-eval/benchmark` entry point.

The package root also exports benchmark APIs with explicit names, including `defineBenchmarkConfig`, `getBenchmark`, `listBenchmarks`, `runBenchmark`, `getBenchmarkOutput`, `serializeBenchmarkOutput`, and `deserializeBenchmarkOutput`, along with benchmark configuration, result, capability, and output types.

The CLI can now select and run benchmarks from a benchmarks directory.
