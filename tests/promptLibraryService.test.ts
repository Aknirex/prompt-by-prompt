import { describe, expect, it } from 'vitest';
import { PromptLibraryService } from '../src/application/promptLibraryService';
import { PromptRepository } from '../src/application/promptRepository';
import { PromptDefinition, PromptLibraryItem, PromptSource } from '../src/domain/prompt';

function createPrompt(overrides: Partial<PromptDefinition>): PromptDefinition {
  return {
    id: overrides.id ?? 'prompt',
    schemaVersion: 1,
    title: overrides.title ?? 'Prompt',
    description: overrides.description ?? '',
    body: overrides.body ?? 'Do the task.',
    tags: overrides.tags ?? [],
    category: overrides.category,
    variables: overrides.variables ?? [],
    metadata: overrides.metadata ?? {},
  };
}

function createItem(prompt: PromptDefinition, source: PromptSource, readOnly = false): PromptLibraryItem {
  return {
    prompt,
    source,
    readOnly,
  };
}

function createRepository(id: string, items: PromptLibraryItem[]): PromptRepository {
  return {
    id,
    label: id,
    list: async () => items,
  };
}

describe('PromptLibraryService', () => {
  it('loads all repository items into a sorted snapshot and records repository failures', async () => {
    const favorite = createItem(
      createPrompt({
        id: 'favorite',
        title: 'Favorite Prompt',
        metadata: { favorite: true },
      }),
      { kind: 'builtin' },
      true
    );
    const recent = createItem(
      createPrompt({
        id: 'recent',
        title: 'Recent Prompt',
        metadata: { lastUsedAt: '2026-04-24T10:00:00.000Z' },
      }),
      { kind: 'shared', libraryId: 'team', libraryVersion: '1.0.0' },
      true
    );
    const personal = createItem(
      createPrompt({ id: 'personal', title: 'Personal Prompt' }),
      { kind: 'personal' }
    );
    const failingRepository: PromptRepository = {
      id: 'broken',
      label: 'Broken',
      list: async () => {
        throw new Error('Cannot read prompts');
      },
    };

    const service = new PromptLibraryService([
      createRepository('builtin', [favorite]),
      createRepository('shared', [recent]),
      createRepository('personal', [personal]),
      failingRepository,
    ]);

    const snapshot = await service.loadSnapshot(new Date('2026-04-25T00:00:00.000Z'));

    expect(snapshot.generatedAt).toBe('2026-04-25T00:00:00.000Z');
    expect(snapshot.entries.map((entry) => entry.item.prompt.id)).toEqual([
      'favorite',
      'recent',
      'personal',
    ]);
    expect(snapshot.diagnostics).toEqual([{
      repositoryId: 'broken',
      severity: 'error',
      message: 'Cannot read prompts',
    }]);
  });

  it('searches by title, description, tags, category, body, and source filters', async () => {
    const service = new PromptLibraryService([
      createRepository('personal', [
        createItem(createPrompt({
          id: 'review',
          title: 'Code Review',
          description: 'Inspect changed code for bugs',
          tags: ['quality', 'review'],
          category: 'Code Analysis',
          body: 'Review {{selection}} for security.',
          metadata: { favorite: true },
        }), { kind: 'personal' }),
      ]),
      createRepository('workspace', [
        createItem(createPrompt({
          id: 'test',
          title: 'Generate Tests',
          description: 'Create unit tests',
          tags: ['testing'],
          category: 'Testing',
          body: 'Write tests for {{file_content}}.',
        }), { kind: 'workspace', workspaceFolder: '/repo' }),
      ]),
    ]);
    const snapshot = await service.loadSnapshot();

    expect(service.search(snapshot, { query: 'review quality' }).map((entry) => entry.item.prompt.id)).toEqual(['review']);
    expect(service.search(snapshot, { query: 'file_content' })).toEqual([]);
    expect(service.search(snapshot, { query: 'file_content', includeBody: true }).map((entry) => entry.item.prompt.id)).toEqual(['test']);
    expect(service.search(snapshot, { query: 'tests', sourceGroups: ['personal'] })).toEqual([]);
    expect(service.search(snapshot, { query: 'tests', sourceGroups: ['workspace'] }).map((entry) => entry.item.prompt.id)).toEqual(['test']);
  });

  it('returns favorites and recents for sidebar sections', async () => {
    const service = new PromptLibraryService([
      createRepository('all', [
        createItem(createPrompt({
          id: 'old',
          title: 'Old Prompt',
          metadata: { lastUsedAt: '2026-04-20T00:00:00.000Z' },
        }), { kind: 'personal' }),
        createItem(createPrompt({
          id: 'new',
          title: 'New Prompt',
          metadata: { favorite: true, lastUsedAt: '2026-04-24T00:00:00.000Z' },
        }), { kind: 'workspace', workspaceFolder: '/repo' }),
        createItem(createPrompt({
          id: 'unused',
          title: 'Unused Prompt',
        }), { kind: 'builtin' }, true),
      ]),
    ]);

    const snapshot = await service.loadSnapshot();

    expect(service.getFavorites(snapshot).map((entry) => entry.item.prompt.id)).toEqual(['new']);
    expect(service.getRecents(snapshot, 1).map((entry) => entry.item.prompt.id)).toEqual(['new']);
    expect(service.getRecents(snapshot, 5).map((entry) => entry.item.prompt.id)).toEqual(['new', 'old']);
  });

  it('groups entries by source for tree rendering', async () => {
    const service = new PromptLibraryService([
      createRepository('all', [
        createItem(createPrompt({ id: 'personal', title: 'Personal' }), { kind: 'personal' }),
        createItem(createPrompt({ id: 'workspace', title: 'Workspace' }), { kind: 'workspace', workspaceFolder: '/repo' }),
        createItem(createPrompt({ id: 'shared', title: 'Shared' }), { kind: 'shared', libraryId: 'team', libraryVersion: '1.0.0' }, true),
        createItem(createPrompt({ id: 'builtin', title: 'Builtin' }), { kind: 'builtin' }, true),
      ]),
    ]);

    const snapshot = await service.loadSnapshot();
    const groups = service.groupBySource(snapshot);

    expect(groups.get('personal')?.map((entry) => entry.item.prompt.id)).toEqual(['personal']);
    expect(groups.get('workspace')?.map((entry) => entry.item.prompt.id)).toEqual(['workspace']);
    expect(groups.get('shared')?.map((entry) => entry.item.prompt.id)).toEqual(['shared']);
    expect(groups.get('builtin')?.map((entry) => entry.item.prompt.id)).toEqual(['builtin']);
  });
});

