# Phase 0 + Phase 1 + Phase 2 Todolist

Last updated: 2026-03-20

## Current Status

### Execution

- [x] 统一执行入口已收敛到 `ExecutionService`
- [x] Sidebar、命令面板、rerun 已走同一条 prompt 执行链路
- [x] 已支持 per-prompt 最近执行记录复用
- [x] 已支持 `executionSelectionMode` 区分：
  - `last-execution`
  - `initial-recommendation`
  - `ask-every-time`
- [x] 已把实际发送内容与预览内容拆分为：
  - `dispatchText`
  - `previewText`

### Agent / Dispatch

- [x] Agent capability matrix 已成为 behavior picker 的唯一依据
- [x] 设置页已按 agent 能力动态过滤可选 behavior
- [x] 当前已按 target/agent 生成不同 dispatch payload，而不是统一文本拼接后直接发送
- [x] `sendBehavior=overwrite` 已进入运行时能力模型和设置页

### Rules

- [x] 规则系统已从“文件扫描 + 文本 append”升级为“解析后再注入”
- [x] 已引入 `RuleProfile`
- [x] 已引入 `ResolvedRuleSet`
- [x] 规则解析已发生在 target 选择之后，可按目标生成不同规则注入结果
- [x] 规则树已区分：
  - `Active Profile`
  - `Active Rules`
  - `Workspace Rules`
  - `Global Rules`
- [x] 当前已支持显式切换 active rule profile
- [x] 当前已显示每条 active rule 为什么生效
- [x] 当前已提供基础冲突提示（duplicate-name）

### Quality

- [x] `npm run compile` 通过
- [x] `npm run lint` 通过
- [x] 已补充规则解析与 execution payload/preview 相关单测

### Documentation

- [x] 已补齐当前架构文档：`docs/ARCHITECTURE.md`
- [x] 已补齐当前数据模型文档：`docs/DATA-MODEL.md`
- [x] 已补齐当前执行流程文档：`docs/EXECUTION-FLOW.md`
- [x] 已补齐当前规则系统文档：`docs/RULE-SYSTEM.md`
- [x] 已补齐当前设置语义文档：`docs/SETTINGS-SCHEMA.md`
- [x] 已更新 `docs/README.md` 导航

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
- [x] Validate agent behavior picker against real capability matrix
- [x] Tighten settings copy and defaults around “initial recommendation” vs “last execution”

## Phase 2

- [x] Introduce `RuleProfile` and a first-class `ResolvedRuleSet`
- [x] Resolve rules through `RuleManager` instead of ad-hoc execution-time assembly
- [x] Rework the rules tree to show active profile, active rules, workspace rules, and global rules separately
- [x] Make rule resolution target-aware so execution can resolve rules after target selection
- [x] Implement richer agent-specific rule injection beyond the current text fallback / structured-context mode flag
- [x] Add clearer rule conflict diagnostics and explain why each rule is active
- [x] Add settings/UI for explicitly choosing enabled rule profile
- [x] Add automated tests for rule profile resolution and rule preview composition

## Phase 3

- [ ] Refactor Prompt editor to focus on template/schema editing only
- [ ] Add richer variable schema editing UI
- [ ] Add dedicated rendered prompt preview in the editor experience
- [ ] Rework settings page structure around user tasks instead of implementation details
- [x] Start documenting Phase 2 / Phase 3 architecture, data model, execution flow, rule system, and settings schema

## Follow-up

- [ ] Add automated tests for execution history, preview composition, and prompt storage consistency
- [ ] Continue Phase 3 implementation for Prompt editor responsibilities and variable schema UI
- [ ] Add `TEST-PLAN.md` and finish documenting current automated coverage vs remaining gaps
- [ ] Investigate why `viewsContainers.activitybar` is rejected in the current VS Code debug host despite a valid manifest; restore custom Activity Bar container after root cause is confirmed
