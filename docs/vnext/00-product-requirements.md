# Prompt by Prompt vNext Product Requirements

Last updated: 2026-04-25

## 1. Product Thesis

Prompt by Prompt should become a VS Code native prompt workspace:

> Developers can find, edit, preview, and run reusable AI prompts with the right code context and the right team rules, without wondering what will be sent or where it will go.

The current product has grown into several overlapping tools: prompt manager, rule manager, shared library sync, agent launcher, AI prompt generator, provider settings page, and passive rule projector. vNext should not remove ambition, but it must restore a clean mental model.

The new product model has four user-facing objects:

1. Prompt: a reusable task template.
2. Context: editor/workspace data used to fill the prompt.
3. Policy: optional personal, workspace, or team rules that constrain execution.
4. Target: where the final payload goes.

Everything else is implementation detail.

## 2. Target Users

### Primary: Working Developer

Needs:

- Reuse prompts for code review, refactor, tests, docs, debugging, commit messages.
- Inject current selection/file/workspace context without manual copying.
- Send the result to the AI tool already used in VS Code.
- Trust that nothing surprising is written to the workspace.

Success looks like:

- Create or install useful prompts in minutes.
- Run a frequent prompt in one or two actions.
- Inspect the exact final payload when needed.

### Secondary: Team Maintainer

Needs:

- Share a library of approved prompts and rules across repositories.
- Keep shared content read-only by default.
- Update shared content through Git or local folder sync.
- Know which policy version is active for a project.

Success looks like:

- A teammate can connect a library and immediately use prompts.
- Rules are explainable and versioned.
- Copying a shared prompt into a workspace creates a clear editable fork.

### Secondary: Prompt Power User

Needs:

- Edit YAML directly.
- Model variables with types, defaults, enum values, required fields, and multiline input.
- Search, favorite, sort, and organize a large library.
- Migrate/export personal prompts.

Success looks like:

- Prompt files remain portable and reviewable.
- Form and YAML views never drift.

## 3. Jobs To Be Done

### JTBD-1: Run a Known Prompt Fast

When I have a repeated AI task, I want to trigger the right prompt from VS Code so that I can spend time on the task, not on copying context.

Acceptance criteria:

- User can run from sidebar, command palette, or editor context.
- System fills built-in context variables.
- System asks only for missing required manual variables.
- System reuses the last valid execution target per prompt when configured.
- If the last target is unavailable, system explains and falls back to selection.

### JTBD-2: Know What Will Be Sent

When a prompt includes code context or rules, I want to preview the final payload so that I can avoid leaking or sending the wrong content.

Acceptance criteria:

- Preview shows target, behavior, active policy, editor context summary, and exact payload.
- Preview and dispatch use the same resolved execution object.
- Large selections and file contents are handled intentionally with size limits and disclosure.

### JTBD-3: Author and Maintain Prompts

When I create a reusable prompt, I want a guided editor with YAML escape hatch so that simple prompts are easy and advanced prompts stay precise.

Acceptance criteria:

- Prompt editor supports metadata, template body, tags, category, variable schema, and live preview.
- YAML and form are two views of the same draft model.
- Invalid prompts show clear validation errors before save.
- Workspace writes happen only after explicit save to workspace.

### JTBD-4: Discover Useful Prompts

When my prompt library grows, I want search, recents, favorites, and source grouping so that the sidebar supports daily work instead of becoming a static folder list.

Acceptance criteria:

- Sidebar prioritizes Recents and Favorites above static categories.
- Prompt list supports source labels: Personal, Workspace, Shared, Built-in.
- Search command filters by name, description, tags, and source.

### JTBD-5: Share Team Prompts And Rules

When a team maintains approved AI workflows, I want to connect a shared library so that everyone uses the same baseline without copying files manually.

Acceptance criteria:

- Shared libraries are read-only by default.
- Git and local-folder sources are explicit, visible, and manually syncable.
- Background sync is opt-in.
- Shared prompt copy creates a new editable prompt with preserved source metadata.
- Shared rules either participate in the policy resolver or are clearly labeled as catalog-only. There must be no ambiguous middle state.

### JTBD-6: Manage Rules Without Polluting Prompts

When a prompt runs in a project with rules, I want rules applied as policy context so that task templates remain clean and reusable.

Acceptance criteria:

