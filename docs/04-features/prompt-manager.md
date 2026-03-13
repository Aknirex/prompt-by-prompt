# 04-features: Prompt 管理器与模板引擎 (Manager & Templates)

## Prompt 管理器 (Manager)
作为 **Prompt by Prompt (PbP)** 的核心，此模块负责从编辑器与文件系统中发现和维护所有的 Prompt 配置。

### 核心功能列表
1.  **文件扫描机制**: 只读方式，启动时立即在 `~/.vscode/globalState` 和工作项目的 `.prompts/` 中抓取 `.yaml`/`.json` 文件。
2.  **树形视图展示 (TreeView UI)**: 
    *   按照 `category` (如 "Development", "Data", "Documentation") 进行分组渲染。
    *   在顶部支持全文搜索（Search）和按 `tags` 过滤（Filter）。
    *   侧边栏提供快速操作按键：`运行(Run)`, `编辑(Edit)`, `设置(Configure)`。
3.  **CRUD (增删改查) API**: 封装为 TypeScript 服务类，处理 JSON/YAML 和内存对象之间的一致性。
4.  **版本控制 (Git Integration)**:
    *   由于 Prompt 是由 YAML 文件落盘保存的，其直接天然享受 Git 的历史回溯。
    *   提供侧边菜单项 `"View Commit Diff"`，快捷调用 VS Code 内置的版本比对。

## 模板与变量引擎 (Template Engine)
在此模块中，我们将 50+ 精品开源预置模板分发给用户。

### 引擎工作机制
1.  使用者通过侧边栏或快捷键 `Ctrl+Shift+P` -> `"PbP: Execute Prompt"` 触发模板引擎。
2.  引擎启动 `ContextEngine.extract()`，执行时无任何阻塞感知，提取编辑器上下文，如 `{{selection}}`, `{{file_content}}`。
3.  对未能解析到的自定义变量 (如 Schema 中要求 `difficulty` 必填但没有提供)，立刻唤起一个极简的 VS Code Webview Input 或 `QuickPick` 让用户快速补齐参数。
4.  利用 `Handlebars.js` 编译模板，并注入完整变量以形成可用于 LLM 请求的 `Final Prompt`。

### 附标标准模板集
我们在 `.prompts/templates/` 中预置常见优质模板以引导用户（后续开源给社区 Fork）：
*   **代码分析**：`Code Review`, `Bug Detector`, `Performance Audit`
*   **代码产出**：`Unit Test Generator (Jest/Vitest)`, `Refactoring Assistant (SOLID)`
*   **撰写文档**：`API Documentation`, `Architecture Readme`, `Git Committer`
*   **业务架构**：`Database Schema Designer`, `Microservices API Spec`

> *Note: 用户可右键任意模板选择“Export to Global”或者“Pull into Workspace”以便团队同步共享。*