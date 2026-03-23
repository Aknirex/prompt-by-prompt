# Prompt by Prompt 重构规划

## 0. 当前落地状态（更新于 2026-03-23）

结合 [`docs/TODOLIST.md`](/d:/Code/software/prompt-by-prompt/docs/TODOLIST.md)、当前架构文档以及近期 git 历史，可初步确认：

- Phase 0 已基本完成
- Phase 1 已基本完成
- Phase 2 已基本完成
- Phase 3 已进一步推进，Prompt 编辑器职责收敛、变量 schema UI、编辑器内渲染预览、表单 / YAML 双视图，以及设置页按用户任务分区重组已落地，当前主要剩余体验打磨与 schema 单一事实来源收敛
- Phase 4 尚未系统展开，测试补齐、统一 repository/schema 拆分、执行历史与收藏能力仍需继续推进

已可确认的落地项包括：

- 执行主链路已统一收敛到 `ExecutionService`
- Sidebar、命令面板、rerun 已走同一条执行链路
- 已支持 per-prompt 最近执行记录复用
- 已引入 `RuleProfile` 与 `ResolvedRuleSet`
- 规则解析已从“直接 append 文本”升级为“先解析、再按 target 生成注入结果”
- 规则树已区分 Active Profile / Active Rules / Workspace Rules / Global Rules
- 设置页已引入 `executionSelectionMode`，并动态按 agent 能力过滤 behavior
- 设置页已按 `Run Defaults` / `Storage & UI` / `Prompt Generator` 重组，并补充当前配置摘要与基础诊断提示
- `dispatchText` 与 `previewText` 已拆分
- `npm run compile` 与 `npm run lint` 当前均可通过
- `ARCHITECTURE.md`、`DATA-MODEL.md`、`EXECUTION-FLOW.md`、`SETTINGS-SCHEMA.md`、`RULE-SYSTEM.md`、`TEST-PLAN.md` 已补齐

当前仍明确未完成或仅部分完成的事项包括：

- `canUseStructuredContext` 仍主要作为解析/说明层标记，尚未真正对接 adapter 的结构化上下文 API
- `RuleProfile` 目前仍是自动生成模型，还不是完整可编辑、可持久化的用户对象
- Prompt 编辑器已具备表单 / YAML 双视图、变量 schema 表单与渲染预览，但高级 schema 能力与 YAML/form 状态同步体验仍可继续打磨
- `enabledRuleProfile` 还未成为正式 manifest 设置项
- 统一 `Repository` 边界与独立 history/settings repository 仍未建立
- 收藏 / 最近使用 / 执行历史的产品化能力仍未展开
- execution history、prompt storage consistency 等测试已补到基础覆盖，但整体集成测试体系仍需继续完善

本文档下面各章节保留原始目标设计，同时补充“当前实现状态”，用于区分“已落地能力”和“目标态能力”。

## 1. 文档目标

本文档用于指导 `Prompt by Prompt` 的系统性重构，目标不是做零散修补，而是重新建立清晰的产品心智、稳定的数据模型、可扩展的执行链路，以及可持续演进的工程基础。

本文档关注四类问题：

- 产品定位与用户心智不清
- 提示词、规则、执行目标之间职责混淆
- 配置、UI、运行时行为不一致
- 缺少测试、规范和回归保护

---

## 2. 重构总目标

### 2.1 产品目标

把 PbP 从“提示词文件工具”升级为“面向 AI 协作的提示词与规则编排器”。

用户应该能稳定理解下面四个对象：

- Prompt：用户当前要完成的任务模板
- Rule：环境、团队、Agent 的长期约束
- Target：结果发送到哪里
- Behavior：以什么方式发送

### 2.2 用户体验目标

- 第一次运行有引导，但不繁琐
- 第二次运行尽量一键复用上次配置
- 规则存在感强，但不污染提示词正文
- 用户始终知道“最终发送出去的内容是什么”
- 配置项少而清晰，不让用户承担系统复杂度

### 2.3 工程目标

- 数据模型稳定
- 命令链路可测试
- UI 与配置单一事实来源
- 新 Agent、新规则类型、新模板能力可低成本扩展

---

## 3. 当前核心问题总览

## 3.1 执行链路问题

