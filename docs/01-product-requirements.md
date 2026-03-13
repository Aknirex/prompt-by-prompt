# 01 Product Requirements - 产品需求与场景

## 👥 目标人群与核心痛点
*   **AI 工程师 / 运维人员**：需维护上百个不同的 Prompt 用于各式智能体。
    *   *痛点：Prompt 管理极其散乱，缺少模板复用机制，版本迭代无法追踪。*
*   **独立开发者 / 前端与后端**：需利用大模型加速编码。
    *   *痛点：生成代码和审查代码时，需要频繁将本地“文件内容”和“特定 Prompt”一起贴到网页版工具中，极其耗时且繁琐。*

## 🎬 核心用户场景 (User Stories)

### 场景一：生成复杂代码 (Code Generation Context)
*   **作为**一名后端开发，
*   **我想**在 VS Code 里选中五行难以理解的逻辑，右键点击“Prompt by Prompt: Code Review”，
*   **以便**自动抓取选中代码、当前文件名及其周围上下文注入到预设的 `code-review.yaml` Prompt 模板中，通过本地 Ollama 模型评估后，在输出面板得到性能建议。

### 场景二：复用团队模板 (Team Knowledge Sharing)
*   **作为**开发团队的主管，
*   **我想**在项目的根目录下维护一个 `.prompts/` 文件夹，包含团队常用的单元测试生成模板，
*   **以便**其他同事拉取代码后，在 VS Code 侧栏能直接看到这些模板并生成测试用例。

---

## 🚀 MVP 产品边界 (Phase 1)
根据《开发行动路线图》，MVP（最小可行产品）阶段，我们将仅完成以下核心闭环：

1.  **侧边栏管理器 (Manager)**：
    *   读取 `.prompts/` (Workspace 级) 或 `Global State` 里的 JSON/YAML。
    *   提供 CRUD 树状视图，支持目录分组。
2.  **上下文引擎 (Context Engine)**：
    *   支持变量解析（如 `{{selection}}`, `{{file_content}}`, `{{project_name}}`）。
3.  **大模型执行与调试面板 (Generator / Executor)**：
    *   可通过 Webview 展示渲染结果和 Prompt 生成建议。
    *   集成调用 Ollama (本地免费) 与 Claude (示例 API)。
4.  **初始精品模板库预置 (50+ Starter Prompts)**：
    *   集成常见的开发场景（如重构、单测、文档生成、Bug排查等）。

## 📈 后期规划边界 (Phase 2 & 3)
*   支持 Prompt 的 A/B 测试：一键对比 OpenAI 和 Claude 的回复质量与耗时。
*   Git 无缝集成：针对单个 Prompt 查看 commit diff 等。