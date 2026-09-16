---
'@primer/agent-eval': minor
---

Add image-backed scenario workspaces using an existing Docker image or a local Dockerfile. The image provides the starting project without automatic scenario copying, package rewriting, dependency installation, or building.

Generate images automatically for ordinary scenarios, baking in starting files and dependencies while keeping setup hooks and the post-setup build per trial. Add `scenario build [name]` and `buildScenarioImage` to prebuild one or all scenario images without running agents. Package installation scripts now run during image construction with a neutral package name, before trial IDs are assigned.