- Sidebar 点击提示词与命令处理器参数不一致，核心主链路存在失效风险
- `defaultAgent`、`ask every time`、状态栏切换、每次弹窗选择等逻辑互相冲突
- `sendBehavior` 暴露了 `insert`，但运行时并未真正实现
- 第一次运行与后续运行没有形成差异化流程

### 最佳实践建议

- 执行链路必须有单一入口和统一上下文对象
- “默认值”在本文中统一指“初始推荐值”，只影响首次推荐，不代表下次自动执行结果
- 上次执行记录优先级高于初始推荐值，但仍不应覆盖用户当前显式动作
- UI 暴露的能力必须与底层能力完全一致
- 首次执行与再次执行应共享同一状态模型

## 3.2 规则系统问题

- 当前规则通过文本 append 注入到最终 prompt
- 规则与提示词正文混在一起，削弱提示词本身的可维护性
- 规则文件只是被扫描和列出，没有“策略管理”能力
- 全局规则与工作区规则没有明确优先级、启停、冲突说明
- 当前实现不符合用户对 `AGENTS.md` / `.clinerules` 一类文件的主流认知

### 最佳实践建议

- 规则系统应独立于提示词模板
- 规则应先解析、合并、解释，再交给发送层
- 不同 Agent 的规则注入方式应由 adapter 决定
- 对用户暴露“哪些规则当前生效、为什么生效”

## 3.3 Prompt 数据与存储问题

- workspace prompt 改名可能导致旧文件残留
- watcher 刷新逻辑容易保留无效缓存
- 全局 prompt 使用 globalState，便携性和可迁移性弱
- builtin / global / workspace 三种来源缺少一致的元数据层

### 最佳实践建议

- prompt 应有稳定 ID 与独立持久化元数据
- 文件名可以变，但不应成为唯一身份标识
- 所有来源都应映射为统一的仓储模型
- 存储层必须支持增量刷新、重命名、删除一致性

## 3.4 Prompt 编辑体验问题

- 编辑器提示的上下文变量与真实变量不一致
- 变量定义能力被 UI 简化，丢失类型、默认值、必填、枚举等字段
- 编辑器同时承担“生成器”“表单编辑器”“目标选择器”职责，负担过重

### 最佳实践建议

- 编辑器只聚焦“创建/编辑 prompt 本身”
- 运行目标、行为等执行态信息不应耦合在编辑表单里
- 模板变量应有 schema 驱动的表单 UI
- 编辑器中应可预览模板变量和渲染效果

## 3.5 设置页问题

- 设置页承载了过多低频配置
- Manifest、Settings Webview、运行时代码之间存在不一致
- Agent 列表和 provider 配置分散且重复
- 配置结构偏“实现导向”，不是“用户任务导向”

### 最佳实践建议

- 把“低频设置”与“高频操作”分离
- 保证 package.json、类型定义、运行时逻辑使用同一配置 schema
- 配置项围绕用户问题组织，而不是围绕内部模块组织
- 优先提供“能否工作”的诊断信息，而非只让用户填字段

## 3.6 Agent 抽象问题

- Agent 能力建模过于粗糙，只区分 `canSendDirectly` / `canOpenPanel`
- 不同 Agent 的“append / insert / send”能力没有被明确建模
- 很多集成只是 clipboard fallback，但 UI 仍然给出类似能力预期

### 最佳实践建议

- 建立更细粒度的 Agent capability 模型
- 显式区分：
  - 支持新建任务
  - 支持填充输入框
  - 支持追加
  - 支持自动发送
  - 支持结构化上下文
- UI 只展示当前 Agent 真正支持的行为

## 3.7 工程质量问题

- lint 未通过
- 测试为空
- 回归只能靠手工点击验证
- 文档和实现存在明显偏差

### 最佳实践建议

- 至少建立命令层、存储层、规则解析层的单元测试
- 对关键交互建立集成测试或可脚本化验证
- 任何用户可见功能都需要文档和代码共同更新
- 引入“重构期间不新增无测试核心逻辑”的约束

---

## 4. 建议的目标架构

### 当前实现状态

截至目前，项目已经具备与目标架构相近的主干分层，但仍未完全拆到 repository 粒度：

- Domain 类型已基本成形
- Application / Service 层已形成 `ExecutionService`、`RuleManager`、`ContextEngine`、`AgentService`
- Presentation 层已具备 Prompt Tree、Rule Tree、Prompt Editor、Settings Panel
- Integration 侧仍主要体现为 adapter/service 组合，尚未完全沉淀为独立 `Repository` / `Adapter` 边界

