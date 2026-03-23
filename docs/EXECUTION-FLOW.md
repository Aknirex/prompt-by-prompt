# Execution Flow

本文档描述当前 prompt 执行链路的真实行为，而不是目标态设想。

## 1. 入口命令

当前主要入口：

- `pbp.runPrompt`
- `pbp.runPromptWithPicker`
- `pbp.rerunLastTarget`

代码位置：
- [extension.ts](/d:/Code/software/prompt-by-prompt/src/extension.ts)

## 2. 统一执行入口

所有执行最终进入：

- [ExecutionService.runPrompt](/d:/Code/software/prompt-by-prompt/src/services/executionService.ts)

这是当前执行主链路的单一入口。

## 3. 当前执行步骤

### Step 1: 选择 Prompt

- 如果命令参数里已经携带 prompt，则直接执行
- 否则从 prompt 列表中弹出 Quick Pick

### Step 2: 提取上下文

- `ContextEngine.extractContext()`
- 提取 selection、filepath、file_content、lang、project_name、line_number、column_number、git diff

### Step 3: 收集变量

- `ExecutionService.collectVariables()`
- 仅对缺失的非 builtin 变量弹窗收集
- `enum` 使用 Quick Pick
- 其他类型使用 Input Box

### Step 4: 渲染模板

- `ContextEngine.renderTemplate()`
- 当前使用 Handlebars 模板渲染

### Step 5: 选择 target + behavior

- `ExecutionService.resolveSelection()`

优先级：

1. 用户当前显式动作
2. per-prompt 上次执行记录
3. 初始推荐值

受 `executionSelectionMode` 影响：

- `last-execution`
- `initial-recommendation`
- `ask-every-time`

### Step 6: 解析规则

- `ExecutionService.resolveRules(target)`
- 规则解析发生在 target 确定之后
- 这保证规则注入可以按目标分流

### Step 7: 生成 dispatch payload

- `buildDispatchText(...)`

这一步生成真正发送出去的内容。

当前按目标分流：

- `copilot`
- `cline` / `roo-code` / `codex`
- `continue` / `cursor` / `kilo-code` / `gemini` / `tongyi`
- `clipboard` / `file`

### Step 8: 生成 preview

- `buildPreviewText(resolvedExecution)`

当前 preview 会显示：

- target
- behavior
- injection mode
- actual payload

### Step 9: dispatch

- `AgentService.sendToAgent(dispatchText, agentType, options)`
- 实际发送使用 `dispatchText`
- 不再把预览文本直接发送出去

### Step 10: 保存历史

- `saveHistory(promptId, selection)`
- 仅在 `last-execution` 模式下保存

## 4. 当前规则注入策略

### Task-oriented agents

例如：

- `cline`
- `roo-code`
- `codex`

当前 payload 结构更偏：

- Task
- Rules
- Context
- Conflicts

### Chat-style agents

例如：

- `continue`
- `cursor`
- `gemini`

当前 payload 结构更偏：

- Task Prompt
- Active Rules
- Editor Context

### Copilot

当前单独走更紧凑的结构：

- `Task`
- `Rules`
- `Context`

## 5. 当前与目标态的差距

- `previewPrompt` 独立命令目前未恢复
- structured context 仍只是模式标记，还未真正传入 adapter API
- dispatch payload 仍在 `ExecutionService` 内部生成，尚未拆成独立 preview/payload composer

## 6. 当前调试要点

如果执行行为异常，优先检查：

1. `ExecutionService.resolveSelection()`
2. `AgentService.getSupportedExecutionBehaviors()`
3. `RuleManager.resolveRuleSet()`
4. `ExecutionService.buildDispatchText()`
5. adapter 的 `sendPrompt()`
