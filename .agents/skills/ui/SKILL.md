---
name: ui
description: Use to understand how to build and verify UI-related work
---

# ui

UI in this project is split between the agent-eval ui in
`packages/agent-eval/src/ui` and the website in `website`.

## Overview 

- Use tailwind for authoring styles, by default
- As styles grow in complexity, explore using CSS Modules
- Always prefer utilities from `@primer/tailwind-config` if one exists there over the tailwind-native styles
- Always use design tokens
- Prefer using components from `@primer/react` over building your own, call out
  deviations from the design system and confirm. Offer an opportunity to report
  feedback to the project, as well, for these situations
- Support both light and dark mode. Design token usage gets us a lot of the way
  there

## Verification

- Use the most appropriate tool to verify your work.
- Use the smallest scope possible to verify your work as you are iterating. Expand the scope as-needed to verify the work broadly
- Prefer fast feedback loops, like unit tests, over slower feedback loops, like end-to-end tests (only if the they are sufficient to verify the work)
- Use `agent-browser` to verify your work in a browser environment

### Testing

- End-to-end tests are available through playwright
- Unit tests are available through vitest
- Prefer browser-based testing when working on UI-related tasks
- Place tests in the appropriate category based on what you need to test, for
  example testing a full page with layout would go into an end-to-end test but
  testing a specific component would go into a unit test
