# Test Plan

## 更新时间

2026-03-23

## 目标

本文档定义 `Prompt by Prompt` 重构阶段的测试边界、当前覆盖现状和后续补齐优先级。

重构期测试原则：

1. 先保护执行主链路。
2. 先覆盖解析与存储一致性。
3. 用户可见行为变化必须伴随文档更新。

---

## 1. 当前已覆盖

当前仓库已存在以下测试文件：

- `tests/executionService.test.ts`
- `tests/promptManager.test.ts`
- `tests/ruleManager.test.ts`

当前已覆盖的核心能力包括：

- execution payload / preview 相关行为
- per-prompt execution history 复用
- prompt storage consistency
- rule profile / resolved rule set 的基础解析
- duplicate-name rule conflict

---

## 2. 必跑校验

每次核心重构后至少运行：

```bash
npm run compile
npm run lint
npm test
```

这三项当前应作为最小质量门禁。

---

## 3. 单元测试优先级

### P0

- `ExecutionService`
  - 首次执行
  - 复用上次执行
  - target / behavior 可用性校验
  - preview 与 dispatch 的差异

- `PromptManager`
  - create / update / rename / delete 一致性
  - workspace / global 存储边界
  - legacy global prompt migration

- `RuleManager`
  - workspace/global 扫描
  - active profile 切换
  - active rule 解析
  - conflict 检测

### P1

- `ContextEngine`
  - builtin variable extraction
  - template variable detection
  - missing variable collection
  - renderTemplate 的边界情况

- `AgentService`
  - capability resolution
  - target availability fallback

### P2

- Webview 相关状态同步逻辑
  - Prompt Editor 的 form / YAML 同步
  - SettingsPanel 的动态显示逻辑

---

## 4. 集成测试场景

当前仓库仍缺正式集成测试体系，建议后续优先补以下场景：

### Prompt 生命周期

- 创建 global prompt
- 创建 workspace prompt
- 编辑 prompt
- 重命名 prompt
- 删除 prompt

### 执行流程

- 首次执行 prompt
- 复用上次执行 target / behavior
- `ask-every-time` 模式下重新选择
- `initial-recommendation` 模式下走推荐值
- preview 独立打开

### 规则流程

- workspace/global 规则共同生效
- active profile 切换
- rule conflict 在 preview 中可见

---

## 5. 回归关注点

每次较大改动后，至少手工回归这些路径：

- Prompt Tree 点击运行
- `runPromptWithPicker`
- `previewPrompt`
- `selectExecutionTarget`
- rule profile 切换
- prompt editor 保存
- settings panel 保存

---

## 6. 当前缺口

当前仍明显不足的地方：

- 缺少 `ContextEngine` 系统测试
- 缺少设置页和编辑器 webview 行为测试
- 缺少真正的集成测试或脚本化 UI 验证
- 缺少覆盖率基线与门禁阈值

---

## 7. 后续建议

建议按下面顺序继续补齐：

1. 补 `ContextEngine` 单测
2. 扩充 `ExecutionService` 边界 case
3. 为 `SettingsPanel` / `PromptEditorPanel` 抽可测纯函数
4. 建立最小集成测试脚手架
