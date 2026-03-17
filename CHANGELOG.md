# Changelog

# [1.7.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.6.0...v1.7.0) (2026-03-17)


### Features

* enhance default global rule generation logic and content ([b12e830](https://github.com/Aknirex/prompt-by-prompt/commit/b12e830e40eae9cae13944abd1336a2400e7f7b2))

# [1.6.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.5.0...v1.6.0) (2026-03-17)


### Features

* enhance rule management with global rules support and default rule generation ([a79c656](https://github.com/Aknirex/prompt-by-prompt/commit/a79c65654cfe6217ca6ea78e17bbe5d8e7daac7a))
* refactor command structure to support workspace and global rules, update localization, and enhance rule management ([e04ad73](https://github.com/Aknirex/prompt-by-prompt/commit/e04ad730b02d90cfdafe42731fda63195385147f))
* remove unused activation events for prompts and rules views ([02f2c75](https://github.com/Aknirex/prompt-by-prompt/commit/02f2c7574ea1d182d9b4912dcd5e4d8eba374213))

# [1.5.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.4.0...v1.5.0) (2026-03-17)


### Features

* implement internationalization support and update UI for prompt management ([748951b](https://github.com/Aknirex/prompt-by-prompt/commit/748951b7b0e31869fabea80ad4de9511e5ee5033))

# [1.4.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.3.0...v1.4.0) (2026-03-16)


### Features

* add new templates for architecture design, database design, and requirement analysis ([c5de947](https://github.com/Aknirex/prompt-by-prompt/commit/c5de947115fdcbf2f8fb82c217c1688cbbbd8abc))

# [1.3.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.2.0...v1.3.0) (2026-03-15)


### Features

* new icon ([d09a612](https://github.com/Aknirex/prompt-by-prompt/commit/d09a61254e0e5aa844be2fe5a04c029c30853e66))

# [1.2.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.1.0...v1.2.0) (2026-03-15)


### Bug Fixes

* add activation events for prompts and rules views ([3f307a5](https://github.com/Aknirex/prompt-by-prompt/commit/3f307a508966def35ecb802a00e5bdd1b8dd1e1e))


### Features

* add more rule files and default rule file setting ([3859881](https://github.com/Aknirex/prompt-by-prompt/commit/3859881d4bf6c5cdaec66932e7532b55c6ad9f4b))

## [1.1.1](https://github.com/Aknirex/prompt-by-prompt/compare/v1.1.0...v1.1.1) (2026-03-15)


### Bug Fixes

* add activation events for prompts and rules views ([3f307a5](https://github.com/Aknirex/prompt-by-prompt/commit/3f307a508966def35ecb802a00e5bdd1b8dd1e1e))

# [1.1.0](https://github.com/Aknirex/prompt-by-prompt/compare/v1.0.3...v1.1.0) (2026-03-15)


### Features

* add rule manager ([bb1e735](https://github.com/Aknirex/prompt-by-prompt/commit/bb1e735151cad0679dd94b9d46af4661aa2b05d4))

## [1.0.3](https://github.com/Aknirex/prompt-by-prompt/compare/v1.0.2...v1.0.3) (2026-03-15)

## [1.0.2](https://github.com/Aknirex/prompt-by-prompt/compare/v1.0.1...v1.0.2) (2026-03-15)

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