也就是说，当前更接近“Service-first 的过渡架构”，而不是本文这里描述的完整目标态分层。

## 4.1 核心分层

建议拆成以下层次：

1. Domain 层
   - PromptTemplate
   - RuleFile
   - RuleProfile
   - ExecutionTarget
   - ExecutionBehavior
   - ExecutionPreset
   - ResolvedExecution

2. Repository 层
   - PromptRepository
   - RuleRepository
   - SettingsRepository
   - ExecutionHistoryRepository

3. Application 层
   - PromptApplicationService
   - RuleApplicationService
   - ExecutionService
   - PreviewService

4. Integration 层
   - AgentAdapter
   - FileAdapter
   - ClipboardAdapter

5. Presentation 层
   - Tree Providers
   - Editor Panel
   - Settings Panel
   - QuickPick / Commands

## 4.2 关键运行对象

建议引入统一的执行上下文：

```ts
interface ResolvedExecution {
  prompt: PromptTemplate;
  renderedPrompt: string;
  resolvedRules: ResolvedRuleSet;
  target: ExecutionTarget;
  behavior: ExecutionBehavior;
  variables: Record<string, string>;
  sourceContext: EditorContext;
  previewText: string;
}
```

### 最佳实践建议

- 所有执行都先生成 `ResolvedExecution`
- 预览、发送、保存历史都基于这个对象
- UI 不直接拼 prompt 文本
- adapter 不直接读取全局设置，而应消费显式执行参数

---

## 5. 数据模型重构建议

### 当前实现状态

当前数据模型文档已拆到 [`docs/DATA-MODEL.md`](/d:/Code/software/prompt-by-prompt/docs/DATA-MODEL.md)。整体上：

- `PromptTemplate`、`PromptVariable`、`RuleFile`、`RuleProfile`、`ResolvedRuleSet`、`ResolvedExecution` 已存在
- `ExecutionHistoryRecord` 已存在，但仍存放于 `globalState`
- `ExecutionPreset` 已引入为独立模型
- `PromptRepository`、`RuleRepository`、`ExecutionHistoryRepository`、`SettingsRepository` 仍处于目标态，尚未独立实现

## 5.1 PromptTemplate

建议扩展字段：

```ts
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  version: string;
  variables?: PromptVariable[];
  template: string;
  visibility: "workspace" | "global" | "builtin";
  filePath?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  favorite?: boolean;
}
```

### 最佳实践建议

- `source` 改成更稳定、语义更清晰的 `visibility` 或 `origin`
- 增加 `lastUsedAt`、`favorite` 支持产品层排序
- 不要让文件名承担 ID 责任

### 当前实现状态

- `PromptTemplate.id` 已存在并参与运行时识别
- `source` 命名目前仍保留，尚未完全切换到 `visibility` / `origin`
- `lastUsedAt`、`favorite` 尚未进入当前主模型

## 5.2 PromptVariable

建议完整支持：

- `type`
- `required`
- `default`
- `enum values`
- `placeholder`
- `multiline`
- `source`（builtin/context/manual）

### 最佳实践建议

- 变量 schema 是运行体验的重要基础，不要简化丢字段
- 运行时输入表单应由变量 schema 自动生成

### 当前实现状态

- 当前已支持 `type`、`required`、`default`、`values`、`placeholder`、`multiline`
- 运行时变量收集已能根据 schema 选择 Quick Pick 或 Input Box
- 编辑器端已具备更完整的变量 schema 表单 UI，并支持与 YAML 视图共享同一份 prompt 定义

## 5.3 Rule 模型

建议把“规则文件”和“生效策略”分开：

```ts
interface RuleFile {
  id: string;
  name: string;
  path: string;
  scope: "workspace" | "global";
  format: "markdown" | "plain";
  content: string;
}

interface RuleProfile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  priority: number;
  appliesTo?: AgentType[];
}
```

### 最佳实践建议

- 允许多个全局规则共存，但通过 profile 控制生效集合
- 允许用户显式启停规则，不要默认“扫到即生效”

### 当前实现状态

