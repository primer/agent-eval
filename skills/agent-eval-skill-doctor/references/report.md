# Diagnostic report

Default to a redacted summary. Ask before writing artifacts and before including
transcripts, source excerpts, or proposed diffs containing private content.
Never publish a report automatically.

## Contents

- [Evidence and proposals](#evidence-and-proposals)
- [Portable output](#portable-output)
- [Interpretation](#interpretation)

## Evidence and proposals

Identify the input bundle, selected trials and dimensions, and pinned skill
revisions. Link each observation to an artifact and message ID/index, tool call,
or source line. State what is observed, hypothesized, or unknown.

For every proposal, identify the owning surface and reusable rule. Include
alternative explanations, conflicting evidence, minimal diff, verification
criterion, and possible regressions. Proposals remain drafts until approved.
Do not prescribe an instruction edit for a tooling failure or merely restate a
rule the model ignored. Explain when no edit is justified.

## Portable output

The following is a report convention for this skill, not a package API or CLI
output format. After approval, write a JSON report in an agreed output directory,
separate from installed skills and preserved baseline results:

```json
{
  "schemaVersion": 1,
  "scope": {
    "bundles": [],
    "trialIds": [],
    "skillRevisions": []
  },
  "evidenceCompleteness": [],
  "outcomes": [],
  "errors": [],
  "assessments": [],
  "proposals": [],
  "comparisons": [],
  "usage": [],
  "limitations": [],
  "nextAction": ""
}
```

Populate collections only with inspected evidence:

- `skillRevisions`: skill name, owning file, and commit/content digest.
- `outcomes`: trial ID, dimensions, check outcomes, and judge results.
- `errors`: trial ID, stage, and error description, separate from task failures.
- `assessments`: criterion, trial ID, evidence citations, rationale, and status
  (`scored`, `not_applicable`, `insufficient_evidence`, or `evaluator_error`).
  Include a numeric score and its scale only for `scored` assessments.
- `proposals`: ID, skill/revision, owning file, trial/message/tool-call citations,
  observed failure, alternatives, conflicting evidence, behavioral rule,
  proposed diff, verification criterion, risks, and status (`untested`,
  `supported`, `contradicted`, or `inconclusive`).
- `comparisons`: proposal ID, matched trial groups, repetitions, per-task
  outcomes/regressions, evidence, and conclusion.
- `usage`: trial ID, metric, unit, and recorded value; retain missing values as
  unavailable. Keep implementation and judge usage separate.

In a redacted report, omit excerpts and diffs unless approved, and explicitly mark
those omissions. Retain safe evidence locators rather than fabricating quotes.
Review paths, rationales, diffs, and identifiers for sensitive content too.

An optional HTML rendering may present this report with collapsed diffs. There
is no built-in diagnostic HTML exporter: offer it only as an approved artifact,
escape all evidence as text, use no remote resources or telemetry, and do not
embed raw transcripts by default.

## Interpretation

Lead with the most consequential findings and their evidence. Include successes,
successful non-invocation, and regressions, not only failed conversations.
Show raw rubric scales and scored/applicable denominators; do not combine them
with arbitrary weights or treat abstentions as zero.

Distinguish retrospective hypotheses from controlled-comparison results.
Missing credits are not zero; recorded implementation usage is not the entire
evaluation bill. Do not convert usage into money without verified pricing.

Finish with the report location if one was written, supported conclusions,
unresolved uncertainty, and the next action requiring approval.
