# Phase 0 + Phase 1 Todolist

Last updated: 2026-03-19

## In Progress

- [x] Review current implementation against [`docs/REFACTOR-PLAN.md`](/d:/Code/software/prompt-by-prompt/docs/REFACTOR-PLAN.md)
- [x] Identify Phase 0 and Phase 1 touchpoints in execution, prompt storage, rules, settings, and tree commands
- [x] Create and start maintaining this todolist
- [x] Add an `ExecutionService` entry point to centralize prompt resolution, target selection, preview, dispatch, and last-run reuse
- [x] Fix prompt tree / command argument handling so sidebar and command palette runs use the same prompt object flow
- [x] Finish wiring settings/UI/schema to the new execution model
- [x] Validate compile and lint after refactor

## Phase 0

- [x] Fix broken prompt execution entry path
- [x] Remove watcher-driven prompt refresh behavior
- [x] Remove watcher-driven rule refresh behavior
- [x] Stop implicit prompt/rule directory creation during scans
- [x] Fix workspace prompt rename leaving stale files behind
- [x] Align prompt editor builtin variable help with actual runtime context keys
- [x] Remove or hide misleading execution options that are not really supported
- [x] Make lint pass

## Phase 1

- [x] Introduce a unified execution service
- [x] Add per-prompt last execution history
- [x] Add first-run target selection and later-run last-target reuse flow
- [x] Add preview command and pre-send preview support
- [x] Decouple dispatch behavior from raw UI state by passing explicit execution selections to adapters
- [x] Build preview/send payload from task prompt + active rules + editor context instead of mutating the template body directly
- [ ] Validate agent behavior picker against real capability matrix
- [x] Tighten settings copy and defaults around “initial recommendation” vs “last execution”

## Follow-up

- [ ] Add automated tests for execution history, preview composition, and prompt storage consistency
- [ ] Continue into Phase 2 rule profiles / resolved rule sets / richer rule presentation after Phase 0 + 1 stabilizes
- [ ] Investigate why `viewsContainers.activitybar` is rejected in the current VS Code debug host despite a valid manifest; restore custom Activity Bar container after root cause is confirmed