- `RuleProfile` 与 `ResolvedRuleSet` 已实现
- 当前 profile 由 `RuleManager.refreshProfiles()` 自动生成
- workspace rules 当前仍默认参与解析
- global rules 已可通过 active profile 控制启用集合
- 用户显式启停规则的完整模型仍未实现

## 5.4 ExecutionPreset

```ts
interface ExecutionPreset {
  id: string;
  name: string;
  target: "agent" | "clipboard" | "file";
  agentType?: AgentType;
  behavior?: "send" | "append" | "insert";
  outputPath?: string;
}
```

### 最佳实践建议

- “上次运行配置”本质上就是临时 preset
- 未来可以扩展为“项目预设”和“收藏执行方式”

### 当前实现状态

- per-prompt 最近执行记录已落地
- `ExecutionPreset` 已独立建模，并作为执行选择 / 最近执行记录的共享抽象

---

## 6. 执行流程重构建议

### 当前实现状态

当前执行链路的真实实现已整理到 [`docs/EXECUTION-FLOW.md`](/d:/Code/software/prompt-by-prompt/docs/EXECUTION-FLOW.md)。与本章目标相比：

- 统一执行入口已完成
- 首次执行 / 后续复用模型已完成主体逻辑
- preview 与实际 dispatch 内容已拆分
- target / behavior 已受 capability matrix 约束
- 独立 `pbp.previewPrompt` 命令已恢复
- 已提供显式 `pbp.selectExecutionTarget` 命令
- dispatch payload composer 仍内聚在 `ExecutionService` 中，尚未进一步拆分

## 6.1 目标流程

### 第一次执行

1. 用户选择 Prompt
2. 系统解析上下文与变量
3. 用户补充缺失变量
4. 用户选择 Target
5. 若 Target 为 Agent，选择该 Agent 支持的 Behavior
6. 展示最终预览
7. 执行并记录本次配置

### 第二次及后续执行

1. 用户选择 Prompt
2. 系统解析上下文与变量
3. 先校验上次 Target + Behavior 当前是否仍然可用
4. 若可用，则直接执行
5. 若不可用，则退化到重新选择目标 / 行为，并向用户说明原因
6. 执行并更新历史

## 6.2 推荐命令设计

- `pbp.runPrompt`
- `pbp.runPromptWithPicker`
- `pbp.rerunLastTarget`
- `pbp.previewPrompt`
- `pbp.selectExecutionTarget`

### 最佳实践建议

- “快速执行”和“完整执行”应是两个入口
- 快速执行默认优先复用上次执行记录，而不是回退到初始推荐值
- 所有“复用上次执行”都必须先经过可用性校验，再决定是否退化
- 预览应可独立打开，不依赖真正发送
- 运行记录必须与 prompt 解耦

### 当前实现状态

- `pbp.runPrompt`
- `pbp.runPromptWithPicker`
- `pbp.previewPrompt`
- `pbp.selectExecutionTarget`
- `pbp.rerunLastTarget`

以上入口已存在并走统一链路。

---

## 7. 规则系统重构建议

## 7.1 目标原则

- 规则不修改 PromptTemplate 本身
- 规则不默认直接拼接进用户正文
- 规则需要单独管理、启停、预览、解释

## 7.2 建议机制

1. 规则扫描
   - 识别 workspace / global 规则文件

2. 规则选择
   - 根据 profile、当前项目、当前 Agent 计算生效集合

3. 规则合并
   - 生成 `ResolvedRuleSet`

4. 规则注入
   - 由 adapter 决定如何附加到实际消息

## 7.3 Rule 注入策略

### 对支持结构化上下文的 Agent

- 尽量作为 system/context 发送

### 对只支持文本注入的 Agent

- 使用标准化 fallback 模板
- 清晰分区：
  - Task Prompt
  - Active Rules
  - Editor Context

示例：

```text
[Task Prompt]
...

[Active Rules]
- Rule: AGENTS.md
...

[Editor Context]
- file: ...
```

### 最佳实践建议

- 所有 fallback 拼接都要可预览
- 用户必须知道“规则是附加上下文，不是模板正文”
- 规则冲突时应给出提示，而不是静默覆盖

---

## 8. Prompt 编辑器重构建议

### 当前实现状态

目前 Prompt 编辑器已基本达到本章目标：

