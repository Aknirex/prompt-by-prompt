# Prompt by Prompt vNext Delivery Plan

Last updated: 2026-04-25

## 1. Strategy

The current extension compiles and its existing tests pass, so vNext should be an incremental reconstruction, not a panic rewrite.

The plan is to rebuild from the inside out:

1. Stabilize requirements and architecture.
2. Extract pure domain/application modules.
3. Rewire current UI to the new application layer.
4. Improve high-frequency UX.
5. Reintroduce advanced team/policy features through the cleaner model.

Each phase should end with a runnable extension and passing checks.

## 2. Phase 0: Baseline And Decisions

Goal:

- Establish the product and engineering baseline.

Deliverables:

- vNext requirements document.
- vNext system design document.
- vNext delivery plan.
- Current-state audit notes.
- Decision log for scope cuts.

Acceptance criteria:

- Team agrees on the four-object product model: Prompt, Context, Policy, Target.
- P0 scope excludes primary LLM client behavior.
- Shared rule activation semantics are decided.
- Current compile/test baseline is recorded.

Current baseline on 2026-04-25:

- `pnpm run compile` passes.
- `pnpm run test` passes.
- 9 test files, 33 tests passed.

## 3. Phase 1: Domain And Schema Foundation

Goal:

- Create a testable core that does not import `vscode`.

Tasks:

- Add `src/domain` models for prompts, variables, policies, execution, agents, and settings.
- Add prompt/rule/settings validators.
- Add prompt YAML codec that reads current format and emits vNext-compatible format.
- Add settings schema module and a script/test that compares it with `package.json`.
- Add SecretStorage interface for future API key migration.

Acceptance criteria:

- Domain modules have no `vscode` import.
- Current prompt fixtures load through the new codec.
- Invalid prompt drafts produce structured errors.
- Settings schema consistency is test-covered.

Suggested tests:

- `promptFileCodec.test.ts`
- `promptValidation.test.ts`
- `settingsSchema.test.ts`

Progress:

- 2026-04-25: Added the first pure prompt domain model, prompt validation, a current-compatible prompt YAML codec, and a settings schema registry with package manifest consistency coverage.

## 4. Phase 2: Prompt Library Core

Goal:

- Replace ad hoc prompt loading with a library index that supports daily-use UX.

Tasks:

- Introduce `PromptRepository` interfaces.
- Implement personal, workspace, built-in, and shared read-only prompt repositories.
- Implement `PromptLibraryService`.
- Add recents and favorites to prompt metadata/history.
- Rewire `PromptsTreeProvider` to consume a library snapshot.
- Add search command.
- Keep current YAML path compatibility.

Acceptance criteria:

- Sidebar shows Recents and Favorites when available.
- Prompt source labels are consistent.
- Search works across all prompt sources.
- Read-only prompts cannot be edited or deleted, but can be forked/copied.
- Workspace directories are created only after explicit workspace save.

Suggested tests:

- Search ranking and grouping.
- Favorite toggle.
- Recent update after successful execution.
- Read-only shared prompt copy.
- Multi-root workspace prompt loading.

Progress:

- 2026-04-25: Added `PromptRepository` boundaries, a pure `PromptLibraryService` for snapshots/search/favorites/recents/source grouping, and a file-backed prompt repository that reads current YAML files through the vNext codec.
- 2026-04-25: Rewired the compatibility `PromptManager` onto the vNext library stack, added prompt usage metadata for favorites/recents, added prompt search/favorite commands, and surfaced Favorites/Recent sections in the prompt tree.
- 2026-04-25: Rewired `PromptsTreeProvider` to consume `PromptLibrarySnapshot` directly instead of rebuilding source/favorite/recent logic from a flat `PromptTemplate[]`.

## 5. Phase 3: Execution Plan And Payload Pipeline

Goal:

- Make preview and dispatch share one execution plan.

Tasks:

- Extract `ExecutionPlanner` from current `ExecutionService`.
- Extract payload composers by target family.
- Extract `ExecutionRunner` for adapter dispatch and history update.
- Move selection/history/settings reads behind injected ports.
- Add payload size diagnostics.
- Keep current commands working through compatibility wrappers.

Acceptance criteria:

