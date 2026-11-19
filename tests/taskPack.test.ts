import { describe, expect, it } from 'vitest';
import { createContextItem, createTaskPack, trimContentToBudget } from '../src/domain/taskPack';

describe('taskPack', () => {
  it('creates task packs with practical defaults', () => {
    const pack = createTaskPack({
      id: 'pack',
      title: 'Implement settings',
      intent: 'implement',
      goal: 'Add the missing setting.',
      now: new Date('2026-05-13T00:00:00.000Z'),
    });

    expect(pack.version).toBe(1);
    expect(pack.constraints).toContain('Keep changes scoped to the requested task.');
    expect(pack.acceptanceCriteria).toContain('The requested behavior is implemented end to end.');
  });

  it('trims long context by preserving head and tail', () => {
    const content = `${'a'.repeat(120)}middle${'z'.repeat(120)}`;
    const trimmed = trimContentToBudget(content, 120);

    expect(trimmed.truncated).toBe(true);
    expect(trimmed.content).toContain('[Content truncated by Prompt by Prompt]');
    expect(trimmed.content.startsWith('a')).toBe(true);
    expect(trimmed.content.endsWith('z'.repeat(25))).toBe(true);
  });

  it('marks context items as truncated when content exceeds budget', () => {
    const item = createContextItem({
      id: 'file',
      kind: 'file',
      label: 'large.ts',
      content: 'x'.repeat(500),
      budgetChars: 100,
    });

    expect(item.charCount).toBe(500);
    expect(item.truncated).toBe(true);
    expect(item.content?.length).toBeLessThanOrEqual(100);
  });
});
