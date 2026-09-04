---
'@primer/agent-eval': minor
---

Add the `@primer/agent-eval/sandbox` entry point for sandbox runtimes, configuration, and constants.

Sandbox, Copilot plugin, and MCP types previously re-exported from `@primer/agent-eval/experiment` now come from this entry point. The concrete `Sandbox` class is replaced by a `Sandbox` interface with `SystemSandbox` and `VirtualSandbox` implementations. The entry point also exports host-aware creation options, command and copy result types, and sandbox path and user constants.
