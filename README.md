# Prompt by Prompt

Prompt by Prompt is an AI task-pack workbench for VS Code. It helps you turn a rough coding request into a clear, portable task package before you hand it to Copilot, Cline, Cursor, Windsurf, Codex, or any other coding agent.

The extension is local-first. It does not run a server, does not sync to a cloud account, and does not try to push text into another extension's chat box.

## What It Does

- Create a task pack with goal, intent, constraints, acceptance criteria, verification steps, and attached context.
- Attach editor context: selection/current line, current file, chosen files, Git diff, VS Code diagnostics, and manual notes.
- Copy the task pack as Markdown for any agent chat.
- Save the task pack as a VS Code/Copilot `.prompt.md` file under `.github/prompts/`.
- Bootstrap a workspace AI setup with `AGENTS.md`, starter prompt files, starter custom agents, and optional Cursor/Cline/Windsurf rule adapters.
- Audit existing AI customizations for missing files, old rule formats, oversized instructions, duplicated always-on guidance, and invalid frontmatter.
- Optionally refine task packs with the VS Code Language Model API when a model is available and the user has granted access.

## Core Workflow

1. Open the Prompt by Prompt activity bar view.
2. Run **New Task Pack**.
3. Add any useful context from the workbench.
4. Copy the task pack or save it as `.github/prompts/<name>.prompt.md`.
5. Paste/run it in your preferred agent.

## Workspace AI Setup

Run **Prompt by Prompt: Bootstrap Workspace AI Setup** to preview and create:

- `AGENTS.md`
- `.github/prompts/implement-task.prompt.md`
- `.github/prompts/review-task.prompt.md`
- `.github/agents/implementation.agent.md`
- `.github/agents/reviewer.agent.md`

Optional adapters can also be generated:

- Cursor: `.cursor/rules/pbp-project.mdc`
- Cline: `.clinerules/01-project.md`
- Windsurf: `.windsurf/rules/pbp-project.md`

Existing files are never overwritten silently. The bootstrap command opens a preview and then asks whether to skip or overwrite existing files.

## Development

```bash
pnpm install
pnpm run compile
pnpm test
pnpm run lint
```

Press F5 in VS Code to launch the extension development host.

## Release

```bash
pnpm run package
pnpm run release
```

GitHub Actions builds the VSIX and publishes tagged releases to the VS Code Marketplace and Open VSX when the required tokens are configured.

## License

GPL v3 License - see [LICENSE](LICENSE).