- Rules never mutate prompt templates.
- Policy resolver explains active, inactive, shadowed, and required rules.
- Workspace, personal, and shared rules have explicit precedence.
- Passive projection is an optional compatibility feature, not the primary policy model.

## 4. Product Principles

1. Run-first, manage-second.
   The first screen should help users use prompts, not configure the universe.

2. Honest capability.
   If an agent only supports clipboard fallback, the UI says so. No pretend integrations.

3. Previewable execution.
   The final payload is a first-class product surface.

4. Local-first and explicit writes.
   The extension should not write to a workspace unless the user took an action that clearly implies it.

5. One source of truth.
   Settings, types, package manifest, docs, and UI must derive from the same schema or be checked against it.

6. Optional complexity.
   Team libraries, AI-generated prompt drafting, provider APIs, and passive projection are advanced capabilities. They should not dominate the default flow.

## 5. vNext Scope

### P0 Must Have

- Prompt library from Personal, Workspace, Built-in, and Shared sources.
- Prompt search, favorites, and recent usage.
- Prompt editor with schema validation, form/YAML sync, and rendered preview.
- Execution flow with context extraction, variable collection, target selection, history reuse, preview, and dispatch.
- Agent capability matrix with clipboard/file fallbacks.
- Clear settings information architecture.
- File-backed personal prompts and migration from current global storage.
- Regression tests for prompt storage, rendering, execution selection, payload generation, and policy resolution.

### P1 Should Have

- Team library sync v2 with source health, version display, and read-only prompt/rule catalogs.
- Policy resolver that can include shared rules through explicit project binding.
- Passive rule projection v2 based on the same policy resolver.
- Import/export of personal prompt libraries.
- Command to duplicate/fork prompts.

### P2 Could Have

- AI-assisted prompt drafting.
- Prompt quality linting.
- Usage analytics stored locally.
- Prompt pack marketplace/import UX.
- Structured context APIs for agents that expose stable interfaces.

### Out Of Scope For vNext P0

- Acting as a full LLM chat client.
- Running cloud model calls as the primary execution path.
- Background network sync by default.
- Deep project indexing.
- Remote telemetry.
- Supporting every AI extension as a first-class integration.

## 6. Current Product Gaps Observed

This is based on code and docs inspection on 2026-04-25.

- `src/extension.ts` is a large composition and command file. It mixes activation, sync orchestration, copy actions, status bar state, command handlers, and UI wiring.
- Settings are spread across `package.json`, `SettingsPanel`, service reads, and global state compatibility keys.
- `README.md` describes team rules as part of resolved policy, while current `RuleManager` catalogs shared libraries without activating shared rules.
- `AIService` supports many providers, but provider setup is not central to the core prompt manager value. It increases settings complexity.
- `AgentService` contains many adapter implementations in one file and several are clipboard-only fallbacks.
- Prompt, rule, team policy, and execution services use VS Code APIs directly, which makes business logic harder to test in isolation.
- Existing tests are useful but mostly service-level; there is no clean domain/application boundary yet.

## 7. Success Metrics

Product metrics:

- First useful run in under 5 minutes from installation.
- Frequent prompt run in 2 actions or fewer after setup.
- User can answer "what was sent?" from preview/history.
- Shared library connection shows usable prompts without additional manual file work.

Engineering metrics:

- `extension.ts` becomes a thin composition root.
- Core domain/application modules do not import `vscode`.
- Settings schema has automated consistency checks.
- `pnpm run compile`, `pnpm run lint`, and `pnpm run test` pass in CI.
- New core behavior ships with tests before UI polish.

## 8. Key Product Decisions Needed

1. Is vNext primarily a prompt launcher or a prompt plus policy orchestrator?
   Recommendation: prompt launcher by default, policy orchestrator as an optional advanced layer.

2. Should AI prompt generation remain in P0?
   Recommendation: no. Keep it, but move it behind a secondary command and simplify settings.

3. Should shared rules be active by default?
   Recommendation: no. Shared rules become active only through explicit project binding or user selection.

4. Should workspace rules auto-scan on activation?
   Recommendation: yes for read-only discovery, no for writes or ownership. Any write requires explicit action.

5. Should API keys stay in normal VS Code settings?
   Recommendation: no. Use VS Code SecretStorage for provider keys if AI drafting remains.

