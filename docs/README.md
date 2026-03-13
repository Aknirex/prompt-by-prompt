# Prompt by Prompt (PbP) 文档导航指南

欢迎阅读 **Prompt by Prompt** 的项目规划与架构设计文档库。
本项目致力于在 VS Code 生态中，将“Prompt 工程化”确立为事实标准，强调由代码驱动、步步为营的 Prompt 开发体验。

## 📖 文档目录 (Table of Contents)

本目录按由宏观到微观的工程视角组织，请按照您的角色和需要的深度查阅：

### 第一部分：产品与设计 (Product & Design)
*   [00-overview.md](./00-overview.md) - 项目总览：愿景、定位、核心设计哲学与非目标。
*   [01-product-requirements.md](./01-product-requirements.md) - 需求与场景：目标用户、MVP用例边界。

### 第二部分：架构与工程 (Architecture & Engineering)
*   [02-architecture.md](./02-architecture.md) - 系统架构设计：核心模块划分、分层架构、目录结构规范（`.prompts/`）。
*   [03-data-spec.md](./03-data-spec.md) - 数据契约与协议：Prompt、模板及工作流的 YAML/JSON Schema 规范。

### 第三部分：核心功能模块 (Features)
存放于 `04-features/` 目录下：
*   [Prompt 管理器](./04-features/prompt-manager.md) - CRUD、树形视图与搜索。
*   [模板与变量引擎](./04-features/template-engine.md) - 50+ 精品内置模板与上下文注入机制。
*   [生成与调试面板](./04-features/generator-panel.md) - Prompt 补全、A/B Testing 体验设计。

### 第四部分：实施与治理 (Execution & Governance)
*   [05-roadmap.md](./05-roadmap.md) - 迭代计划：MVP 到社区标杆的演进里程碑。
*   [06-quality-security.md](./06-quality-security.md) - 质量与安全：零 Crash 指标、测试策略、隐私声明与数据隔离。
*   [07-operations.md](./07-operations.md) - 发布与运营：推广策略、社区增长与名誉维护。

---
*Generated based on Gemini, Grok, and Haiku proposals.*
