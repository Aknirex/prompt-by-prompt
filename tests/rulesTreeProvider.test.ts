import { describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
}));

vi.mock('vscode', async () => {
  class TreeItem {
    constructor(
      public label: string,
      public collapsibleState: number
    ) {}
  }

  class EventEmitter<T> {
    public event = () => ({ dispose: () => undefined });
    public fire(_value: T): void {}
  }

  class ThemeIcon {
    constructor(public id: string) {}
  }

  class ThemeColor {
    constructor(public id: string) {}
  }

  return {
    workspace: {
      get workspaceFolders() {
        return mockState.workspaceFolders;
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn(() => 'en'),
      })),
    },
    TreeItem,
    TreeItemCollapsibleState: {
      None: 0,
      Collapsed: 1,
      Expanded: 2,
    },
    EventEmitter,
    ThemeIcon,
    ThemeColor,
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
    },
  };
});

describe('RulesTreeProvider', () => {
  it('does not expose an Activated Rules root category', async () => {
    const { RulesTreeProvider } = await import('../src/providers/rulesTreeProvider');

    const ruleManager = {
      onDidChange: vi.fn(() => ({ dispose: () => undefined })),
      getWorkspaceRules: vi.fn(() => [{
        id: 'workspace:one',
        name: 'AGENTS.md',
        path: '/workspace/AGENTS.md',
        scope: 'workspace',
        format: 'markdown',
        content: '# workspace',
      }]),
      getGlobalRules: vi.fn(() => [{
        id: 'global:one',
        name: 'team.md',
        path: '/global/team.md',
        scope: 'global',
        format: 'markdown',
        content: '# personal',
      }]),
      resolveRuleSet: vi.fn(() => ({
        profile: { id: 'profile', name: 'Global: team.md', enabledRuleIds: ['global:one'], priority: 1, isActive: true },
        workspaceRules: [{
          id: 'workspace:one',
          name: 'AGENTS.md',
          path: '/workspace/AGENTS.md',
          scope: 'workspace',
          format: 'markdown',
          content: '# workspace',
        }],
        globalRules: [{
          id: 'global:one',
          name: 'team.md',
          path: '/global/team.md',
          scope: 'global',
          format: 'markdown',
          content: '# personal',
        }],
        activeRules: [],
        activeEntries: [
          {
            rule: {
              id: 'workspace:one',
              name: 'AGENTS.md',
              path: '/workspace/AGENTS.md',
              scope: 'workspace',
              format: 'markdown',
              content: '# workspace',
            },
            reason: 'workspace',
            status: 'active',
            required: false,
          },
          {
            rule: {
              id: 'global:one',
              name: 'team.md',
              path: '/global/team.md',
              scope: 'global',
              format: 'markdown',
              content: '# personal',
            },
            reason: 'global',
            status: 'active',
            required: false,
          },
        ],
        inactiveEntries: [],
        injectionMode: 'text-fallback',
        notes: [],
        conflicts: [],
      })),
    };

    const provider = new RulesTreeProvider(ruleManager as never);
    provider.refresh();

    const rootItems = await provider.getChildren();
    const labels = rootItems.map((item) => item.label);

    expect(labels).not.toContain('Activated Rules');
    expect(labels).toContain('Active rules');
    expect(labels).toContain('Project Rules');
    expect(labels).toContain('Personal Rules');
  });
});