- 编辑器职责已收敛到模板、变量 schema、元数据与预览
- 执行目标 / 行为不再混在编辑主界面中，仅保留“保存到哪里”的存储选择
- 已支持变量 schema 表单编辑
- 已支持内置上下文变量帮助与编辑器内实时渲染预览
- 已支持表单视图 / YAML 视图双模式，并通过同一份 prompt 定义在两者之间同步

仍可继续优化的方向包括：

- YAML 与表单之间更细粒度、更低摩擦的同步体验
- 更高级的 schema 字段编辑能力
- 更明确的模板语法诊断与校验反馈

## 8.1 职责收敛

Prompt 编辑器只负责：

- 编辑模板内容
- 编辑变量 schema
- 编辑名称、描述、分类、标签
- 查看内置上下文变量
- 预览渲染结果

不建议继续在 Prompt 编辑器里放：

- 执行目标选择
- 运行行为选择
- 复杂 provider 设置

## 8.2 编辑器能力建议

- 变量面板支持：
  - 类型
  - required
  - default
  - enum 值
- 内置变量帮助列表
- 模板语法校验
- 实时预览
- YAML 源码视图与表单视图双模式

### 最佳实践建议

- 表单视图降低门槛
- YAML 视图服务高级用户
- 两者共享统一 schema，避免双实现漂移

---

## 9. 设置页重构建议

### 当前实现状态

当前真实设置语义已整理到 [`docs/SETTINGS-SCHEMA.md`](/d:/Code/software/prompt-by-prompt/docs/SETTINGS-SCHEMA.md)，并与 `package.json` manifest 配置、`SettingsPanel` webview 与运行时代码共同构成当前设置模型说明。与本章目标相比：

- `executionSelectionMode` 已成为当前执行模型核心设置
- `rememberLastExecution` 已退居兼容层
- `defaultAgent` 与 `sendBehavior` 已有更清晰的“初始推荐值”语义
- 设置页会根据 agent capability matrix 过滤 behavior
- 设置页已按 `Run Defaults` / `Storage & UI` / `Prompt Generator` 重组为更面向用户任务的信息架构
- `enabledRuleProfile` 还不是正式 manifest 设置项

## 9.1 设置分类

建议按用户任务重组：

### 基础设置

- 默认保存位置
- UI 语言
- 是否记住上次执行目标

### 执行设置

- 初始推荐 Target
- 初始推荐 Agent
- 初始推荐 Behavior
- 文件输出目录

### Prompt 生成器设置

- Provider
- Model
- API Key
- Generator system prompt

### 高级设置

- 自定义 provider
- 调试日志
- 实验特性

## 9.2 设置项删改建议

### 保留

- `promptsDir`
- `defaultTarget`
- `outputDirectory`
- provider 相关配置

### 新增

- `rememberLastExecution`
- `lastExecutionTarget`
- `lastExecutionBehavior`
- `previewBeforeSend`
- `enabledRuleProfile`

### 删除或重命名

- 删除没有真实实现的配置项
- `defaultAgent=ask` 改成更清晰的“初始推荐策略”配置
- `sendBehavior` 应只暴露 Agent 实际支持的选项

### 最佳实践建议

- package.json 中的配置定义必须是唯一真实来源
- Webview 设置页只读取 schema，不自己维护另一套隐式模型
- 设置页中必须明确区分“初始推荐值”和“上次执行记录”
- 优先级统一为：用户当前显式选择 > 上次执行记录 > 初始推荐值

---

## 10. Tree View 与导航重构建议

## 10.1 Prompt Tree

建议支持：

- 最近使用
- 收藏
- 分类
- 来源筛选
- 搜索

### 最佳实践建议

- Prompt Tree 不只是“文件夹视图”，应服务高频调用
- 最常用项应优先展示，而不是只按分类静态列出

## 10.2 Rule Tree

建议支持：

- Workspace Rules
- Global Rules
- Active Profile
- 当前生效规则

每个规则节点建议显示：

- 是否启用
- 作用域
- 适用 Agent
- 最近修改时间

### 最佳实践建议

- “已存在的规则文件”与“当前生效的规则”必须区分展示

---

## 11. Agent 集成重构建议

### 当前实现状态

Agent 能力建模已经明显前进：

- capability matrix 已进入运行时
- behavior picker 已按真实能力过滤
- payload 已按 target/agent 分流生成

但以下目标仍未完全完成：

