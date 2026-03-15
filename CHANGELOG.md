# Changelog

## [1.0.1](https://github.com/Aknirex/prompt-by-prompt/compare/v1.0.0...v1.0.1) (2026-03-15)

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-15

### Added
- Updated Node.js LTS support to current version v24.14.0 (added `engines.node` field specifier)
- Updated `@eslint/js`, `@types/node`, and `eslint` devDependencies to latest versions

## [0.3.9] - 2026-03-15

### Fixed
- Fix GitHub Actions permission issue by granting `contents: write` to the `create-release` job so it can generate release notes

## [0.3.8] - 2026-03-15

### Fixed
- Fix vsce publish command to use `--packagePath` argument to correctly publish the pre-packaged vsix file
- Add `--skip-duplicate` to ovsx publish command to handle duplicate releases safely

## [0.3.7] - 2026-03-15

### Fixed
- Fix vsce package command to use baseContentUrl and baseImagesUrl for proper README asset resolution

## [0.3.6] - 2026-03-15

### Fixed
- Fix vsce publish command to use `--skip-duplicate` instead of unsupported `--prepublish` option

## [0.3.5] - 2026-03-15

### Fixed
- Fix prepublish script configuration in vsce publish workflow

## [0.3.4] - 2026-03-15

### Changed
- Update version number to 0.3.3 in package configuration files

## [0.3.3] - 2026-03-15

### Fixed
- Fix prepublish script execution during publish process

## [0.2.1] - 2025-03-14

### Changed
- Remove all emojis from UI for cleaner interface
- Add "Ask Every Time" as default agent option
- Sort AI providers alphabetically in settings
- Rename provider names for consistency (e.g., "Claude" -> "Anthropic", "Gemini" -> "Google AI")

### Added
- New AI providers: DeepSeek, Mistral AI, xAI (Grok), Azure OpenAI
- Total 10 AI providers now supported: Anthropic, Azure OpenAI, DeepSeek, Google AI, Groq, Mistral AI, Ollama, OpenAI, OpenRouter, xAI
- Independent provider/model selection in AI Generate section

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
