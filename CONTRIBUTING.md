# Contributing to Prompt by Prompt

感谢您有兴趣为 Prompt by Prompt 做出贡献！

## 🚀 开发入门

### 环境要求

- Node.js 18+
- npm 9+
- VS Code 1.85+

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/your-username/prompt-by-prompt.git
cd prompt-by-prompt

# 安装依赖
npm install

# 编译 TypeScript
npm run compile

# 监听文件变化
npm run watch
```

### 调试

1. 在 VS Code 中打开项目
2. 按 `F5` 启动调试
3. 这将打开一个新的 VS Code 窗口，扩展已加载

## 📝 代码规范

### TypeScript

- 使用 strict 模式
- 所有公共 API 必须有 JSDoc 注释
- 使用接口定义数据结构

### 提交信息

遵循 [Conventional Commits](https://www.conventionalcommits.org/) 规范：

```
feat: 添加新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
test: 测试相关
chore: 构建/工具相关
```

### 分支命名

- `feature/xxx` - 新功能
- `fix/xxx` - bug 修复
- `docs/xxx` - 文档更新
- `refactor/xxx` - 代码重构

## 🧪 测试

```bash
# 运行测试
npm test

# 运行测试并监听变化
npm run test:watch
```

## 📦 添加新模板

1. 在 `builtins/templates/` 目录创建新的 YAML 文件
2. 遵循模板 Schema 规范
3. 添加适当的测试用例

模板示例：

```yaml
id: "pbp.category.name.001"
name: "Template Name"
description: "Template description"
category: "Category Name"
tags: ["tag1", "tag2"]
author: "Your Name"
version: "1.0.0"

parameters:
  model: "claude-3-5-sonnet-20241022"
  temperature: 0.3
  max_tokens: 2000

variables:
  - name: "variable_name"
    description: "Variable description"
    type: "string"
    required: true

template: |
  Your prompt template here.
  Use {{variable_name}} for variables.
```

## 🔧 添加新的 LLM 适配器

1. 在 `src/services/llmAdapter.ts` 中创建新的适配器类
2. 实现 `LLMAdapter` 接口
3. 在 `LLMService` 中注册新适配器
4. 更新配置选项

## 📖 文档

- 更新 README.md 中的功能说明
- 添加 JSDoc 注释
- 更新类型定义

## 🐛 报告 Bug

请使用 GitHub Issues 报告 bug，包含：

- VS Code 版本
- 扩展版本
- 复现步骤
- 预期行为
- 实际行为
- 错误日志

## 💡 功能建议

欢迎在 GitHub Issues 中提出功能建议！

## 📜 许可证

通过提交代码，您同意您的贡献将根据 MIT 许可证授权。
