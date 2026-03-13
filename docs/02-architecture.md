# 02 Architecture - 架构设计与规范

## 🏗️ 整体系统架构
**Prompt by Prompt** 的架构遵循极致轻量与高响应率的设计规范。使用 TypeScript 构建于 VS Code Extension API 之上。

```mermaid
graph TD
    A[VS Code Editor] --> B{Prompt by Prompt Core}
    B --> C[Manager Service]
    B --> D[Context Engine]
    B --> E[Generator / Webview]

    C --> |Registry & YAML/JSON| F[`.prompts/` (Workspace)]
    C --> |Global Memento| G[`Global Prompts`]

    D --> |Variable Extraction| H[VS Code Context (AST, File, Selection)]
    D --> |Template Engine| I[Handlebars.js / Template Parser]

    E --> |Execution & Tuning| J[LLM Adapters]
    J --> K[Local Models (Ollama)]
    J --> L[Cloud APIs (Claude, Groq, etc.)]
```

## 📂 项目结构规范 (Directory Structure)
为了贯彻“配置即代码” (Configuration as Code)，我们在用户项目的根目录隐式创建 `.prompts/`，结构如下：

```text
.prompts/                   # 核心配置目录
├── .promptbyprompt.yaml    # 插件全局配置文件 (模型选择, 默认变量)
├── templates/              # Prompt 实体模板
│   ├── code-review.yaml    # 单个 Prompt 模板定义
│   └── test-gen.yaml       
└── workflows/              # 链式调用的逻辑定义 (Phase 2+)
    └── auto-refactor.json  
```

## 🧱 核心模块分工 (Module Boundaries)
*   **Prompt Manager (管理器)**：
    *   **边界**：仅负责文件系统的 I/O 操作和缓存。监控 `.prompts/*.yaml` 的变化并更新内存中的 AST。实现 Workspace 层与 Global 层的穿透与继承。
*   **Context Engine (上下文引擎)**：
    *   **边界**：连接编辑器状态与最终文本的桥梁。只做读取（Read-only）操作，提取 `{{selection}}`、`{{filepath}}` 等内置变量。基于 Handlebars（或其他零依赖解析器）渲染模板。不处理 API 调用。
*   **Command Generator (生成器 & LLM 适配)**：
    *   **边界**：接收已渲染的完整 Prompt，打包为 `messages` 发送到配置的 LLM 端点。处理 `stream` 响应和网络错误，并传递给 Webview UI 层。
*   **UI Layer (Webview & TreeView)**：
    *   **边界**：侧边栏树形菜单、操作按钮面板（CRUD）。负责展示生成结果和 A/B 对比。无状态，数据由 Core 通知刷新。

## ⚠️ 架构决策总结 (Architectural Decisions)
*   采用 VS Code `GlobalState` 存储跨项目（Global）的通用模板。
*   采用 `.prompts/` 的 YAML 格式而非数据库存储工作区（Workspace）模板。
*   语言：TypeScript (`strict: true`)
*   UI：基于 React 极简框架构建 Webview，以保持代码清洁并能复用社区 Tailwind 组件，保持极客美学。