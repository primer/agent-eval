---
name: agent-eval-scenario-authoring
description: 'Use when creating or reviewing agent evaluation scenarios and experiments, especially when comparing a skill, instruction, agent, or tool treatment against a control. Covers causal isolation, prompt leakage, blank-slate fixtures, grader design, browser-based UI evaluation, and deciding whether a requirement belongs in an eval or deterministic tooling.'
---

# Agent Eval Scenario Authoring

Create scenarios that measure whether a treatment changes agent behavior. A
scenario is not a detailed implementation specification or a conventional test
fixture: it is a controlled task used to evaluate a hypothesis.

## Core rule

> Do not put requirements in the prompt when the experiment is intended to
> determine whether a treatment teaches those requirements.

The prompt should resemble the request a user would make without knowing which
skills, instructions, tools, or agents are available.

## Keep each surface separate

| Surface   | Purpose                                                             |
| --------- | ------------------------------------------------------------------- |
| Prompt    | States the user's task and genuine product constraints              |
| Fixture   | Provides only the starting project state needed to perform the task |
| Treatment | Supplies the knowledge or capability being evaluated                |
| Grader    | Privately measures evidence that the treatment affected the result  |

If the same requirement appears in both the prompt and the treatment, the
scenario cannot show that the treatment taught it.

## 1. Define the evaluation hypothesis

Write the hypothesis before creating files:

> With **[treatment]**, an agent is more likely to **[desired behavior]** while
> completing **[representative task]**.

The desired behavior must be attributable to the treatment. If the hypothesis
is unclear, narrow the experiment before adding a scenario.

Prefer one meaningful judgment per scenario. Combine related conventions only
when they naturally arise from one task and one treatment.

## 2. Decide whether this needs an eval

Use an agent eval for behavior that requires judgment, discovery, tool use, or
generalization, such as:

- Choosing the appropriate component architecture.
- Applying guidance to an example not copied from the guidance.
- Finding and reusing an existing primitive.
- Preserving compatibility during a refactor.
- Assigning accessibility responsibilities to the correct API.

Prefer linting, type checks, codemods, or repository tests for deterministic
rules that should always be enforced, such as:

- Forbidden imports or export shapes.
- Required metadata files.
- Naming and file-placement conventions.
- Invalid selectors or attributes detectable with an AST.
- Package export and changeset bookkeeping.

Deterministic checks may grade a broader scenario, but do not create a separate
agent scenario solely to test something a reliable static tool could enforce.

## 3. Write a treatment-blind prompt

Include:

- The task a design-system author or product engineer actually wants completed.
- Constraints that are genuinely part of the request.
- Compatibility requirements the user would explicitly care about.

Do not include:

- Instructions to use the treatment.
- Architecture, accessibility, testing, or documentation rules supplied by the
  treatment.
- A checklist copied from a skill.
- File names, API shapes, or implementation techniques unless the user truly
  requires them.
- Primer-specific terminology when the treatment is expected to supply Primer
  context.

Bad:

> Build an Accordion with flat exports, prop-getters, `data-component`
> attributes, optional region semantics, and accessibility tests.

Good:

> Build a new Accordion component for this design-system package.

## 4. Build a neutral fixture

Provide the smallest runnable project that makes the task possible.

For a from-scratch task:

- Start with framework and package scaffolding only.
- Leave public entry points empty when the agent is expected to author exports.
- Do not include component stubs, example APIs, TODO files, tests, stories, or
  documentation that reveal the expected solution.
- Do not leave previous implementations in generated output, caches,
  screenshots, snapshots, or source maps.

For a modification task:

- Include only the existing behavior the task is meant to change.
- Preserve realistic constraints and unrelated code needed to make the task
  representative.
- Avoid planting comments that summarize the treatment's guidance.

Control and treatment runs must receive identical prompts and fixtures. The
treatment should be the only meaningful difference.

## 5. Design the grader

Grade evidence, not one imagined implementation.

### Use source assertions narrowly

Source assertions are appropriate when the treatment explicitly prescribes a
convention that runtime behavior cannot prove, such as an RSC-safe export shape
or an internal hook remaining private.

Avoid source assertions that:

- Require an arbitrary file layout.
- Reject valid equivalent implementations.
- Match broad tokens that may appear for unrelated reasons.
- Enforce an API shape that neither the prompt nor treatment defines.

### Respect valid design decisions

If guidance requires the agent to make and document a decision, do not hard-code
one allowed outcome unless the guidance chooses it. Grade that:

- The decision was made deliberately.
- The chosen behavior is implemented consistently.
- The decision is recorded in a durable repository artifact.
- Relevant paths are covered by tests, stories, or metadata.

### Keep failures attributable

Each test title should describe one capability. A missing export should not
prevent every source-level assertion from running. Avoid top-level imports that
turn an incomplete implementation into a suite-wide startup error when dynamic
lookup can produce individual failures.

Before accepting a grader:

1. Run it against the untouched fixture and confirm failures are intentional.
2. Run it against a representative correct implementation.
3. Check that plausible alternative correct implementations can pass.
4. Confirm the grader itself runs in the same runtime used by the experiment.

## 6. Configure the experiment

- Change one treatment variable at a time.
- Use the fewest treatments needed to answer the hypothesis.
- Keep model, prompt, fixture, dependency versions, and runtime identical.
- Pin or vendor treatment content so future runs remain reproducible.
- Prefer examples not used as worked examples in the treatment when evaluating
  generalization. Use worked examples only when evaluating retrieval or direct
  instruction following.

The `agent-eval` CLI automatically includes its control treatment. Do not add a
duplicate control unless the experiment needs a distinct comparison condition.

## Review checklist

- [ ] The scenario has a written causal hypothesis.
- [ ] The prompt sounds like a real user request.
- [ ] The prompt does not restate treatment guidance.
- [ ] The fixture contains no implementation clues or stale generated code.
- [ ] The task tests judgment rather than only a lintable rule.
- [ ] The grader prioritizes observable behavior.
- [ ] Source assertions correspond to explicit treatment conventions.
- [ ] Optional or open design decisions are not graded as mandatory outcomes.
- [ ] Control and treatment differ only by the intended treatment.
- [ ] Baseline failures are granular and intentional.
- [ ] A representative correct solution passes.