- `canUseStructuredContext` 还未真正走 adapter 级结构化发送
- “官方稳定支持 / 实验性支持 / 剪贴板兼容支持”的产品分层仍未正式建立
- Agent 生态调研机制仍停留在规划层

## 11.1 能力矩阵

建议为每个 Agent 定义能力矩阵：

```ts
interface AgentCapabilities {
  canCreateTask: boolean;
  canFillInput: boolean;
  canAppendInput: boolean;
  canInsertInput: boolean;
  canAutoSubmit: boolean;
  canUseStructuredContext: boolean;
}
```

## 11.2 Adapter 设计原则

- adapter 不直接读 UI 状态
- adapter 只处理“如何发送”
- adapter 不决定“发送什么”

### 最佳实践建议

- 发送前由应用层完成标准化
- adapter 尽量纯粹、可替换、可单测
- 对 fallback 行为明确记录日志与用户提示

## 11.3 Agent 生态扩展策略

当前支持的 Agent 插件主要来自作者个人使用经验，这在项目早期可以接受，但不应成为长期产品策略。

后续应把“支持哪些 Agent”从个人经验判断，升级为“基于市场与生态数据的持续研究”。

建议建立 Agent 生态调研机制，定期从以下来源收集信息：

- VS Code Marketplace 的安装量、评分、趋势榜单
- Open VSX 数据
- GitHub Star、Release 频率、Issue 活跃度
- 开发者工具排行榜、媒体盘点、社区榜单
- 第三方扩展数据供应商或插件分析服务

建议按以下维度评估是否纳入支持：

- 市场占有度
- 增长趋势
- 与 PbP 目标用户的匹配度
- 是否提供稳定 API 或命令入口
- 是否支持结构化上下文
- 是否支持填充、追加、发送等关键能力
- 维护稳定性与版本兼容性

### 最佳实践建议

- 建立“候选 Agent 清单”，不要一次性把支持列表写死在个人经验里
- 将 Agent 支持分为：
  - 官方稳定支持
  - 实验性支持
  - 剪贴板兼容支持
- 定期基于排行榜和数据供应商复审支持列表
- 文档中公开说明“为什么支持这些 Agent”，提高产品透明度
- adapter 列表应服务于扩展能力，而不是替代市场调研

---

## 12. 存储与同步重构建议

### 当前实现状态

本章中与“停止 watcher 驱动刷新”“避免隐式工作区写入”相关的止血项已基本完成：

- watcher-driven prompt refresh 已移除
- watcher-driven rule refresh 已移除
- 扫描阶段不再隐式创建 prompt/rule 目录
- 工作区规则读取目前更接近按需探测，而非持续同步

但下面这些目标仍未完全落地：

- global prompt 正文主链路已迁出 `globalState` 并改为文件存储，但仍保留 legacy migration 兼容逻辑，后续可继续收敛
- `PromptRepository` / `RuleRepository` 级别的统一存储抽象仍未建立
- 执行历史目前仍在 `globalState`

## 12.1 Prompt 存储

建议：

- workspace prompt 仅在用户明确选择工作区存储时才使用文件
- global prompt 改为扩展全局目录中的文件，而不是 globalState

推荐目录：

```text
<globalStorage>/prompts/
<globalStorage>/rules/
<globalStorage>/history/
```

### 最佳实践建议

- 用户内容尽量文件化，便于备份、迁移、调试
- globalState 更适合轻量元数据，不适合正文内容
- 不要为了“可能会用到”就在用户工作区预创建目录或空文件
- 工作区写入应采用 lazy creation，只在用户第一次明确保存到工作区时才创建目录
- 现有 `.prompts/templates` 应考虑完全移除，避免扩展默认在仓库里制造空目录
- 若未来仍保留 `.prompts` 概念，也应让它成为用户显式选择的结果，而不是隐式默认行为

## 12.2 刷新机制
删除工作区与全局规则目录的持续刷新和文件监控机制。

PbP 应明确收缩边界，不承担外部文件变化同步器的职责。

建议改为：

- 不监听工作区文件变化
- 不监听全局目录文件变化
- 不依赖 watcher 维护内部状态
- 不把“手动刷新”作为核心能力设计
- 工作区规则若需更新，应通过 PbP 内部编辑后再覆盖写回目标文件
- 用户直接在工作区外部修改规则文件，不作为 PbP 需要实时接管的主流程

