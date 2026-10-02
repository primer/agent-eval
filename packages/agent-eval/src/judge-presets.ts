import type {JudgeConfig} from './judge'

const visualFidelityJudge: JudgeConfig = {
  name: 'Visual fidelity',
  description: 'Evaluate how closely the implementation follows a supplied visual reference.',
  files: [],
  instructions: `Compare the implementation with the supplied design references, focusing on layout, spacing, typography, color, and visual hierarchy. Evaluate fidelity to the reference, not personal aesthetic preferences.
Inspect reference images with an image-capable tool. Compare them with implementation evidence for the same viewport and UI state when available. Reference images are targets, not proof of the implemented appearance. Source code alone does not establish rendered fidelity.
If references or comparable implementation evidence are missing, explain the limitation and do not claim a verified visual match. Do not penalize differences explicitly allowed by the supplied criteria.`,
  scores: [
    {
      value: 0,
      description:
        'Major layout or hierarchy differences prevent a recognizable match, or a match cannot be established from the available evidence.',
    },
    {
      value: 1,
      description:
        'The main layout and hierarchy match, but observable spacing, typography, color, or alignment differences remain.',
    },
    {
      value: 2,
      description:
        'Comparable rendered evidence closely matches the reference in layout, spacing, typography, color, and hierarchy, with no material discrepancies.',
    },
  ],
}

const interactionClarityJudge: JudgeConfig = {
  name: 'Interaction clarity',
  description: 'Evaluate whether users can understand an interaction and its feedback.',
  files: [],
  instructions: `Inspect the target interaction's labels, primary actions, state feedback, and recovery guidance. Evaluate whether users can tell what to do, what happened, and how to proceed.
Consider loading, empty, success, and error states only where relevant to the interaction. Prefer specific, actionable feedback over vague messages. Do not require unnecessary UI states or judge visual styling here.
Distinguish behavior verified through available evidence from behavior inferred from source code. Explain any states you could not inspect.`,
  scores: [
    {
      value: 0,
      description:
        'The primary action or its outcome is missing, misleading, or too unclear for users to proceed, or there is insufficient evidence to establish an understandable interaction.',
    },
    {
      value: 1,
      description:
        'The primary action and normal outcome are understandable, but relevant state feedback or recovery guidance is unclear or incomplete.',
    },
    {
      value: 2,
      description:
        'Labels and actions make the interaction understandable, and relevant states clearly communicate progress, outcomes, and recovery steps.',
    },
  ],
}

const accessibilityJudge: JudgeConfig = {
  name: 'Accessibility',
  description: 'Review the target UI for barriers to keyboard and assistive-technology use.',
  files: [],
  instructions: `Inspect semantic structure, accessible names, keyboard operability, focus management, and relevant status or error announcements in the target UI. Prefer native semantics where appropriate; do not reward added ARIA without a demonstrated need.
Use source code and any available runtime or accessibility-check evidence. Do not infer keyboard behavior, screen-reader output, or color contrast from appearance alone. Identify inspection limits and distinguish potential barriers from verified ones.
Evaluate the scoped interaction, not unrelated application code. This is a qualitative review, not a WCAG conformance certification or a replacement for automated and manual accessibility testing.`,
  scores: [
    {
      value: 0,
      description:
        'Evidence shows a barrier that prevents a primary task with a keyboard or assistive technology, or there is insufficient evidence to assess the primary task.',
    },
    {
      value: 1,
      description:
        'The primary task has accessible structure and controls, but evidence shows gaps in names, focus, keyboard handling, or relevant announcements.',
    },
    {
      value: 2,
      description:
        'The inspected evidence supports accessible semantics, names, keyboard handling, focus, and relevant announcements, with no identified material barriers within the inspected scope.',
    },
  ],
}

const codeMaintainabilityJudge: JudgeConfig = {
  name: 'Code maintainability',
  description: 'Evaluate whether the implementation is understandable and fits the existing codebase.',
  files: [],
  instructions: `Inspect the target implementation and nearby code to evaluate naming, responsibility boundaries, duplication, and consistency with existing abstractions and conventions.
Judge whether a future contributor could understand and safely extend the solution. Prefer the simplest approach that meets the supplied requirements; do not reward speculative abstractions, unnecessary rewrites, or a personal style that conflicts with the project.
Scope findings to the target implementation. Do not penalize unrelated pre-existing code, equate fewer lines with better design, or claim functional correctness from readability alone.`,
  scores: [
    {
      value: 0,
      description:
        'The implementation is missing or cannot be assessed, or confusing structure, duplicated logic, or tight coupling substantially obstructs understanding and safe changes.',
    },
    {
      value: 1,
      description:
        'The solution is understandable, but concrete naming, responsibility, duplication, or convention issues make likely changes unnecessarily difficult.',
    },
    {
      value: 2,
      description:
        'The solution has clear names and responsibilities, reuses appropriate existing abstractions, and avoids unnecessary duplication and complexity.',
    },
  ],
}

const testQualityJudge: JudgeConfig = {
  name: 'Test quality',
  description: 'Evaluate whether implementation tests protect meaningful behavior and plausible regressions.',
  files: [],
  instructions: `Inspect tests alongside the target implementation and supplied requirements. Evaluate meaningful observable assertions, relevant failure and boundary cases, and whether plausible defects would be caught.
Reward behavior-focused, deterministic tests with appropriate isolation. Do not reward test count, coverage percentage alone, snapshots without meaningful expectations, or tests that only restate mocks or implementation details.
Distinguish tests supplied as private grader references from tests written as part of the implementation; do not give the implementation credit for grader tests. Do not claim tests pass unless execution evidence is available. Evaluate test design separately from execution success.`,
  scores: [
    {
      value: 0,
      description:
        'Relevant implementation tests are absent, cannot be inspected, or lack meaningful assertions that would detect a broken primary behavior.',
    },
    {
      value: 1,
      description:
        'Tests protect the primary behavior, but miss a material failure or boundary case, or rely on brittle implementation details or unreliable isolation.',
    },
    {
      value: 2,
      description:
        'Tests protect the primary behavior and relevant failure and boundary cases with meaningful, deterministic assertions and appropriate isolation.',
    },
  ],
}

export {visualFidelityJudge, interactionClarityJudge, accessibilityJudge, codeMaintainabilityJudge, testQualityJudge}
