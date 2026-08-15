---
name: agent-resource-evaluation
description: 'Use when designing, testing, or refining an LLM-facing resource such as a skill, repository instruction, prompt, custom agent, documentation bundle, or MCP setup. Creates treatment-blind agent-eval scenarios, compares resource treatments against control, and iterates in quick or confidence-building mode.'
---

# Agent Resource Evaluation

Find the most effective resource for helping an agent accomplish a user's goal.
Translate the goal into representative scenarios, compare a small number of
causally isolated treatments, run the experiment, and refine the resource from
observed failures.

This workflow applies to resources such as:

- Agent skills
- Repository or system instructions
- Prompt templates
- Custom agents
- Documentation or context bundles
- MCP servers and tool instructions

Do not optimize the prose of a resource without evaluating the behavior it is
intended to produce.

## Minimal satisfying resource

Optimize for the **smallest resource that reliably satisfies the goal**, not
the resource with the highest score regardless of size.

Use this ordering:

1. Reject candidates that do not meet the required behavioral threshold or
   introduce unacceptable regressions.
2. Among satisfying candidates, prefer the one with the smallest resource
   footprint.
3. When candidates are similarly small, prefer lower runtime cost and latency.
4. Keep additional content only when evidence shows that it improves behavior
   or protects an important regression.

Measure resource footprint with the most meaningful available unit:

- Tokens for prompts, instructions, skills, and documentation supplied to the
  model.
- Words or characters when exact tokenization is unavailable.
- Loaded files, retrieved context, tool descriptions, or setup overhead for
  compound resources.

Record both the total size and the incremental size over control. Do not choose
the shortest candidate when it is less reliable; minimal means **no larger than
necessary to satisfy the goal**.

## Choose a mode

Use **Quick mode** by default. Use **Confidence mode** when the user requests a
thorough evaluation, the resource is high impact, or a candidate has performed
well enough to justify a broader check.

|                     | Quick mode                                 | Confidence mode                                       |
| ------------------- | ------------------------------------------ | ----------------------------------------------------- |
| Purpose             | Find a useful direction quickly            | Build confidence that the result generalizes          |
| Models              | One representative model and effort        | Multiple relevant models and efforts                  |
| Scenarios           | One or two high-signal scenarios           | A diverse suite including at least one holdout        |
| Resource treatments | One or two candidates                      | Only promising candidates from Quick mode             |
| Iterations          | Usually one or two                         | Continue until evidence stabilizes or budget is spent |
| Repetitions         | One run per condition unless results tie   | Repeat important conditions to check stochasticity    |
| User feedback       | Optional checkpoint after the first result | Optional checkpoints at each promotion decision       |

The CLI automatically adds the control treatment. Do not add another control
unless it represents a genuinely distinct condition.

## 1. Frame the goal

Determine what the user wants the resource to change in agent behavior.

Capture:

- The resource type and where it will be used.
- The target users, repositories, tasks, and agent environment.
- The behavior the agent should perform more reliably.
- Important behaviors the resource must preserve.
- Existing resource content, if any.
- Constraints such as latency, token usage, tool availability, maintenance
  cost, or supported models.
- The minimum acceptable behavior and any non-negotiable regression limits.
- The resource-size unit and budget, when the user has one.
- What evidence would convince the user that the resource is successful.

Express the primary hypothesis before creating files:

> With **[resource treatment]**, an agent is more likely to **[desired
> behavior]** while completing **[representative task]**.

If there are multiple independent goals, separate them into hypotheses. Do not
hide conflicting goals inside one aggregate score.

### Feedback preference

Default to autonomous iteration. If the user asks to participate, establish
which checkpoints they want:

1. Approve the behavioral goal and scenario coverage.
2. Review the first experiment results and failure examples.
3. Choose which candidate or tradeoff to promote.

Use structured user questions at those checkpoints. Between checkpoints,
continue independently.

