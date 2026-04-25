# Prompt by Prompt Current State Audit

Last updated: 2026-04-25

## 1. Baseline

Environment:

- Workspace: `d:\Code\software\prompt-by-prompt`
- Package version: `2.1.5`
- Extension type: VS Code extension
- Package manager: `pnpm`

Checks run:

- `pnpm run compile`: passed.
- `pnpm run test`: passed after adding one regression test. Current result: 9 test files, 34 tests passed.
- `pnpm run lint`: exited successfully, with existing curly-rule warnings in `src/utils/ruleFrontmatter.ts`.

Package surface:

- Commands contributed: 25
- Views contributed: 3
- Settings contributed: 44

Largest source files by line count:

| File | Lines |
| --- | ---: |
| `src/utils/i18n.ts` | 1245 |
| `src/providers/settingsPanel.ts` | 962 |
| `src/extension.ts` | 749 |
| `src/services/agentService.ts` | 706 |
| `src/services/executionService.ts` | 705 |
| `src/services/aiService.ts` | 640 |
| `src/services/ruleManager.ts` | 517 |
| `src/providers/promptEditorHtml.ts` | 496 |
| `src/services/promptManager.ts` | 475 |
| `src/services/teamPolicyService.ts` | 417 |

## 2. What Works

- The project compiles.
- Existing unit tests cover prompt persistence, execution selection/history, payload composition, rule manager basics, projection, and team policy sync.
- Prompt storage has already moved global prompt bodies into files instead of relying only on `globalState`.
- Prompt editor has form/YAML support and rendered preview.
- Execution preview and dispatch text are separate concepts.
- Agent capability matrix exists and behavior options are filtered.
- Shared library prompts can be loaded as read-only prompts.
- Passive rule projection has safe overwrite behavior.

## 3. Main Product Problems

### 3.1 Product Center Is Blurry

The extension currently presents several major products at once:

- Prompt manager.
- Rule manager.
- Team shared library manager.
- Agent launcher.
- AI prompt generator.
- Provider/API configuration UI.
- Passive rule projector.

This makes the first-run experience heavier than a prompt manager needs to be.

Recommendation:

- Make prompt discovery and execution the default product.
- Keep rules, shared libraries, AI drafting, and projection as optional advanced layers.

### 3.2 README And Behavior Drift

The README says the system resolves workspace, global, and team rules. Current tests and implementation show shared libraries are cataloged, while shared rules do not participate in active policy resolution by default.

Recommendation:

- Decide whether shared rules are catalog-only or policy-active.
- vNext recommendation: shared rules become active only through explicit project binding.

### 3.3 Workspace Rule Command Was Writing To Global Storage

The `pbp.createWorkspaceRule` command called `ruleManager.createGlobalRule(...)`.

Status:

- Fixed in this pass.
- Added regression coverage ensuring `RuleManager.createRuleFile(...)` creates a workspace rule and not a global rule.

### 3.4 Settings Are Too Wide

There are 44 contributed settings, spanning execution, model providers, prompt storage, shared library sync, and passive projection.

Problems:

- Settings are not all equally important.
- API provider setup looks central even though prompt execution can work through clipboard/file/agent targets.
- Settings schema is duplicated across `package.json`, `SettingsPanel`, and runtime service reads.

Recommendation:

- Add a typed settings schema.
- Generate or check `package.json` settings from that schema.
- Move provider API keys to SecretStorage if AI drafting remains.

## 4. Main Architecture Problems

### 4.1 `extension.ts` Is Too Much Application Code

The activation file performs:

- Service construction.
- Manifest diagnostics.
- Sync orchestration.
- Status bar state.
- Command registration.
- Copy/import actions.
- Rule projection refresh.
- Prompt/rule/team policy tree refresh logic.

Recommendation:

- Convert it to a composition root.
- Move command bodies into command modules.
- Move orchestration into application services.

### 4.2 Services Depend Directly On VS Code APIs

Core services read settings, show UI, touch global state, access workspace folders, and perform file I/O directly.

Impact:

- Logic is harder to test without broad mocks.
- Business rules and VS Code infrastructure are mixed.
- Reuse and migration become harder.

Recommendation:

- Extract domain/application modules with injected ports.
- Keep VS Code dependencies in infrastructure and presentation layers.

### 4.3 Agent Adapters Are Bundled Together

`agentService.ts` contains the registry plus many adapter implementations.

Recommendation:

- Split adapters into separate files.
- Explicitly classify adapters as direct, partial, or clipboard fallback.

### 4.4 AI Provider Support Expands Blast Radius

`aiService.ts` supports many provider APIs for prompt generation.

Impact:

- Provider settings dominate setup.
- API behavior can drift over time.
- API keys are currently normal settings, not secrets.

Recommendation:

- Move AI drafting out of the core P0 flow.
- Keep provider support behind a separate draft command.
- Use SecretStorage for keys.

## 5. Main Data Problems

### 5.1 Prompt Field Names Are Legacy-Coupled

Current model uses `name` and `template`.

Recommendation:

- Domain model can use `title` and `body`.
- File codec should preserve backward compatibility with current YAML.

### 5.2 Shared Rule Identity Exists But Policy Activation Is Missing

Team policy packs load rule identities, but active rule resolution currently uses workspace and global rules only.

Recommendation:

- Add explicit policy binding.
- Shared rules are resolved through `PolicyResolver` only when bound.

### 5.3 Execution History Is Useful But Hidden

Per-prompt execution history exists, but the product does not expose enough of it as recents/history.

Recommendation:

- Promote last-used metadata and recents into the prompt library UI.

## 6. Refactoring Entry Points

Best first extractions:

1. Prompt file codec and validation.
2. Settings schema and consistency test.
3. Prompt library snapshot service.
4. Execution plan builder.
5. Payload composers.
6. Policy resolver.

Risky first extractions:

- Rewriting all webviews.
- Replacing all agent adapters.
- Changing shared library sync and rules at the same time.
- Making AI provider work central to the first vNext slice.

## 7. Immediate Follow-up Bugs And Questions

Potential bugs/questions to resolve before heavy refactoring:

- Activation currently refreshes team policies during startup. For Git sources this can imply network work even when background auto-sync is disabled.
- Settings page saves provider API keys to regular settings.
- README release highlight says `1.13.0` while `package.json` says `2.1.5`.
- `customProviderUrl` appears in settings UI, but custom provider execution is not implemented in `AIService.generatePrompt`.
- Passive projection and policy resolver should be checked after shared policy binding semantics are decided.

