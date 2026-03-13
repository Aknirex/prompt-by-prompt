# 05 Roadmap - 开发行动路线图 (Roadmap)

我们采取极其克制但持续演进的 3 个阶段研发体系。整个生命周期长约为 2-3 个月。

## 📍 第一阶段：MVP "可用的极客工具" (Weeks 1-3)
**目标**：实现读取本地配置文件并以最小闭环调用 Prompt。
*   **W1：核心框架搭建**
    *   使用 TypeScript，完成项目脚手架 `yo code`，确定 `.prompts/` 目录监听与自动发现机制 (`vscode.workspace.createFileSystemWatcher`)。
    *   构建基础 API 封装，调用本地 Ollama 和提供 API Key 配置面板以使用 OpenAI/Claude 借口。
*   **W2-W3：界面与管理器闭环**
    *   TreeView 侧边栏：渲染 `Prompt 面板`，点击运行。
    *   Context Engine MVP：至少支持四个基础变量 `{{selection}}`, `{{filepath}}`, `{{file_content}}`, `{{project_name}}`。
    *   Generator Webview：简单的侧边栏或 Panel 展示生成的返回内容（Markdown 流式）。

## 📍 第二阶段：工程优化 "定义行业标准" (Weeks 4-6)
**目标**：引入 Context Engine 的高级功能与预置数据标准。
*   **W4：模板与变量增强**
    *   使用 `Handlebars.js` 扩展强大的控制流逻辑。
    *   集成 `QuickPick` 和输入框，要求用户在执行复杂 Prompt 时输入动态变量。
*   **W5：产品规范化与精品库**
    *   完善 50+ 套 `YAML` 格式的精品预设库。
    *   **A/B 测试模式 MVP**：支持选中多个模型并行评估。
*   **W6：UI 精致化与自动化门禁**
    *   React UI/UX 调优：实现 VS Code `var()` 变量完全适配所有暗黑/白日主题，无断头文字，高度平滑的界面体验。
    *   测试：对 Prompt 的 AST 树的解析编写 100% 覆盖率的 `Vitest` 测试。

## 📍 第三阶段：社区与声望 "构建影响力" (Weeks 7-8)
**目标**：正式开源并成为 Marketplace AI 工具栏的下载热门。
*   **W7：合规发布**
    *   写好极客级 README.md (提供 GIF 或视频流展示)。
    *   发布至 VS Code Marketplace (v1.0.0)。
    *   提交给 Product Hunt 首发预热，并打标签 `#Developer Tools`。
*   **W8：口碑扩张与名誉维护**
    *   利用 Dev.to/Medium 发表《代码化管理 Prompt：从混乱走向工程化》等布道文章。
    *   通过 X (Twitter) 给头部网红圈点体验 `#promptengineering`。
    *   在 GitHub 开源 `.prompts` 生态的 Awesome 项目。