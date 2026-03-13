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

### 🤖 LLM Integration
- **Multiple Providers**: Support for Ollama (local), OpenAI, Claude, and Groq
- **Streaming Responses**: Real-time streaming output in webview panel
- **A/B Testing**: Compare responses from different models (coming soon)

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

### 1. Configure Your LLM Provider

Open VS Code settings and search for "Prompt by Prompt":

```json
{
  "pbp.defaultModel": "ollama",
  "pbp.ollamaEndpoint": "http://localhost:11434",
  "pbp.ollamaModel": "llama3.2"
}
```

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
3. Click "Run" or use the play button
4. View the streaming response in the Generator panel

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

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- Inspired by the need for better prompt engineering tools
- Built with VS Code Extension API
- Template engine powered by Handlebars

---

**Your Prompts, Your Data - Nothing touches our servers.**