PbP 的核心事实来源应是自身内部管理的数据，而不是工作区上任意可能变化的文件集合。

### 最佳实践建议

- 不为兼容边缘场景引入长期复杂度
- 不把 Git 切换、外部编辑、其他扩展改动作为主要架构前提
- 只有用户主动发起与规则相关的操作时，才进行有限、一次性的工作区探测
- PbP 的产品定位更接近“提示词与规则管理器”，而不是“工作区规则同步器”

## 12.3 工作区写入策略

建议新增明确规则：

- 未经用户主动操作，不向工作区写入任何目录
- 未经用户主动操作，不生成空模板目录、空规则目录、空输出目录
- 若用户从未使用工作区存储功能，扩展应可完全在“零工作区写入”模式下工作

### 最佳实践建议

- 把“是否需要写入工作区”视为显式产品决策，而不是实现细节
- 当用户第一次选择工作区存储时，再清晰提示将创建哪些目录和文件
- 工作区应被视为用户资产，扩展默认行为应尽量非侵入

## 12.4 工作区规则读入策略

建议改为按需读入，而不是持续同步。

推荐策略：

- 仅在用户主动新建规则时，读取一次工作区中可能存在的 rule 文件
- 读取的目的不是建立长期监听，而是帮助用户发现现有规则生态
- 若发现已有规则文件，应提示用户：
  - 直接使用已有文件
  - 新建另一份规则
  - 取消本次操作

适合探测的文件包括：

- `AGENTS.md`
- `.clinerules`
- `.cursorrules`
- `.windsurfrules`
- `.aiderrules`
- `.codeiumrules`

### 最佳实践建议

- 探测应是轻量、一次性的，不要演化为后台同步机制
- 工作区规则文件应被视为“用户已有资产”，优先提示复用而不是自动改写
- “发现已有规则”与“接管已有规则”是两回事，默认应只发现、不接管

---

## 13. 测试与质量保障建议

### 当前实现状态

目前可以确认：

- `npm run compile` 已通过
- `npm run lint` 已通过
- `npm run test` 已通过
- 已补充 prompt storage consistency、execution history、规则解析与 execution payload / preview 相关单测

仍待补齐：

- ContextEngine 测试
- RuleManager 更系统的 profile / conflict / priority 测试
- preview composition 更系统的覆盖
- 集成测试体系与 `TEST-PLAN.md`

## 13.1 必须补齐的测试

### 单元测试

- PromptRepository
- RuleRepository
- ContextEngine
- ExecutionService
- Agent capability resolution

### 集成测试

- 创建 prompt
- 修改 prompt
- 重命名 prompt
- 删除 prompt
- 首次执行
- 复用上次执行
- 规则解析与预览

### 回归测试重点

- Sidebar 点击运行
- `send` / `append` / `insert` 行为
- rule profile 切换
- 全局/工作区规则优先级

## 13.2 质量门禁

- `npm run compile` 必须通过
- `npm run lint` 必须通过
- 核心模块 PR 必须带测试
- 文档变更与行为变更同步更新

### 最佳实践建议

- 重构先建护栏，再搬逻辑
- 对现有 bug 先写回归测试，再修复

---

## 14. 文档体系建议

### 当前实现状态

以下文档已经补齐：

- `ARCHITECTURE.md`
- `EXECUTION-FLOW.md`
- `DATA-MODEL.md`
- `RULE-SYSTEM.md`
- `SETTINGS-SCHEMA.md`
- `REFACTOR-PLAN.md` 当前状态已按代码重新核对更新

建议在 `docs/` 增补以下文档：

- `ARCHITECTURE.md`
- `EXECUTION-FLOW.md`
- `DATA-MODEL.md`
- `RULE-SYSTEM.md`
- `SETTINGS-SCHEMA.md`
- `TEST-PLAN.md`

### 最佳实践建议

- 文档应围绕“用户模型”和“开发模型”双线展开
- 所有可见行为都应能在文档中被解释

---

## 15. 分阶段实施计划

## Phase 0：止血修复

目标：先恢复核心可用性，避免继续扩大债务。

### 当前状态：已基本完成

### 任务

- [x] 修复 Prompt Tree 点击运行参数错误
- [x] 清理未实现或误导性的设置项
- [x] 修复 prompt 重命名残留文件问题
- [x] 移除 watcher 驱动的 prompt/rule 刷新逻辑
- [x] 停止扫描时隐式创建目录
- [x] 统一变量文案与真实上下文字段
- [x] 让 lint 通过

