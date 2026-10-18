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

### Testing

- End-to-end tests are available through playwright
- Unit tests are available through vitest
- Prefer browser-based testing when working on UI-related tasks
- Place tests in the appropriate category based on what you need to test, for
  example testing a full page with layout would go into an end-to-end test but
  testing a specific component would go into a unit test
