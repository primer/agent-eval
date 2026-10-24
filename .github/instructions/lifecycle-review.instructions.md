---
applyTo: 'packages/agent-eval/src/**/*.ts'
excludeAgent: 'cloud-agent'
---

# Lifecycle review

For Copilot code review of changes to orchestration, lifecycle, or dependency
boundaries only. Skip unrelated parsing, formatting, and local data changes.

- Review the diff and enough caller, adapter, and test context to establish the
  affected contract. Use the architecture skill's dependency map for navigation,
  not as a rule that the current code must already satisfy.
- Flag changed retry scopes when they can repeat external effects, lose results,
  or reuse invalid resources. Identify the operation that now repeats or no
  longer retries and its observable consequence.
- Flag changed resource ownership when an acquired container, process, stream,
  or temporary directory can leak, be released too early, or mask a primary
  failure. Check acquisition failures and cleanup on rejection as well as success.
- Flag new infrastructure coupling when decision logic now requires real Docker,
  filesystem, network, or agent execution despite an existing appropriate seam.
  Explain the affected caller or lost isolation; an import alone is not a bug.
- Keep failed evaluation outcomes, execution errors, and unavailable presentation
  artifacts distinct. Flag a changed failure policy only with evidence of the
  contract it breaks or an unhandled consequence.
- Ground each finding in a changed file/line and supporting code or test evidence.
  Explain a reproducible failure path or concrete effect, plus the smallest useful
  correction or missing contract test. State uncertainty rather than inventing
  guarantees.
- Do not report pre-existing issues, speculative frameworks, generic architecture
  scores, or violations of an aspirational dependency map. Do not repeat lint or
  formatting feedback. Leave no finding when no supported regression exists.

These instructions focus advisory review, not architectural policy. Existing
contracts and intentional behavior changes are the authority; executable tests
in CI enforce behavior. Review advice does not replace those tests.