## Phase 1：执行链路重构

目标：建立稳定的首次执行/复用执行模型。

### 当前状态：已基本完成

### 任务

- [x] 引入 `ExecutionService`
- [x] 引入独立 `ExecutionPreset`
- [x] 引入上次执行记录
- [x] 重写 target / behavior 选择逻辑
- [x] 增加 preview 能力
- [x] 恢复独立 `previewPrompt` 命令
- [x] 把 adapter 从 UI 逻辑中解耦

## Phase 2：规则系统重构

目标：把规则从“文本拼接”升级为“独立策略层”。

### 当前状态：已基本完成

### 任务

- [x] 引入 `RuleProfile`
- [x] 引入 `ResolvedRuleSet`
- [x] 重构规则树与生效状态展示
- [x] 实现按 Agent 注入规则
- [x] 提供基础规则预览与冲突提示
- [ ] 将 `RuleProfile` 升级为完整可编辑、可持久化对象
- [ ] 深化规则冲突诊断
- [ ] 真正接入 structured context adapter API

## Phase 3：编辑器与设置页重构

目标：降低理解成本，提升高频效率。

### 当前状态：大部分完成

### 已完成

- [x] 已补充 Phase 2 / Phase 3 对应的架构、执行流、规则、设置语义文档
- [x] 设置语义已经开始区分“初始推荐值”和“上次执行记录”
- [x] 设置页已根据 Agent 能力动态过滤 behavior
- [x] 设置页已按用户任务重组为多分区结构
- [x] 已进一步减少低频配置对主流程的干扰
- [x] Prompt 编辑器职责已收敛
- [x] 已增加变量 schema 表单
- [x] 已增加编辑器内的渲染预览
- [x] 已增加表单 / YAML 双视图

### 剩余任务

- [ ] 收敛设置 schema 的单一事实来源
- [ ] 继续打磨 YAML / form 同步和高级 schema 编辑体验

## Phase 4：工程化与扩展能力

目标：让系统能持续演进。

### 当前状态：已部分展开

### 任务

- [x] 增加基础单元测试
- [ ] 增加集成测试
- [ ] 建立统一配置 schema
- [x] 完善 `TEST-PLAN.md`
- [ ] 补覆盖率说明与质量门禁细化
- [ ] 支持收藏、最近使用、执行历史的进一步产品化
- [ ] 为更多 Agent 和规则生态预留扩展点

## 当前阶段说明

当前项目仍处于闭门打磨阶段，用户规模和兼容性包袱都有限。

这意味着：

- 可以接受为澄清模型而进行大改
- 可以优先追求结构正确，而不是为了旧实现做过度兼容
- 但即使允许大改，执行主链路仍应保留最小回归保护

---

## 16. 优先级建议

## P0 必做

- 修复执行主链路
- 修复存储一致性
- 修复配置与行为不一致
- 补最小回归测试

## P1 高价值

- 执行流程重构
- 规则系统解耦
- 预览机制
- 上次执行复用

## P2 产品升级

- 收藏 / 最近使用
- 规则 profile
- 项目 preset
- 更强的编辑器和预览

## P3 长期演进

- 团队共享方案
- 导入导出
- 规则诊断
- 多工作区支持

---

## 17. 重构原则

整个重构过程中应坚持以下原则：

1. 先澄清对象边界，再修改 UI。
2. 先建立可测试的应用层，再处理集成细节。
3. 不把规则继续塞进提示词正文。
4. 不暴露未实现、半实现、或能力不稳定的配置项。
5. 任何用户高频路径都必须比现在更短、更稳、更可预期。
6. 文档、类型、配置、UI、运行时行为必须保持一致。

---

## 18. 最终目标图景

重构完成后，PbP 应该具备以下体验：

- 用户把 Prompt 当作任务模板管理
- 用户把 Rule 当作团队或环境约束管理
- 用户第一次配置执行目标，之后高频一键复用
- 用户随时可以预览实际发送内容
- 不同 Agent 的差异由系统吸收，而不是由用户猜测
- 全局与工作区内容都可迁移、可调试、可测试

这才是一个成熟的“提示词与规则管理器”应有的产品形态。
