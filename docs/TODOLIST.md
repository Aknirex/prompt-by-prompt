# Refactor Todo

Last updated: 2026-03-20

## Current Status

### Done

- [x] Phase 0 已基本完成
- [x] Phase 1 已基本完成
- [x] Phase 2 已基本完成
- [x] 执行入口已统一到 `ExecutionService`
- [x] Sidebar、命令面板、rerun 已走同一条执行链路
- [x] 已支持 per-prompt 最近执行记录复用
- [x] 已支持 `executionSelectionMode`
- [x] 已拆分 `dispatchText` / `previewText`
- [x] Agent capability matrix 已成为 behavior picker 的主要依据
- [x] 规则系统已升级为“先解析、再注入”
- [x] 已引入 `RuleProfile`
- [x] 已引入 `ResolvedRuleSet`
- [x] 规则树已区分 Active Profile / Active Rules / Workspace Rules / Global Rules
- [x] 已支持显式切换 active rule profile
- [x] 已显示 active rule 生效原因
- [x] 已提供基础冲突提示（`duplicate-name`）
- [x] `npm run compile` 通过
- [x] `npm run lint` 通过
- [x] 已补齐 `ARCHITECTURE.md`
- [x] 已补齐 `DATA-MODEL.md`
- [x] 已补齐 `EXECUTION-FLOW.md`
- [x] 已补齐 `RULE-SYSTEM.md`
- [x] 已补齐 `SETTINGS-SCHEMA.md`
- [x] 已更新 `docs/README.md` 导航

### Partially Done

- [ ] Phase 3：Prompt 编辑器与设置页重构
- [ ] Phase 4：工程化与扩展能力

## Now

这些是最适合马上推进的收尾项，优先补齐护栏与文档闭环。

- [x] 新增 `docs/TEST-PLAN.md`
- [x] 为 execution history 增加自动化测试
- [x] 为 preview composition 增加更完整的自动化测试
- [x] 为 prompt storage consistency 增加自动化测试
- [x] 核对并收敛 global prompt 正文是否仍有部分留在 `globalState`

## Next

这些是已经进入尾声但还没彻底完成的执行链路 / 规则系统任务。

### Phase 1 收尾

- [x] 引入独立 `ExecutionPreset` 模型
- [x] 恢复独立命令 `pbp.previewPrompt`
- [x] 评估是否需要恢复 `pbp.selectExecutionTarget`

### Phase 2 收尾

- [ ] 将 `RuleProfile` 升级为可编辑、可持久化对象
- [ ] 深化规则冲突诊断，不只停留在 `duplicate-name`
- [ ] 真正接入 `canUseStructuredContext`
- [ ] 为 rule file 补更明确的元数据协议
- [ ] 增加规则预览 / 规则诊断命令

## Later

这些是 Phase 3 / Phase 4 的主体工作，适合在上面收尾项稳定后继续推进。

### Phase 3

- [ ] 重构 Prompt 编辑器职责，只保留模板与 schema 编辑
- [ ] 移除 Prompt 编辑器中的执行目标 / 行为等执行态职责
- [ ] 增加更完整的变量 schema 表单 UI
- [ ] 支持变量类型、`required`、`default`、`enum`、`placeholder`、`multiline` 的完整编辑
- [ ] 增加编辑器内渲染预览
- [ ] 实现表单视图 / YAML 视图双模式
- [ ] 让两种编辑模式共享统一 schema
- [ ] 按用户任务重构设置页信息架构
- [ ] 进一步明确“初始推荐值 / 历史值 / 当前显式选择”的界面文案
- [ ] 将 `enabledRuleProfile` 升级为正式 manifest 设置项
- [ ] 继续减少低频配置对主流程的干扰

### Phase 4

- [ ] 拆出 `PromptRepository`
- [ ] 拆出 `RuleRepository`
- [ ] 拆出 `ExecutionHistoryRepository`
- [ ] 拆出 `SettingsRepository`
- [ ] 建立统一配置 schema
- [ ] 补更多单元测试与集成测试
- [ ] 推进收藏、最近使用、执行历史的产品化能力
- [ ] 为更多 Agent 和规则生态预留扩展点
- [ ] 建立更正式的 Agent 支持分层：稳定 / 实验 / 剪贴板兼容

## Follow-up / Investigations

- [x] 在文档里补“当前测试覆盖 vs 剩余空白”的说明
- [ ] 调查 `viewsContainers.activitybar` 在当前 VS Code debug host 中被拒绝的原因，并恢复自定义 Activity Bar 容器

## Notes

- 当前判断主要基于 `docs/REFACTOR-PLAN.md`、`docs/ARCHITECTURE.md`、`docs/DATA-MODEL.md`、`docs/EXECUTION-FLOW.md`、`docs/RULE-SYSTEM.md`、`docs/SETTINGS-SCHEMA.md`、`docs/README.md` 以及近期 git 历史
- `docs/TEST-PLAN.md` 已同步当前测试覆盖；execution history / preview composition / prompt storage consistency 的自动化护栏已补齐
- 已核对 `PromptManager`：global prompt 正文主存储已迁移到 `<globalStorage>/prompts/*.yaml`，`globalState.pbp.globalPrompts` 仅保留 legacy migration 入口并在迁移后清空
- 若后续某项已完成，应优先同步更新本文件与对应专题文档，避免再次出现“文档状态落后于实现”
