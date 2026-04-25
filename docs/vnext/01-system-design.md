# Prompt by Prompt vNext System Design

Last updated: 2026-04-25

## 1. Design Goals

The vNext design optimizes for clear boundaries, testable behavior, and a simpler product model.

Goals:

- Keep VS Code integration at the edges.
- Make prompt resolution, policy resolution, and execution planning pure or mostly pure.
- Make `extension.ts` a composition root, not an application layer.
- Ensure preview and dispatch consume the same execution plan.
- Make storage repositories explicit and replaceable.
- Keep advanced features optional and isolated.

## 2. Proposed Package Structure

```text
src/
  domain/
    prompt.ts
    variable.ts
    policy.ts
    execution.ts
    agent.ts
    settings.ts
    validation.ts
  application/
    promptLibraryService.ts
    promptAuthoringService.ts
    executionPlanner.ts
    executionRunner.ts
    policyResolver.ts
    migrationService.ts
  infrastructure/
    vscode/
      vscodePromptRepository.ts
      vscodeSettingsRepository.ts
      vscodeHistoryRepository.ts
      vscodeSecretRepository.ts
      vscodeContextProvider.ts
    files/
      promptFileCodec.ts
      policyPackCodec.ts
      ruleFileCodec.ts
    agents/
      agentRegistry.ts
      adapters/
        clipboardAdapter.ts
        fileAdapter.ts
        copilotAdapter.ts
        rooCodeAdapter.ts
        clineAdapter.ts
  presentation/
    commands/
      commandRegistry.ts
      promptCommands.ts
      ruleCommands.ts
      libraryCommands.ts
    views/
      promptTreeProvider.ts
      policyTreeProvider.ts
      sharedLibraryTreeProvider.ts
    webviews/
      promptEditor/
      settings/
      executionPreview/
  extension.ts
```

This structure is a target direction, not a required one-shot rewrite. It supports incremental extraction from the current service-first codebase.

## 3. Core Domain Model

### PromptDefinition

```ts
interface PromptDefinition {
  id: string;
  schemaVersion: 1;
  title: string;
  description: string;
  body: string;
  tags: string[];
  category?: string;
  variables: PromptVariableDefinition[];
  metadata: {
    author?: string;
    version?: string;
    createdAt?: string;
    updatedAt?: string;
    lastUsedAt?: string;
    favorite?: boolean;
  };
}
```

Notes:

- `title` replaces current `name` inside the domain model. File codecs can keep compatibility with `name`.
- `body` replaces current `template` inside the domain model. File codecs can read/write `template` for backward compatibility.
- `metadata.favorite` and `metadata.lastUsedAt` power the daily-use sidebar.

### PromptLibraryItem

```ts
interface PromptLibraryItem {
  prompt: PromptDefinition;
  source: PromptSource;
  storage?: PromptStorageRef;
  readOnly: boolean;
}
```

```ts
type PromptSource =
  | { kind: "personal" }
  | { kind: "workspace"; workspaceFolder: string }
  | { kind: "builtin" }
  | { kind: "shared"; libraryId: string; libraryVersion: string };
```

### PromptVariableDefinition

```ts
interface PromptVariableDefinition {
  name: string;
  type: "string" | "number" | "boolean" | "enum";
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  enumValues?: string[];
  placeholder?: string;
  multiline?: boolean;
  source: "manual" | "editor-context" | "system";
}
```

### ExecutionPlan

```ts
interface ExecutionPlan {
  prompt: PromptLibraryItem;
  context: EditorContextSnapshot;
  variables: Record<string, string | number | boolean>;
  renderedPrompt: string;
  policy: EffectivePolicy;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
  payload: DispatchPayload;
  diagnostics: ExecutionDiagnostic[];
}
```

Preview, dispatch, and history all consume `ExecutionPlan`.

### DispatchPayload

```ts
interface DispatchPayload {
  format: "plain-text" | "segmented-text" | "structured";
  text: string;
  sections: Array<{
    id: string;
    title: string;
    text: string;
  }>;
  estimatedSize: {
    characters: number;
  };
}
```

The text is what adapters can send today. Sections preserve explainability and future structured adapter support.

## 4. Application Services

### PromptLibraryService

Responsibilities:

- Load and index prompts from all configured sources.
- Normalize legacy prompt YAML into `PromptDefinition`.
- Provide search, favorites, recents, source grouping, and read-only metadata.
- Expose immutable library snapshots to UI.

Should not:

- Open VS Code UI.
- Dispatch prompts.
- Read settings directly except through injected repositories.

### PromptAuthoringService

Responsibilities:

- Validate prompt drafts.
- Convert between form draft and YAML draft.
- Save personal/workspace prompts through repositories.
- Duplicate or fork prompts.

### ExecutionPlanner

Responsibilities:

- Build an `ExecutionPlan`.
- Collect missing manual variables through an injected UI/input port.
- Render templates using an injected renderer.
- Resolve target and behavior through an injected execution preference port.
- Ask `PolicyResolver` for active policy.
- Build payload with an injected `PayloadComposer`.

### ExecutionRunner

Responsibilities:

