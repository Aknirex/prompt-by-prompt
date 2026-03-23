# Rule System

## 更新时间

2026-03-23

## 目标

本文档说明 `Prompt by Prompt` 当前规则系统的真实实现状态，以及规则如何从文件被解析到执行链路中。

规则系统当前的核心定位是：

- 规则独立于 PromptTemplate
- 规则通过 `RuleManager` 统一扫描和解析
- 执行阶段消费的是 `ResolvedRuleSet`
- 注入方式当前仍以 text fallback 为主，structured context 仍处于预留态

---

## 1. 规则来源

当前规则分为两类：

### Workspace Rules

从当前工作区根目录按需探测以下文件：

- `AGENTS.md`
- `.clinerules`
- `.cursorrules`
- `.windsurfrules`
- `.aiderrules`
- `.codeiumrules`

特点：

- 不做持续 watcher 同步
- 仅在显式 refresh / 初始化时扫描
- 扫到即纳入 workspace rule 集合

### Global Rules

存放于扩展全局存储目录：

```text
<globalStorage>/global-rules/
```

特点：

- 当前仅扫描 `.md` 文件
- 支持 legacy `global-rules.md` 迁移到 `global-rules/default-rules.md`
- 全局规则是否生效由 active profile 决定

---

## 2. 核心数据模型

当前核心类型定义位于 `src/types/rule.ts`。

### `RuleFile`

描述实际存在的一份规则文件：

- `id`
- `name`
- `path`
- `scope`
- `format`
- `content`
- `appliesTo?`
- `updatedAt?`

### `RuleProfile`

描述“哪些 global rules 被启用”的当前策略对象。

当前实现状态：

- 已存在类型与运行时对象
- 目前仍由 `RuleManager.refreshProfiles()` 自动生成
- 尚未成为完整的可编辑、可持久化用户对象

### `ResolvedRuleSet`

执行阶段消费的统一解析结果：

- `profile`
- `workspaceRules`
- `globalRules`
- `activeRules`
- `activeEntries`
- `injectionMode`
- `notes`
- `conflicts`

---

## 3. 解析流程

当前规则解析主链路如下：

1. `RuleManager.scanRuleFiles()`
   - 扫描 workspace/global 规则文件
2. `RuleManager.refreshProfiles()`
   - 根据 global rules 自动生成 profile 列表
3. `RuleManager.resolveRuleSet()`
   - 基于 active profile、agentType、capability 生成 `ResolvedRuleSet`
4. `ExecutionService.resolveRules()`
   - 在执行链路中按 target/agent 读取解析结果
5. `ExecutionService.buildDispatchText()`
   - 将 rule entries 以可预览方式纳入最终 payload

---

## 4. 当前 Profile 模型

当前 profile 仍是“自动生成模型”，不是完整用户对象。

当前默认生成方式：

- `Workspace Only`
  - 不启用任何 global rule
- 每个 global rule 各生成一个 profile
  - 例如 `Global: team.md`

当前 active profile 通过 `globalState` 保存：

- key: `pbp.activeRuleProfileId`

兼容字段：

- `pbp.activeGlobalRule`

当前语义上，active global rule 会映射回某个自动生成 profile。

---

## 5. 生效规则计算

`resolveRuleSet()` 的当前逻辑为：

- workspace rules 默认全部参与
- global rules 仅保留 active profile 中启用的 rule ids
- 如果 rule 声明了 `appliesTo`，则按 agentType 进一步过滤

每个 active rule 会生成一个 `ResolvedRuleEntry`，并附带解释原因，例如：

- 来自 workspace 发现
- 由当前 active profile 启用
- 被包含进某个 target agent
- 适用于所有 agent 或特定 agent

这也是规则树和预览里“为什么它生效”的主要解释来源。

---

## 6. 注入策略

当前 `ResolvedRuleSet.injectionMode` 有三种枚举：

- `text-fallback`
- `structured-context`
- `inactive`

但当前真实实现状态是：

- `text-fallback` 已落地
- `structured-context` 仅作为能力标记和未来接口预留
- adapter 层尚未真正调用结构化上下文 API

因此当前执行效果仍主要表现为：

- 执行前先解析 rule set
- 再由 `ExecutionService` 把规则内容编排进最终 dispatch payload
- preview 中可看到规则分区、notes 和 conflicts

---

## 7. 冲突检测

当前已实现的冲突检测较基础。

已支持：

- `duplicate-name`
  - 当多个 active rules 共享同名文件时，生成 conflict

当前仍未实现：

- 内容层冲突诊断
- 优先级覆盖解释
- 更细粒度的策略冲突分类

---

## 8. 规则树展示

规则树当前分为四组：

- `Active Profile`
- `Active Rules`
- `Workspace Rules`
- `Global Rules`

其中：

- `Active Rules` 展示的是解析后的 active entries
- `Global Rules` 与 `Workspace Rules` 展示的是文件层资产
- `Active Profile` 展示的是当前可切换的 profile 集合

这样可以把“有哪些规则文件”和“当前哪些规则正在生效”区分开。

---

## 9. 当前限制

当前规则系统仍有这些限制：

- `RuleProfile` 还不是完整的用户可编辑对象
- structured context adapter API 尚未真正接入
- 规则冲突诊断仍较浅
- workspace rules 仍是“探测到即默认参与”的模型

---

## 10. 后续方向

Phase 2 / Phase 3 之后，规则系统仍建议继续推进：

- 把 `RuleProfile` 升级为可编辑、可持久化对象
- 补更系统的 conflict / priority / appliesTo 测试
- 真正把 `canUseStructuredContext` 接到 adapter 发送层
- 让规则解释、冲突提示和 profile 管理更产品化
