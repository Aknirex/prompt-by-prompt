# Prompt by Prompt Product Notes

Prompt by Prompt is now an AI task-pack workbench.

## Positioning

The daily moment is immediately before a developer asks an agent to do real work. The extension gathers context, clarifies the goal, writes acceptance criteria, and produces a portable Markdown task pack.

The setup moment is when a repository needs shared AI operating instructions. The extension creates version-controlled files that VS Code/Copilot and other agents already understand.

## Non-goals

- No cloud sync.
- No account system.
- No direct injection into third-party agent input boxes.
- No private YAML prompt library as the primary format.

## Compatibility

The primary output format is Markdown:

- copied task packs for any chat surface
- `.github/prompts/*.prompt.md` for VS Code/Copilot prompt files
- `AGENTS.md` for cross-agent repository instructions
- optional adapter rules for Cursor, Cline, and Windsurf

