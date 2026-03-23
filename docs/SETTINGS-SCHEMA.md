# Settings Schema

## 更新时间

2026-03-23

## 目标

本文档说明 `Prompt by Prompt` 当前设置模型的真实语义，作为 `package.json` 配置声明、`SettingsPanel` Webview 和运行时逻辑之间的对照文档。

当前优先级规则为：

`当前运行中的显式选择 > per-prompt 上次执行记录 > 设置中的初始推荐值`

---

## 1. 高频运行设置

这些设置决定“运行 prompt 时，系统如何推荐或复用执行方式”。

### `pbp.executionSelectionMode`

- `last-execution`
  - 默认值
  - 优先复用该 prompt 上一次成功执行的 target / behavior
- `initial-recommendation`
  - 每次运行都从设置中的初始推荐值出发
- `ask-every-time`
  - 每次运行都重新选择 target / behavior

### `pbp.defaultAgent`

- 语义：运行时的“初始推荐 Agent”
- 不等于强制执行目标
- 仅在 `initial-recommendation` 或无可复用历史时直接生效

支持值来自当前 agent 生态与内置 target：

- `cline`
- `roo-code`
- `copilot`
- `continue`
- `gemini`
- `tongyi`
- `cursor`
- `kilo-code`
- `codex`
- `clipboard`
- `file`

### `pbp.sendBehavior`

- 语义：针对 Agent target 的“初始推荐行为”
- 当前 manifest 枚举：
  - `send`
  - `append`
  - `overwrite`
- 设置页会根据所选 agent 的 capability matrix 动态过滤不可用行为

### `pbp.rememberLastExecution`

- 兼容字段
- 当前应视为 `executionSelectionMode` 的 legacy compatibility flag
- 推荐优先使用 `pbp.executionSelectionMode`

### `pbp.outputDirectory`

- 当 target 为 `file` 时使用
- 语义：输出 markdown 文件的默认目录
- 可以是相对工作区路径，也可以是绝对路径

---

## 2. Prompt 存储设置

这些设置只影响“新建 prompt 默认保存到哪里”，不影响运行时发送目标。

### `pbp.defaultTarget`

- `global`
  - 默认值
  - 新建 prompt 默认保存在扩展全局存储中
- `workspace`
  - 新建 prompt 默认保存在当前工作区的 prompt 目录中

---

## 3. Prompt Generator 设置

这些设置只用于“内置 prompt generator 草拟模板”，不控制 prompt 发送到哪个 Agent。

### `pbp.defaultModel`

当前支持的 provider：

- `anthropic`
- `azure`
- `deepseek`
- `google`
- `groq`
- `mistral`
- `ollama`
- `openai`
- `openrouter`
- `xai`

### 自定义 provider

### `pbp.customProviderUrl`

- 仅当设置页选择 `custom` provider 时使用

### provider-specific 字段

#### Ollama

- `pbp.ollamaEndpoint`
- `pbp.ollamaModel`

#### OpenAI

- `pbp.openaiApiKey`
- `pbp.openaiModel`

#### Anthropic

- `pbp.claudeApiKey`
- `pbp.claudeModel`

#### Groq

- `pbp.groqApiKey`
- `pbp.groqModel`

#### Google AI

- `pbp.geminiApiKey`
- `pbp.geminiModel`

#### OpenRouter

- `pbp.openrouterApiKey`
- `pbp.openrouterModel`

#### DeepSeek

- `pbp.deepseekApiKey`
- `pbp.deepseekModel`

#### Mistral

- `pbp.mistralApiKey`
- `pbp.mistralModel`

#### xAI

- `pbp.xaiApiKey`
- `pbp.xaiModel`

#### Azure OpenAI

- `pbp.azureApiKey`
- `pbp.azureEndpoint`
- `pbp.azureModel`

### Generator system prompt

- 当前存放于 `globalState`
- key: `pbp.generatorSystemPrompt`
- 尚未进入 `package.json` manifest schema

---

## 4. 低频界面设置

### `pbp.uiLanguage`

- 当前由设置页放在 `Storage & UI` 分区中
- 属于低频偏好项，不影响执行主链路

---

## 5. 当前代码状态说明

目前设置模型的真实来源分散在三处：

- `package.json`
- `src/providers/settingsPanel.ts`
- 运行时消费设置的 service / command 逻辑

当前已取得的进展：

- 设置页已按 `Run Defaults` / `Storage & UI` / `Prompt Generator` 分区
- 设置页已明确区分“初始推荐值”和“运行时显式选择 / 上次执行记录”
- 设置页已根据 agent capability matrix 过滤 behavior

当前仍待继续收敛：

- 让 manifest schema、webview 表单和运行时类型进一步形成单一事实来源
- 评估是否将 generator system prompt 迁入正式 schema
- 清理仍偏 legacy 的兼容字段和隐式配置桥接
