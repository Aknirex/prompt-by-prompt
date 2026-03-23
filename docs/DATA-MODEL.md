# Data Model

本文档记录当前已实现的数据模型，以及仍处于目标态但未完全落地的字段。

## 1. PromptTemplate

当前代码位置：
- [prompt.ts](/d:/Code/software/prompt-by-prompt/src/types/prompt.ts)

当前核心字段：

```ts
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  variables?: PromptVariable[];
  template: string;
  source?: "workspace" | "global" | "builtin";
  filePath?: string;
}
```

当前说明：

- `id` 是运行时唯一标识
- `source` 仍是旧命名，未来应收敛为 `visibility` 或 `origin`
- `filePath` 仍然保留，便于 workspace/global 文件落盘

## 2. PromptVariable

当前支持：

- `name`
- `description`
- `type`
- `required`
- `values`
- `default`
- `placeholder`
- `multiline`

当前缺口：

- 还没有专门的 variable schema 编辑 UI
- 还没有 `source` 字段来区分 builtin/context/manual

## 3. RuleFile

当前代码位置：
- [rule.ts](/d:/Code/software/prompt-by-prompt/src/types/rule.ts)

当前结构：

```ts
interface RuleFile {
  id: string;
  name: string;
  path: string;
  scope: "workspace" | "global";
  format: "markdown" | "plain";
  content: string;
  appliesTo?: AgentType[];
  updatedAt?: string;
}
```

说明：

- workspace rule 来自当前工作区根目录下的已知规则文件
- global rule 来自扩展全局存储目录下的 `global-rules/`
- `appliesTo` 已预留，但当前扫描阶段还没有完整持久化来源

## 4. RuleProfile

当前结构：

```ts
interface RuleProfile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  priority: number;
  appliesTo?: AgentType[];
  isActive?: boolean;
}
```

当前实现状态：

- 已落地
- 当前由 `RuleManager.refreshProfiles()` 自动生成
- 当前内置两类 profile：
  - `Workspace Only`
  - 每个 global rule 对应一个 `Global: <rule-name>`

## 5. ResolvedRuleSet

当前结构：

```ts
interface ResolvedRuleSet {
  profile: RuleProfile;
  workspaceRules: RuleFile[];
  globalRules: RuleFile[];
  activeRules: RuleFile[];
  activeEntries: ResolvedRuleEntry[];
  injectionMode: "text-fallback" | "structured-context" | "inactive";
  notes: string[];
  conflicts: ResolvedRuleConflict[];
}
```

说明：

- `activeRules` 用于最终生效集合
- `activeEntries` 用于“为什么生效”的解释
- `notes` 用于预览和调试说明
- `conflicts` 当前只包含 duplicate-name 检测

## 6. ResolvedExecution

当前代码位置：
- [execution.ts](/d:/Code/software/prompt-by-prompt/src/types/execution.ts)

当前结构：

```ts
interface ResolvedExecution {
  prompt: PromptTemplate;
  renderedPrompt: string;
  resolvedRules: ResolvedRuleSet;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
  variables: Record<string, string>;
  sourceContext: EditorContext;
  dispatchText: string;
  previewText: string;
}
```

说明：

- `dispatchText` 是实际发送给目标的内容
- `previewText` 是给用户看的解释性包装
- 这是 Phase 2 的一个关键变化：预览与发送内容不再混为一个字段

## 7. Execution History

当前结构：

```ts
interface ExecutionHistoryRecord {
  promptId: string;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
  executedAt: string;
}
```

说明：

- 历史按 prompt 维度保存
- 当前存放于 extension `globalState`
- 只在 `executionSelectionMode = last-execution` 时参与复用

## 8. 仍处于目标态的模型

下面这些对象在重构规划中存在，但当前仍未独立实现：

- `ExecutionPreset`
- `PromptRepository`
- `RuleRepository`
- `ExecutionHistoryRepository`
- `SettingsRepository`

这些对象会在后续工程化阶段继续拆分。
