# Prompt by Prompt

Prompt by Prompt is a focused VS Code prompt manager. It keeps prompts as plain YAML files, shows them in a dedicated sidebar, renders them with the current editor context, and copies the final prompt to your clipboard.

## What It Does

- Store workspace prompts under `.prompts/`.
- Keep personal prompts in VS Code global storage.
- Browse prompts by category in the Prompt by Prompt sidebar.
- Search across title, description, category, tags, source, and body.
- Favorite prompts for quick access.
- Preview the rendered prompt before using it.
- Copy rendered prompts with context variables such as `{{selection}}`, `{{filepath}}`, `{{file_content}}`, `{{lang}}`, `{{project_name}}`, `{{line_number}}`, and `{{column_number}}`.
- Duplicate bundled starter prompts into your own library.

## Prompt File Format

```yaml
schemaVersion: 1
id: code-review
title: Code Review
description: Review selected code for correctness and maintainability.
category: Development
tags:
  - review
  - code
body: |
  Review this {{lang}} code from {{filepath}}.

  Code:
  {{selection}}

  Focus on correctness, edge cases, maintainability, and tests.
variables:
  - name: tone
    description: Review tone
    type: enum
    required: false
    default: direct
    values:
      - direct
      - friendly
```

Legacy files that use `name` and `template` are still readable.

## Development

```bash
pnpm install
pnpm run compile
pnpm test
pnpm run lint
```

Press F5 in VS Code to launch the extension development host.

## Release

The existing package and release flow is preserved:

```bash
pnpm run package
pnpm run release
```

GitHub Actions builds the VSIX and publishes tagged releases to the VS Code Marketplace and Open VSX when the required tokens are configured.

## License

GPL v3 License - see [LICENSE](LICENSE).
