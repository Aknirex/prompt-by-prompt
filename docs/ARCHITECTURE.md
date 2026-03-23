# Prompt by Prompt Architecture

本文档描述当前重构后的主干架构，重点覆盖 Phase 1 与 Phase 2 已落地部分，并为 Phase 3 提供边界约束。

## 1. 当前分层

### Domain

- `PromptTemplate`
- `PromptVariable`
- `RuleFile`
- `RuleProfile`
- `ResolvedRuleSet`
- `ExecutionTarget`
- `ExecutionBehavior`
- `ResolvedExecution`

### Services / Application

- `PromptManager`
  - 负责 prompt 的加载、创建、更新、删除
- `RuleManager`
  - 负责规则扫描、profile 构建、规则解析
- `ContextEngine`
  - 负责提取编辑器上下文和模板渲染
- `ExecutionService`
  - 负责变量收集、目标选择、规则解析、payload 生成、dispatch、历史复用
- `AgentService`
  - 负责 agent adapter 注册、能力矩阵、可用性检查、发送

### Presentation

- `PromptsTreeProvider`
- `RulesTreeProvider`
- `PromptEditorPanel`
- `SettingsPanel`
- commands / quick picks

## 2. 当前核心调用链

### Prompt 执行

1. `extension.ts` 接收命令
2. `ExecutionService.runPrompt()` 统一进入执行链
3. `ContextEngine.extractContext()` 提取编辑器上下文
4. `ContextEngine.renderTemplate()` 渲染 prompt
5. `ExecutionService.resolveSelection()` 决定 target + behavior
6. `RuleManager.resolveRuleSet()` 按目标解析规则
7. `ExecutionService.buildDispatchText()` 生成实际发送 payload
8. `AgentService.sendToAgent()` 分发到 adapter
9. `ExecutionService.saveHistory()` 记录每个 prompt 的最近执行

### Rule 解析

1. `RuleManager.scanRuleFiles()` 扫描 workspace/global 规则文件
2. `RuleManager.refreshProfiles()` 生成 profile 列表
3. `RuleManager.resolveRuleSet()` 计算活动 profile、活动规则、冲突与说明
4. `RulesTreeProvider` 展示 profile / active rules / source rules

## 3. 当前设计原则

- 执行链路只有一个主入口：`ExecutionService`
- 规则不是 prompt 模板正文的一部分
- preview 与实际 dispatch 内容分离，但必须互相解释得通
- target 与 behavior 必须服从 agent capability matrix
- 设置里的“初始推荐值”不能冒充“实际执行结果”

## 4. 当前关键文件

- [extension.ts](/d:/Code/software/prompt-by-prompt/src/extension.ts)
- [executionService.ts](/d:/Code/software/prompt-by-prompt/src/services/executionService.ts)
- [ruleManager.ts](/d:/Code/software/prompt-by-prompt/src/services/ruleManager.ts)
- [agentService.ts](/d:/Code/software/prompt-by-prompt/src/services/agentService.ts)
- [rulesTreeProvider.ts](/d:/Code/software/prompt-by-prompt/src/providers/rulesTreeProvider.ts)
- [settingsPanel.ts](/d:/Code/software/prompt-by-prompt/src/providers/settingsPanel.ts)

## 5. Phase 3 约束

Phase 3 的编辑器和设置页重构需要遵守下面这些边界：

- Prompt 编辑器不负责执行态选择
- 设置页只表达“推荐策略”和“低频配置”
- 运行时逻辑不能回退到 UI 拼装文本
- 规则解释和执行解释必须继续由应用层生成

## 6. 已知未完成项

- `RuleManager` 目前的 profile 仍是自动生成模型，不是完整用户自定义 profile
- `canUseStructuredContext` 目前只影响解析模式说明，还没有真正接入 adapter 的结构化上下文 API
- Prompt 编辑器尚未完成表单/YAML 双视图与变量 schema 深化