- Call the chosen `AgentAdapter`.
- Persist history after successful dispatch.
- Return a typed result for UI notification.

Should not:

- Re-render prompts.
- Re-resolve policies.
- Read settings directly.

### PolicyResolver

Responsibilities:

- Resolve workspace, personal, and explicitly bound shared rules.
- Compute precedence, conflicts, shadowing, required rules, and inactive reasons.
- Produce `EffectivePolicy`.

Important vNext decision:

- Shared rules are not active merely because a shared library exists. They require explicit binding.

## 5. Infrastructure Interfaces

### PromptRepository

```ts
interface PromptRepository {
  list(): Promise<PromptLibraryItem[]>;
  get(id: string): Promise<PromptLibraryItem | undefined>;
  save(prompt: PromptDefinition, target: PromptSaveTarget): Promise<PromptLibraryItem>;
  delete(storage: PromptStorageRef): Promise<void>;
}
```

Implementations:

- `PersonalPromptRepository`: global storage files.
- `WorkspacePromptRepository`: `.prompts/templates` or configured workspace path.
- `BuiltinPromptRepository`: extension bundled prompts.
- `SharedPromptRepository`: read-only library content.

### SettingsRepository

Single read/write boundary for:

- Execution defaults.
- Prompt storage defaults.
- UI language.
- Shared library sources.
- Passive projection settings.
- AI drafting settings.

The package manifest should be generated from, or checked against, a typed schema.

### SecretRepository

Provider API keys should use VS Code SecretStorage. Normal settings can keep non-secret fields such as model and endpoint.

### ExecutionHistoryRepository

Stores:

- Per-prompt last target and behavior.
- Last used timestamp.
- Optional local execution records for history UI.

Storage:

- Keep lightweight data in global state initially.
- Move larger history to global storage JSON if history becomes a user-facing feature.

## 6. UI Model

### Activity Bar

Recommended views:

1. Prompts
   - Recents
   - Favorites
   - Search result or source/category groups

2. Policy
   - Active policy summary
   - Workspace rules
   - Personal rules
   - Bound shared rules
   - Conflicts

3. Shared Libraries
   - Source health
   - Installed libraries
   - Read-only prompts and rules

The default focus is Prompts.

### Commands

Core commands:

- `pbp.runPrompt`
- `pbp.runPromptWithPicker`
- `pbp.previewPrompt`
- `pbp.searchPrompts`
- `pbp.createPrompt`
- `pbp.duplicatePrompt`
- `pbp.editPrompt`
- `pbp.deletePrompt`
- `pbp.favoritePrompt`
- `pbp.connectSharedLibrary`
- `pbp.syncSharedLibraries`
- `pbp.openSettings`

Advanced commands:

- `pbp.bindPolicyPack`
- `pbp.rebuildProjectedRuleFile`
- `pbp.openProjectedRuleFile`
- `pbp.generatePromptDraft`

## 7. Data Storage

### Personal Prompts

```text
<globalStorage>/prompts/<prompt-id>.yaml
```

### Workspace Prompts

```text
<workspace>/.prompts/templates/<prompt-id>.yaml
```

The directory is created only when saving a workspace prompt.

### Shared Libraries

```text
<globalStorage>/shared-libraries/<source-id>/
```

Git sources are sync caches. Local-folder sources read directly from disk.

### Project Policy Binding

```text
<workspace>/.pbp/policy.json
```

Only created by explicit user action.

Example:

```json
{
  "packId": "acme-engineering",
  "packVersion": "1.4.2",
  "profileId": "frontend-standard",
  "allowPersonalOverrides": true,
  "pinned": true
}
```

## 8. Migration Strategy

vNext should read current data without forcing a destructive migration.

Steps:

1. Read current prompt YAML fields: `id`, `name`, `description`, `category`, `tags`, `variables`, `template`, `version`.
2. Normalize to `PromptDefinition`.
3. When saving, write current-compatible YAML plus `schemaVersion`.
4. Keep legacy global prompt migration from `pbp.globalPrompts` for one major version.
5. Keep execution history compatibility keys for one major version.
6. Move API keys to SecretStorage with a one-time prompt to migrate or re-enter.

## 9. Quality Strategy

Unit tests:

- File codecs.
- Prompt validation.
- Prompt search/sort/favorite logic.
- Context variable resolution.
- Execution selection and history reuse.
- Payload composers.
- Policy resolver precedence and conflicts.

Integration-style tests:

- Personal prompt create/edit/delete.
- Workspace prompt create/edit/delete.
- Shared library load and copy.
- Preview equals dispatch source plan.
- Settings schema consistency.

Manual smoke tests:

- Fresh install with no workspace.
- Fresh workspace with no `.prompts`.
- Multi-root workspace.
- Clipboard target.
- File target.
- At least one direct agent target if installed.

## 10. Refactoring Constraints

- Do not rewrite everything at once.
- Keep tests passing after each vertical slice.
- Extract pure modules before changing behavior.
- Keep compatibility adapters until the new model is stable.
- Avoid adding new settings during extraction unless the setting exists in the vNext schema.
- Do not expand AI provider support while the prompt execution core is unstable.

