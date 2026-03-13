# 04-features: 智能发布与调试面板 (Generator Panel)

## 生成与调试面板 (Generator & Webview)

大模型的生成与返回面板是开发者重度交互的对象。在 **Prompt by Prompt (PbP)** 中，我们要提供极其干净、无打扰的体验，坚决反对全屏占用或阻塞式弹窗。

### Panel 生命周期
1.  **唤醒与就绪 (Wake & Context)**：执行某个 Prompt (如 `Generate React Component`) 后，侧边栏底部的一个小型 Webview 面板滑出（或者开启在一个代码编辑 Tab 并排）。
2.  **Streaming & Rendering (流式响应)**：接收来自配置大模型 (Ollama 或 Claude 等) 的 Markdown 格式流式输出，实时通过 React 渲染，采用原生 VS Code 配色的语法高亮 (Highlighting)。
3.  **行动呼唤 (Call To Action)**：
    *   `Apply to Editor`: 点击即将生成的代码片段以 `Diff` 的形式插入原处。
    *   `Copy to Clipboard`
    *   `Save as new Template`: 一键将当前结果作为迭代基础另存。
4.  **A/B 测试模式 (A/B Testing Mode)**
    *   **痛点**：Prompt 的质量是“玄学”，需要在 GPT-4 与 Claude-3.5 之间对比耗时与代码准确度。
    *   **解决**：允许同时选中两个 Model 端点，发送同一个 Prompt，并在 Webview 左/右分屏展示两个生成的进度条与最终输出。并在响应末尾提供 `Accept Left` / `Accept Right` 评估。
    *   **记录**：选择 `Accept` 时可更新源 `.yaml` 文件中 `bestModel` 字段与满意度评分。

### Webview 技术选型
*   `React` + `TailwindCSS`，打包体积优化：只打包必须要的 JS，所有 CSS 必须贴图 VS Code 内置 `var(--vscode... )` 变量，达到高度无缝的主题适配。不引入任何冗余动画。
*   **通信桥梁 (VSCode-Webview-RPC)**：
    *   只允许 Webview 给 VS Code 发消息 `{"type": "executeCommand", "command": "pbp.insertText", "text": "..."}`。
    *   不允许 Webview 层具有文件系统权限或网络外发权限（安全与隐私）。网络请求由 VS Code Extension Host 的 Node 端完成，并通过事件机制推送到前端展示。