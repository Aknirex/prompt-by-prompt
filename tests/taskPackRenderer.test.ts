import { describe, expect, it } from 'vitest';
import { createContextItem, createTaskPack } from '../src/domain/taskPack';
import {
  renderClineRule,
  renderCursorRule,
  renderPromptFile,
  renderTaskPackMarkdown,
  renderWindsurfRule,
} from '../src/domain/taskPackRenderer';

describe('taskPackRenderer', () => {
  it('renders clipboard-ready task packs with attached context', () => {
    const pack = createTaskPack({
      id: 'pack-1',
      title: 'Fix auth tests',
      intent: 'fix',
      goal: 'Make auth tests pass without changing public APIs.',
      now: new Date('2026-05-13T00:00:00.000Z'),
    });
    pack.contextItems.push(createContextItem({
      id: 'selection',
      kind: 'selection',
      label: 'Selection from src/auth.ts',
      source: 'src/auth.ts:4',
      language: 'typescript',
      content: 'export const token = "";',
      budgetChars: 1000,
    }));
    pack.verificationCommands.push('pnpm test auth');

    const rendered = renderTaskPackMarkdown(pack);

    expect(rendered).toContain('# Task Pack: Fix auth tests');
    expect(rendered).toContain('Make auth tests pass');
    expect(rendered).toContain('Selection from src/auth.ts');
    expect(rendered).toContain('```typescript');
    expect(rendered).toContain('`pnpm test auth`');
  });

  it('renders VS Code prompt files with frontmatter', () => {
    const pack = createTaskPack({
      id: 'pack-2',
      title: 'Review parser',
      intent: 'review',
      goal: 'Review parser edge cases.',
      now: new Date('2026-05-13T00:00:00.000Z'),
    });

    const rendered = renderPromptFile(pack);

    expect(rendered).toMatch(/^---\n/);
    expect(rendered).toContain('description: "Run task pack: Review parser"');
    expect(rendered).toContain('agent: agent');
    expect(rendered).toContain('# Task Pack: Review parser');
  });

  it('renders adapter rules for Cursor, Cline, and Windsurf', () => {
    expect(renderCursorRule('Demo')).toContain('alwaysApply: true');
    expect(renderCursorRule('Demo')).toContain('AGENTS.md');
    expect(renderClineRule('Demo')).toContain('# Demo Agent Rules');
    expect(renderWindsurfRule('Demo')).toContain('trigger: always_on');
  });
});
