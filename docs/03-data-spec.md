# 03 Data Specifications - 数据契约与协议规范

在“配置即代码”的哲学指导下，所有的 Prompt 与工作流均需落地为标准化、带类型的配置文件。此文档定义了 **Prompt by Prompt (PbP)** 插件管理下的核心数据结构。

## 📄 Prompt 模板数据模型

所有的 Prompt 将以 `.yaml` 或 `.json` (可选) 存储在 `.prompts/templates/` 中。我们优先推荐 `YAML` 以保持对多行提示词阅读的友好。

### Schema v1.0
一个标准的 Prompt 文件结构如下：

```yaml
---
id: "pbp.code.review.001"
name: "Code Review Assistant"
description: "用于在编辑器内右键选取一段代码，自动进行高质量的性能审查与重构建议"
category: "Development"   # 侧栏的 Tree 分组
tags: ["code-quality", "review", "optimization"]
author: "Team Lead"

version: 1.0.0

# 推荐运行该 Prompt 的默认模型，若无则使用全局配置
parameters:
  model: "claude-3.5-sonnet"
  temperature: 0.5
  max_tokens: 2000

# 动态变量定义（用户不仅可以使用内置变量，还可定义需在 Webview 输入框补充的变量）
variables:
  - name: "file_content"
    description: "内置变量，编辑器当前活跃文件的全内容"
    type: "string"
    required: true
  - name: "difficulty"
    description: "用户自定义变量，审查难度等级"
    type: "enum"
    values: ["easy", "medium", "hard"]
    default: "medium"

# Prompt主体，支持 Handlebars 语法 {{...}} 插值
template: |
  你是一个资深的代码审查专家。
  请审查以下代码片段：

  ```{{lang}}
  {{selection}}
  ```
  
  该代码位于文件：`{{filepath}}` 中。
  周边上下文信息如下：
  {{file_content}}
  
  重点关注：
  - 性能问题
  - 代码可读性
  - 潜在的逻辑 bug
  
  审查的严格等级为：{{difficulty}}。请给出格式化的修复建议。
---
```

## 🔁 上下文变量字典 (Context Variables)

Context Engine 内置了极其强大的编辑器状态捕获变量，这些变量在渲染阶段会**自动**注入到上述的 `{{}}` 中：

| 变量键值 (Key) | 变量类型 | 返回值含义与实例 |
| :--- | :--- | :--- |
| `{{selection}}` | `string` | 编辑器中当前光标选中的文本。如果未选中则提供光标所在行的文本。|
| `{{filepath}}` | `string` | 当前工作区相对路径 `src/components/Button.tsx` |
| `{{file_content}}` | `string` | 当前活动窗口文件的全文文本。|
| `{{lang}}` | `string` | 文件后缀对应的语言名 `typescript`, `python` 等。|
| `{{project_name}}` | `string` | Workspace 的根文件夹名称。|
| `{{git_commit_diff}}` | `string` | 自动执行 `git diff`，提取当前修改的代码 diff。|

*(更多由用户扩展的自定义变量将通过 Webview 表单由开发者现场填写)*

## 🚦 基础响应规范
当 Prompt 交给 Generator 执行后，会依据 LLM 的返回构造统一的数据类型发送给 Webview 渲染管道，它必须包括：
*   **状态** (`status`): `loading`, `success`, `error`
*   **原始内容** (`rawResponse`): 无修改的大模型完整回复字串
*   **时间戳与耗时** (`metadata.latencyMs`)
*   **模型标识** (`metadata.modelName`)