## 2. Decide what belongs in the eval

Use agent scenarios for behavior involving judgment, discovery, tool use,
instruction following, or generalization.

Use deterministic tests, linting, schemas, or type checks for rules that can be
reliably enforced without an agent. Deterministic checks may contribute to a
scenario's grader, but do not use an expensive agent eval to rediscover a
static validation rule.

## 3. Design treatment-blind scenarios

For each hypothesis, create a realistic task that could reveal whether the
resource changed agent behavior.

Keep the surfaces separate:

| Surface   | Responsibility                                      |
| --------- | --------------------------------------------------- |
| Prompt    | The user's task and genuine product constraints     |
| Fixture   | The neutral starting project                        |
| Treatment | The resource or capability being compared           |
| Grader    | Private evidence that the desired behavior occurred |

Never copy the resource's instructions into the scenario prompt. Control and
treatment runs must receive identical prompts and fixtures.

Unless the user requests another base, start from
`scenarios/000-nextjs-template`. Add new scenarios with the next sequence
number. Follow the repository's scenario-authoring guidance for blank-slate
fixtures, causal isolation, and graders.

### Quick scenario selection

Choose one task that:

- Is common or consequential for the intended resource.
- Requires the behavior the resource is meant to teach.
- Is difficult enough that control may fail but not so broad that failures are
  ambiguous.

Add a second scenario only when it covers a materially different form of the
same behavior or protects against an important regression.

### Confidence scenario selection

Expand coverage across meaningful dimensions such as:

- Common and difficult tasks.
- New implementation and modification tasks.
- Direct application and generalization.
- Different project contexts or constraints.
- A likely misuse or regression case.

Reserve at least one scenario as a holdout. Do not use its detailed failures to
rewrite the resource before the final comparison.

## 4. Build graders

Grade observable evidence rather than one imagined implementation.

Prefer:

- Runtime behavior and user-visible outcomes.
- Granular tests whose names describe one capability.
- Source assertions only for conventions explicitly supplied by the resource
  that runtime behavior cannot prove.
- Separate checks for desired behavior and regressions.

Before using a grader, confirm:

1. The untouched fixture fails for the intended reasons.
2. A representative correct implementation passes.
3. Plausible alternative correct implementations can pass.
4. One missing artifact does not prevent unrelated checks from running.

Do not revise a grader merely to make a favored treatment win. Fix it only when
it does not measure the stated goal.

## 5. Create resource treatments

Create the experiment in `experiments/<descriptive-name>.ts` with a named
`experiment` export created by `defineConfig`.

Treatments should test explicit hypotheses about the resource. Examples:

- Concise procedural instructions versus explanatory guidance.
- A satisfying candidate versus an ablated or compressed version.
- Bundled reference material versus instructions alone.
- An always-on repository instruction versus a discoverable skill.
- An MCP server alone versus the server with activation instructions.

Use the fewest treatments that can answer the current question:

- Quick mode: usually two candidate treatments at most.
- Confidence mode: promote the best candidate and only close alternatives that
  test a meaningful unresolved tradeoff.

Change one treatment variable at a time. Keep the prompt, fixture, model,
reasoning effort, dependencies, and runtime identical. Pin or vendor candidate
resource content so each result is reproducible.

Treat added content as a cost that must justify itself. Once a candidate
satisfies the behavioral threshold, prefer subtraction experiments:

1. Remove one section, example, file, or instruction category.
2. Rerun the affected comparison.
3. Keep the removal if behavior remains within the success and regression
   thresholds.
4. Repeat until the next removal causes a meaningful loss.

Do not use treatment names that reveal expectations such as "improved" or
"correct." Use neutral names based on the actual difference.

## 6. Configure and run

### Quick mode

Configure exactly one representative model and one reasoning effort. Prefer a
model already used by the repository or specified by the user. Do not begin by
running every supported model.

Run the selected experiment with unique output and artifact paths:

