# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2025-03-14

### Added
- **Webview-based Prompt Editor Panel** - Rich editor for creating/editing prompts with full template support
- **AI Prompt Generation** - Generate prompts from natural language descriptions using configured AI provider
- **Settings Panel** - Dedicated webview settings interface with tabbed organization
- **BYOK Support** - Bring Your Own Key for OpenAI, Claude, Groq, and Ollama
- **Customizable Generator System Prompt** - Edit the system prompt used for AI prompt generation
- **Settings Button in Toolbar** - Quick access to settings from the sidebar

### Changed
- Improved prompt execution flow with better error handling
- Added "Copy" action for quick clipboard access
- Empty prompt detection and user feedback
- Auto-fallback to global storage when no workspace is open

### Fixed
- "No workspace folder open" error when creating prompts without an open workspace
- Empty input handling during prompt execution

## [0.1.0] - 2024-01-XX

### Added
- Initial MVP release
- Prompt Manager with CRUD operations
- Context Engine with variable extraction
- LLM Adapters for Ollama, OpenAI, Claude, and Groq
- Generator Panel with streaming support
- 45+ built-in prompt templates
- Tree View for prompt browsing
- VS Code configuration settings
- Core extension structure
- Prompt file scanning and watching
- Template rendering with Handlebars
- Multi-provider LLM support
- Webview-based response panel
- Built-in template library

[Unreleased]: https://github.com/your-username/prompt-by-prompt/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/your-username/prompt-by-prompt/releases/tag/v0.2.0
[0.1.0]: https://github.com/your-username/prompt-by-prompt/releases/tag/v0.1.0
