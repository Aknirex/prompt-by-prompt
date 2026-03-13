# 00 Project Overview - 项目总览

## 🚀 项目名称
**Prompt by Prompt (PbP)**
*(代码代号：PromptCraft / PromptForge / PromptFlow 的最终进化体)*

## 🎯 定位与愿景
*   **Slogan**: *"Treating your prompts as first-class code, step by step, prompt by prompt."*
*   **愿景**: 成为 VS Code 生态中“Prompt 工程化”的事实标准工具，让“配置即代码”的思想落地在每个 AI 应用开发者的工作流中。
*   **定位**: 精品开源小工具。体积极小（<1MB），本地优先，零依赖。聚焦 Prompt 的全生命周期：管理 + 库 + 生成。

## 💡 核心设计哲学
综合团队前期的三种构想，我们坚持以下 4 条核心原则：
1.  **配置即代码 (Prompt as Code)**：Prompt 不应随意散落在数据库或剪贴板中，而应通过版本控制存储在项目根目录的 `.prompts/` 文件夹内。
2.  **极致克制与轻量**：无后台常驻进程，非必要不引入大型依赖。侧重单兵作战与极简的树形视图（TreeView）体验。
3.  **工具链中立 (Model-Agnostic)**：同时支持接入本地模型（Ollama）以保证免费和隐私，以及主流外部大厂 API（OpenAI, Claude, Groq等）。
4.  **上下文穿透 (Context-Aware)**：自动感知并抓取开发者当前的编辑器状态（选区内容、文件名、AST节点、Git 变更），无缝注入模板中。

## 🚧 什么是“非目标” (Non-Goals)
为了保证“名誉”收益与产品边界的可控，我们明确**不做**以下事情：
*   ❌ 不做大型对话式聊天机器人面板（如完全替代 Continue 或 GitHub Copilot Chat，这太臃肿了）。
*   ❌ 不强制绑定账号系统，无服务器数据收集。**“Your Prompts, Your Data - Nothing touches our servers.”**
*   ❌ 不尝试覆盖所有 IDE 平台（MVP 阶段只专注于 VS Code 及其 70%+ 的市场占有率）。

## 📈 成功指标评估 (Success Metrics)
*   GitHub Stars 达到 `1k` 甚至 `5k+`，成为优质开源明星库。
*   VS Code Marketplace 获得大量曝光并在 6 个月内达到 `100,000+` 下载。
*   成为 AI 开发者社区广为传颂的“基础设施”。
