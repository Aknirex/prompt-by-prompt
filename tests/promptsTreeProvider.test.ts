import { describe, expect, it, vi } from 'vitest';
import { PromptLibrarySnapshot } from '../src/application/promptLibraryService';
import { PromptTemplate } from '../src/types/prompt';

vi.mock('vscode', async () => {
  class EventEmitter<T> {
    public event = vi.fn();
    public fire = vi.fn((_value?: T) => undefined);
  }

  class TreeItem {
    label: string;
    collapsibleState: number;
    description?: string;
    tooltip?: unknown;
    contextValue?: string;
    iconPath?: unknown;
    command?: unknown;

    constructor(label: string, collapsibleState: number) {
      this.label = label;
      this.collapsibleState = collapsibleState;
    }
  }

  class ThemeIcon {
    constructor(public readonly id: string) {}
  }

  class MarkdownString {
    value = '';
    appendMarkdown(value: string): void {
      this.value += value;
    }
  }

  return {
    EventEmitter,
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    ThemeIcon,
    MarkdownString,
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: vi.fn((_key: string, fallback?: unknown) => fallback),
      })),
    },
    env: {
      language: 'en',
    },
  };
});

function createSnapshot(): PromptLibrarySnapshot {
  return {
    generatedAt: '2026-04-25T00:00:00.000Z',
    diagnostics: [],
    entries: [
      {
        key: 'personal:review',
        sourceGroup: 'personal',
        item: {
          readOnly: false,
          source: { kind: 'personal' },
          prompt: {
            id: 'review',
            schemaVersion: 1,
            title: 'Review',
            description: 'Review code',
            body: 'Review {{selection}}.',
            tags: ['review'],
            category: 'Code Analysis',
            variables: [],
            metadata: {
              favorite: true,
              lastUsedAt: '2026-04-24T00:00:00.000Z',
            },
          },
        },
      },
      {
        key: 'workspace:test',
        sourceGroup: 'workspace',
        item: {
          readOnly: false,
          source: { kind: 'workspace', workspaceFolder: '/repo' },
          prompt: {
            id: 'test',
            schemaVersion: 1,
            title: 'Tests',
            description: 'Write tests',
            body: 'Write tests.',
            tags: ['test'],
            category: 'Testing',
            variables: [],
            metadata: {},
          },
        },
      },
    ],
  };
}

function createPrompt(id: string, name: string): PromptTemplate {
  return {
    id,
    name,
    description: '',
    category: 'General',
    tags: [],
    version: '1.0.0',
    template: '',
  };
}

describe('PromptsTreeProvider', () => {
  it('renders favorites, recents, and source groups from the library snapshot', async () => {
    const { PromptsTreeProvider } = await import('../src/providers/promptsTreeProvider');
    const provider = new PromptsTreeProvider();
    provider.setLibrary(new Proxy(createSnapshot(), {}) as PromptLibrarySnapshot, new Map([
      ['personal:review', { ...createPrompt('review', 'Review'), favorite: true, lastUsedAt: '2026-04-24T00:00:00.000Z' }],
      ['workspace:test', createPrompt('test', 'Tests')],
    ]));

    const rootItems = await provider.getChildren();
    expect(rootItems.map((item) => item.label)).toEqual(['Favorites', 'Recent', 'Personal', 'Workspace']);

    const favoriteChildren = await provider.getChildren(rootItems[0]);
    expect(favoriteChildren.map((item) => item.label)).toEqual(['Review']);

    const workspaceCategories = await provider.getChildren(rootItems[3]);
    expect(workspaceCategories.map((item) => item.label)).toEqual(['Testing']);

    const workspacePrompts = await provider.getChildren(workspaceCategories[0]);
    expect(workspacePrompts.map((item) => item.label)).toEqual(['Tests']);
  });
});

