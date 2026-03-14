# Prompt by Prompt (PbP)

> *"Treating your prompts as first-class code, step by step, prompt by prompt."*

A VS Code extension that brings **Prompt Engineering** to your development workflow. Manage, version, and execute prompts with the same care you give to your code.

## ✨ Features

### 🗂️ Prompt Management
- **Prompt as Code**: Store prompts in `.prompts/` directory with YAML format
- **Tree View**: Browse and manage prompts in VS Code sidebar
- **CRUD Operations**: Create, edit, delete prompts directly from the editor
- **Version Control**: Prompts are files, so they work with Git out of the box

### 🔧 Context Engine
- **Auto-extraction**: Automatically captures editor context (selection, file path, language, etc.)
- **Variable Injection**: Use `{{selection}}`, `{{filepath}}`, `{{file_content}}` in templates
- **Handlebars Templates**: Full template engine with conditionals and helpers

### 🤖 Agent Integration
- **Multiple Agents**: Send prompts to Cline, Roo Code, GitHub Copilot Chat, Continue
- **Clipboard Fallback**: Universal fallback for any agent
- **Status Bar**: Quick view and switch current agent
- **Smart Detection**: Auto-detect installed agents

### 📚 Built-in Templates
50+ curated templates for common development tasks:
- Code Review & Analysis
- Unit Test Generation
- Documentation Generation
- Refactoring Assistance
- Security Auditing
- And much more...

## 📦 Installation

### From VS Code Marketplace
*Coming soon*

### From Source
```bash
git clone https://github.com/your-repo/prompt-by-prompt.git
cd prompt-by-prompt
npm install
npm run compile
```

Then press F5 in VS Code to launch the extension in development mode.

## 🚀 Quick Start

### 1. Configure Your Agent

Open VS Code settings and search for "Prompt by Prompt":

```json
{
  "pbp.defaultAgent": "clipboard",
  "pbp.rememberLastAgent": true
}
```

Supported agents:
- **Cline** - Autonomous AI coding assistant
- **Roo Code** - Cline fork with enhanced features
- **GitHub Copilot Chat** - GitHub's AI assistant
- **Continue** - Open-source AI code assistant
- **Clipboard** - Universal fallback (copy to clipboard)

### 2. Create Your First Prompt

Click the "+" button in the Prompt by Prompt sidebar, or create a YAML file in `.prompts/templates/`:

```yaml
id: "my-first-prompt"
name: "My First Prompt"
description: "A simple prompt template"
category: "General"
tags: ["example"]
version: "1.0.0"

template: |
  You are a helpful assistant.
  
  Please help me with the following code:
  ```{{lang}}
  {{selection}}
  ```
```

### 3. Run a Prompt

1. Select code in the editor
2. Click on a prompt in the sidebar
3. Click the play button (▶️) to run
4. Select an agent to send the prompt to
5. The prompt will be sent to your chosen agent

**Status Bar**: The current agent is shown in the status bar. Click to change.

**Keyboard Shortcut**: Use the command palette (`Ctrl+Shift+P`) and search for "Prompt by Prompt: Run Prompt".

## 📁 Project Structure

```
.prompts/
├── .promptbyprompt.yaml    # Global configuration
└── templates/               # Your prompt templates
    ├── code-review.yaml
    └── my-prompt.yaml
```

## 🔑 Context Variables

Built-in variables you can use in templates:

| Variable | Description |
|----------|-------------|
| `{{selection}}` | Selected text in editor |
| `{{filepath}}` | Relative file path |
| `{{file_content}}` | Full file content |
| `{{lang}}` | Programming language |
| `{{project_name}}` | Workspace folder name |
| `{{git_commit_diff}}` | Git diff of changes |
| `{{line_number}}` | Current line number |
| `{{column_number}}` | Current column number |

## ⚙️ Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `pbp.defaultModel` | Default LLM provider | `ollama` |
| `pbp.ollamaEndpoint` | Ollama API endpoint | `http://localhost:11434` |
| `pbp.ollamaModel` | Default Ollama model | `llama3.2` |
| `pbp.openaiApiKey` | OpenAI API key | `""` |
| `pbp.openaiModel` | Default OpenAI model | `gpt-4o-mini` |
| `pbp.claudeApiKey` | Anthropic API key | `""` |
| `pbp.claudeModel` | Default Claude model | `claude-3-5-sonnet-20241022` |
| `pbp.groqApiKey` | Groq API key | `""` |
| `pbp.groqModel` | Default Groq model | `llama-3.3-70b-versatile` |
| `pbp.promptsDir` | Prompts directory name | `.prompts` |

## 🎯 Use Cases

### Code Review
Select code → Run "Code Review Assistant" → Get detailed feedback

### Unit Test Generation
Select a function → Run "Unit Test Generator" → Get comprehensive tests

### Documentation
Select code → Run "API Documentation Generator" → Get JSDoc/docstrings

### Git Commits
Stage changes → Run "Git Commit Message" → Get semantic commit message

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Development

```bash
# Clone the repository
git clone https://github.com/your-repo/prompt-by-prompt.git

# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm test
```


## 发布到 VS Code Marketplace

The [`release`](.github/workflows/release.yml) workflow compiles the extension, packages a
`.vsix`, and publishes it to the VS Code Marketplace whenever a GitHub release is published or
the workflow is triggered manually via **Run workflow**.

1. Generate a Personal Access Token (PAT) scoped to Visual Studio Marketplace:
   - Go to https://marketplace.visualstudio.com/manage/aknirex/prompt-by-prompt
   - Create a token with **All accessible accounts** and **Publish** permissions.
2. Add the token to this repository as the secret `VSCE_PAT`.
3. Draft a release (`gh release create vX.Y.Z`) or click **Run workflow** on the **Release** workflow
   page in GitHub Actions. The workflow will publish the extension with the `publisher` set in `package.json`.

The workflow also attaches the generated `.vsix` artifact to the GitHub release for download.

## 📄 License

GPL v3 License - see [LICENSE](LICENSE) for details.
## 🙏 Acknowledgments

- Inspired by the need for better prompt engineering tools
- Built with VS Code Extension API
- Template engine powered by Handlebars

---

**Your Prompts, Your Data - Nothing touches our servers.**