- `previewPrompt` and `runPrompt` build the same `ExecutionPlan`.
- Dispatch payload never contains preview-only chrome.
- History is updated only after successful dispatch.
- User can force picker even when history exists.
- Target behavior options are filtered by real adapter capabilities.

Suggested tests:

- Preview/dispatch plan equivalence.
- History reuse and unavailable target fallback.
- Payload composer snapshots.
- Variable collection cancellation.
- Empty rendered prompt warning.

## 6. Phase 4: UI Simplification

Goal:

- Make the plugin feel useful before it feels configurable.

Tasks:

- Simplify command names and command palette titles.
- Move AI prompt generation behind `Generate Prompt Draft`.
- Split settings into Run, Storage, Libraries, Advanced.
- Move API key fields out of normal settings UI into SecretStorage flow.
- Add an execution preview webview or richer markdown preview.
- Add first-run onboarding that offers: create prompt, run built-in prompt, connect shared library.

Acceptance criteria:

- First-run user can run a built-in prompt without touching provider settings.
- Settings page no longer makes AI provider setup look required for execution.
- Prompt editor stays focused on prompt authoring.
- All visible commands map to implemented behavior.

Suggested tests:

- Settings serialization.
- Webview message handlers for prompt editor.
- Command registration smoke tests.

## 7. Phase 5: Team Libraries And Policy v2

Goal:

- Make team libraries powerful without making default users pay the complexity tax.

Tasks:

- Define shared library pack spec v2.
- Add explicit project policy binding command.
- Implement shared rule loading into `PolicyResolver` only when bound.
- Show active policy source and version in the Policy view.
- Make passive projection consume `EffectivePolicy`.
- Clarify trust states: trusted, untrusted, revoked.

Acceptance criteria:

- Connected shared libraries expose read-only prompts immediately.
- Shared rules are inactive until a binding exists.
- Bound shared rules appear in effective policy with source/version metadata.
- Conflicts show active/inactive reasons.
- Passive projection refuses unsafe overwrite unless configured.

Suggested tests:

- Local-folder library load.
- Git source sync and reconnect.
- Bound shared policy resolution.
- Required rule cannot be disabled silently.
- Passive projection output snapshots.

## 8. Phase 6: Migration, QA, And Release

Goal:

- Ship vNext without stranding current users.

Tasks:

- Add migration guide.
- Add compatibility notes for existing prompt YAML.
- Add one-time API key migration/re-entry flow if SecretStorage is adopted.
- Refresh README around the new product model.
- Update screenshots and marketplace copy.
- Run manual smoke test matrix.
- Package VSIX and test in a clean VS Code profile.

Acceptance criteria:

- Existing global/workspace prompts load.
- Existing execution history does not crash new flow.
- Old team policy sources either load or show actionable errors.
- Compile, lint, tests, package all pass.
- README matches implemented behavior.

## 9. Backlog Priority

### P0

- Domain models and codecs.
- Prompt library service.
- Execution plan extraction.
- Preview/dispatch consistency.
- Settings schema consistency.
- Prompt search/favorites/recents.
- Secret handling decision.

### P1

- Shared policy binding.
- Passive projection v2.
- Prompt import/export.
- Better preview UI.
- First-run onboarding.

### P2

- AI prompt drafting simplification.
- Structured context adapter support.
- Local execution history browser.
- Prompt linting.
- Pack publishing helper.

## 10. Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| One-shot rewrite takes too long | High | Work in vertical slices with compatibility wrappers |
| Current docs overstate behavior | Medium | Treat `docs/vnext` as canonical for new work |
| Agent APIs are unstable | Medium | Label direct vs fallback integrations honestly |
| Settings drift continues | High | Add schema consistency test before more settings work |
| Team policy complexity overwhelms default UX | High | Keep team/policy behind explicit shared library and binding flows |
| API keys in settings are insecure | High | Move secrets to SecretStorage |
| Multi-root behavior stays ambiguous | Medium | Model workspace folder in storage refs and tests |

## 11. Definition Of Done

For every vNext slice:

- User-facing behavior is described in docs.
- Domain/application behavior has tests.
- No new core module imports `vscode` unless it is explicitly infrastructure or presentation.
- No workspace file is written without explicit user action.
- `pnpm run compile` passes.
- `pnpm run test` passes.
- `pnpm run lint` passes before release branches.
