import { describe, expect, it, vi } from 'vitest';

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

describe('TeamPoliciesTreeProvider', () => {
  it('shows source status in the root and omits Sync Sources', async () => {
    const { TeamPoliciesTreeProvider } = await import('../src/providers/teamPoliciesTreeProvider');

    const ruleManager = {
      onDidChange: vi.fn(() => ({ dispose: () => undefined })),
      getTeamPolicySourceStates: vi.fn(() => [
        { sourceId: 'acme-git', type: 'git', status: 'synced', lastSyncedAt: '2026-03-31T00:00:00.000Z' },
        { sourceId: 'local-pack', type: 'local-folder', status: 'error', lastSyncError: 'Pack manifest not found or invalid.' },
      ]),
      getSharedLibrarySummaries: vi.fn(() => [{
        id: 'acme-engineering',
        name: 'Acme Engineering Shared Library',
        version: '1.4.2',
        sourceId: 'acme-git',
        sourcePath: '/tmp/acme',
        ruleCount: 1,
        promptCount: 1,
        status: 'active',
        trust: 'trusted',
      }]),
      getInstalledTeamPacks: vi.fn(() => [{
        id: 'acme-engineering',
        name: 'Acme Engineering Shared Library',
        version: '1.4.2',
        sourceId: 'acme-git',
        sourcePath: '/tmp/acme',
        rules: [],
        prompts: [],
        status: 'active',
        trust: 'trusted',
      }]),
    };

    const provider = new TeamPoliciesTreeProvider(ruleManager as never);
    provider.refresh();

    const rootItems = await provider.getChildren();
    const labels = rootItems.map((item) => item.label);

    expect(labels).not.toContain('Sync Sources');
    expect(labels).toContain('Source Status');
    expect(labels).toContain('Shared Libraries');
  });
});
