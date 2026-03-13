# 06 Quality & Security - 质量门禁与安全保障

为了确保“名誉”的收益，我们的项目必须遵循极其严苛的技术约束和透明度：

## 🛡️ "名誉"防御性保障 (Quality Assurance)
1.  **零 Crash 率**：所有 VS Code 的 API 请求、文件读取必须包裹在极其严格的 `try-catch` (甚至是函数级隔离) 中，并在 UI 返回优雅的 Toast 提示。插件不可以导致宿主（IDE）卡死或崩溃。
2.  **极速响应与无阻塞**：所有 I/O、网络请求 (Network fetch)、甚至大模板解析 (Parser) 均放在**非主线程的微任务或 Background Process**，必须保证用户在打字时 1ms 以下的插件延迟开销 (`Activation Time < 10ms`)。
3.  **开源透明性**：必须配置详细的 `CONTRIBUTING.md`：
    *   明确的包管理工具 `pnpm`。
    *   明确的 CI/CD 自动化 `Lint`, `Prettier`, 及 `Unit Test` 步骤。
    *   一旦有人 PR (拉取请求)，在 1 分钟内跑完格式和静态类型检查。

## 🔐 隐私与安全约束 (Data Privacy)
我们定位的是“极客基础设施”，这意味着“无端被怀疑偷发代码”是致命毁誉的：
1.  **Your Prompts, Your Data**：所有的提示词和上下文抽取（包含源代码）只发生在这两个端点：
    *   本地的 Ollama/LMStudio 服务器 (100% Data Self-hosted)。
    *   用户自主填写的 OpenAI/Anthropic 官方 API (或企业网关代理)。
2.  **代码级的隔离**：
    *   插件绝不内嵌任何“匿名数据收集” SDK (Analytics / Telemetry)。
    *   如果在 Webview 中要用到外部图像渲染，只使用本地资源或官方域名加载。
3.  **README 中的免责声明**：我们要以大字标红强调：“We do NOT collect, analyze, or process ANY of your source code on our servers. The plugin routes strictly directly from your machine to your configured LLM provider.”
4.  **Token 管理策略**：必须使用 `vscode.SecretStorage` 系统妥善、加密地存储 API Keys，决不能明文在工程的 `settings.json` 落盘。