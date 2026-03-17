# Prompt by Prompt (PbP)

> *"Treating your prompts as first-class code, step by step, prompt by prompt."*

Prompt by Prompt (PbP) is a VS Code extension that brings **Prompt Engineering** into your development workflow. It allows you to manage, version, and execute prompts with the same care you give to your code.

## ✨ Key Features

### 🗂️ Prompt Management
- **Prompt as Code**: Store prompts in the `.prompts/` directory using YAML format.
- **Tree View**: Browse and manage prompts directly in the VS Code sidebar.
- **CRUD Operations**: Create, edit, and delete prompts within the editor.
- **Version Control**: Prompts are files, making them Git-friendly out of the box.

### 📜 Rule Management
- **Global & Workspace Rules**: Easily manage custom agent rules alongside workspace configurations `.prompts/`.
- **System Inference**: Auto-generates system-aware prompts indicating shell environment and OS for tailored LLM response natively.
- **Sidebar Integration**: Fully manageable and selectable via the Rules tree view sidebar.

### 🌐 Multi-language Support (i18n)
- **Localized UI**: Seamlessly supports English, Simplified Chinese (zh-cn), Japanese (ja), Spanish (es), and Korean (ko) based on your VS Code display language.

### 🔧 Context Engine
- **Auto-extraction**: Automatically captures editor context (selection, file path, language, etc.).
- **Variable Injection**: Use `{{selection}}`, `{{filepath}}`, `{{file_content}}`, etc., in templates.
- **Handlebars Templates**: Supports the powerful Handlebars template engine, including conditionals and helpers.

### 🤖 Agent Integration
- **Multi-Agent Support**: Send prompts to Cline, Roo Code, GitHub Copilot Chat, Continue, and more.
- **Clipboard Fallback**: Universal fallback option for any agent.
- **Status Bar**: Quickly view and switch the current agent.
- **Smart Detection**: Automatically detects installed agents.

### 📚 Built-in Templates
Includes 50+ curated templates for common development tasks:
- Code Review & Analysis
- Unit Test Generation
- Documentation Generation
- Refactoring Assistance
- Security Auditing
- And more...

## 📦 Installation

### From VS Code Marketplace
[Visit the Marketplace](https://marketplace.visualstudio.com/items?itemName=aknirex.prompt-by-prompt)

### From OpenVSX
[Visit OpenVSX](https://open-vsx.org/extension/aknirex/prompt-by-prompt)

### From Source
```bash
git clone https://github.com/Aknirex/prompt-by-prompt.git
cd prompt-by-prompt
npm install
npm run compile
```
Then press F5 in VS Code to launch the extension.

## 🚀 Quick Start

1. **Configure Agent**: Search for "Prompt by Prompt" in VS Code settings.
2. **Create Prompt**: Click the "+" button in the sidebar, or create a YAML file in `.prompts/templates/`.
3. **Run Prompt**: Select code, click a prompt in the sidebar, and click the play button (▶️).

## 🔑 Context Variables

| Variable | Description |
|----------|-------------|
| `{{selection}}` | Selected text in the editor |
| `{{filepath}}` | Relative file path |
| `{{file_content}}` | Full file content |
| `{{lang}}` | Programming language |
| `{{project_name}}` | Workspace folder name |
| `{{git_commit_diff}}` | Git diff of changes |

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## 📄 License

GPL v3 License - see [LICENSE](LICENSE) for details.

---

**Your Prompts, Your Data - Nothing touches our servers.**