```sh
COPILOT_GITHUB_TOKEN=... pnpm exec agent-eval \
  --experiment ./experiments/<name>.ts \
  --scenarios ./scenarios \
  --output <temporary-results-path>.json \
  --artifacts <temporary-artifacts-path>
```

### Confidence mode

Start from the best observed Quick-mode candidate. Expand the experiment to a
small, relevant model set and the broader scenario suite. Avoid spending a
broad run on candidates that did not beat control or explain a useful
tradeoff.

For important or close comparisons, repeat runs with separate output and
artifact paths. Treat one unusually good run as weak evidence.

Do not commit result files or runtime artifacts unless the user explicitly asks
for them.

## 7. Analyze results

Compare each treatment with control and with the other candidates.

Evaluate:

- Test pass rate overall and per scenario.
- Which specific capabilities improved or regressed.
- Whether the treatment caused the intended behavior for the intended reason.
- Resource size and marginal behavior gained per added token, word, file, or
  other selected size unit.
- Output tokens, premium requests, latency, and other user constraints.
- Variance across models or repeated runs.
- Whether one scenario dominates the aggregate score.

Inspect the generated artifacts when a score alone cannot explain the result.
Classify failures before editing the resource:

| Failure class         | Response                                                         |
| --------------------- | ---------------------------------------------------------------- |
| Resource failure      | Refine the candidate resource                                    |
| Scenario leakage      | Remove treatment knowledge from the prompt or fixture            |
| Grader defect         | Correct the grader, then rerun all affected conditions           |
| Agent/runtime failure | Rerun or fix infrastructure without crediting a resource         |
| Goal ambiguity        | Reframe the hypothesis; use user feedback if checkpoints enabled |

Report a **best observed candidate**, not a universally best resource, unless
the evidence supports that stronger claim.

## 8. Refine without overfitting

Make the smallest resource change that addresses a diagnosed failure.

Good refinements:

- Clarify an activation condition the agent repeatedly misses.
- Reorder guidance so required actions are discoverable.
- Replace vague advice with a decision rule.
- Add a reference only when failures show missing knowledge.
- Remove instructions that increase cost without changing behavior.
- Compress repeated guidance into one general rule.
- Replace long explanation with a shorter rule when both perform equivalently.

Avoid:

- Copying scenario prompts, fixture details, grader assertions, or expected
  filenames into the resource.
- Adding one-off examples that merely encode the current scenario.
- Changing several resource dimensions in one iteration.
- Editing both the scenario and resource after every loss.
- Selecting a winner from aggregate score while ignoring regressions.

After each refinement, rerun control and all candidates affected by the change.
Do not compare new treatment results with a stale control from a materially
different experiment.

## 9. Promotion and stopping rules

Promote from Quick mode to Confidence mode when a candidate:

- Improves the primary behavior over control.
- Does not introduce a severe regression.
- Has an understandable causal explanation.
- Is worth the additional evaluation cost.

Stop iterating when one of these is true:

- A candidate meets the user's success criteria across the confidence suite.
- Removing or compressing any remaining resource content causes the candidate
  to miss the success or regression threshold.
- Further changes trade one important behavior for another and require a user
  decision.
- Results are indistinguishable within observed run variance.
- The remaining failure is better solved by deterministic tooling.
- The agreed time or evaluation budget is exhausted.

## Deliverables

Leave the repository with:

- A concise written hypothesis in the experiment or scenario description.
- Representative, treatment-blind scenarios and graders.
- An experiment containing the smallest useful treatment comparison.
- The minimal satisfying resource candidate produced by the evaluation.
- A concise result summary covering wins, regressions, cost or latency
  tradeoffs, resource size, confidence level, and unresolved risks.

Do not claim completion until the scenarios, experiment, and resource treatment
are runnable and the selected evaluation mode has been executed, unless a
missing credential or external service blocks the run.
