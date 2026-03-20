import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const globalStateStore = new Map<string, unknown>();

  return {
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
    globalStateStore,
    informationMessages: [] as string[],
    warningMessages: [] as string[],
    errorMessages: [] as string[],
  };
});

vi.mock('vscode', async () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    public event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    public fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  return {
    workspace: {
      get workspaceFolders() {
        return mockState.workspaceFolders;
      },
      fs: {
        delete: vi.fn(async (uri: { fsPath: string }) => {
          await fs.promises.rm(uri.fsPath, { force: true });
        }),
      },
      getConfiguration: vi.fn(() => ({
        get: vi.fn(),
        update: vi.fn(),
      })),
    },
    window: {
      showInformationMessage: vi.fn((message: string) => {
        mockState.informationMessages.push(message);
        return Promise.resolve(undefined);
      }),
      showWarningMessage: vi.fn((message: string) => {
        mockState.warningMessages.push(message);
        return Promise.resolve(undefined);
      }),
      showErrorMessage: vi.fn((message: string) => {
        mockState.errorMessages.push(message);
        return Promise.resolve(undefined);
      }),
    },
    commands: {
      executeCommand: vi.fn(async () => undefined),
    },
    Uri: {
      file: (fsPath: string) => ({ fsPath }),
      joinPath: (base: { fsPath: string }, ...segments: string[]) => ({
        fsPath: path.join(base.fsPath, ...segments),
      }),
    },
    EventEmitter,
  };
});

describe('RuleManager', () => {
  let workspaceDir: string;
  let globalDir: string;

  async function waitForRuleScan(check: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (check()) {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    throw new Error('Timed out waiting for rule scan');
  }

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-workspace-'));
    globalDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-global-'));
    mockState.workspaceFolders = [{ uri: { fsPath: workspaceDir } }];
    mockState.globalStateStore.clear();
    mockState.informationMessages.length = 0;
    mockState.warningMessages.length = 0;
    mockState.errorMessages.length = 0;
  });

  afterEach(async () => {
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
    await fs.promises.rm(globalDir, { recursive: true, force: true });
  });

  it('resolves workspace rules plus active profile global rules with reasons', async () => {
    await fs.promises.writeFile(path.join(workspaceDir, 'AGENTS.md'), '# workspace rule', 'utf8');
    await fs.promises.mkdir(path.join(globalDir, 'global-rules'), { recursive: true });
    const globalRulePath = path.join(globalDir, 'global-rules', 'team.md');
    await fs.promises.writeFile(globalRulePath, '# global rule', 'utf8');
    mockState.globalStateStore.set('pbp.activeGlobalRule', globalRulePath);

    const { RuleManager } = await import('../src/services/ruleManager');
    const manager = new RuleManager({
      globalStorageUri: { fsPath: globalDir },
      globalState: {
        get: (key: string, defaultValue?: unknown) =>
          mockState.globalStateStore.has(key) ? mockState.globalStateStore.get(key) : defaultValue,
        update: async (key: string, value: unknown) => {
          mockState.globalStateStore.set(key, value);
        },
      },
    } as never);

    await waitForRuleScan(() => manager.getRuleFiles().length > 0);

    const profiles = manager.getRuleProfiles();
    expect(profiles.map((profile) => profile.name)).toContain('Workspace Only');
    expect(profiles.map((profile) => profile.name)).toContain('Global: team.md');

    const resolved = manager.resolveRuleSet({ agentType: 'copilot', supportsStructuredContext: false });
    expect(resolved.profile.name).toBe('Global: team.md');
    expect(resolved.activeRules).toHaveLength(2);
    expect(resolved.activeEntries.map((entry) => entry.reason)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Workspace rule discovered in the current project'),
        expect.stringContaining('Enabled by active profile "Global: team.md"'),
      ])
    );
    expect(resolved.notes).toContain('Resolved for agent: copilot');
    expect(resolved.notes).toContain('Injection mode: text fallback');
  });

  it('detects duplicate-name conflicts across active workspace and global rules', async () => {
    await fs.promises.writeFile(path.join(workspaceDir, 'AGENTS.md'), '# workspace duplicate', 'utf8');
    await fs.promises.mkdir(path.join(globalDir, 'global-rules'), { recursive: true });
    const globalRulePath = path.join(globalDir, 'global-rules', 'AGENTS.md');
    await fs.promises.writeFile(globalRulePath, '# global duplicate', 'utf8');
    mockState.globalStateStore.set('pbp.activeGlobalRule', globalRulePath);

    const { RuleManager } = await import('../src/services/ruleManager');
    const manager = new RuleManager({
      globalStorageUri: { fsPath: globalDir },
      globalState: {
        get: (key: string, defaultValue?: unknown) =>
          mockState.globalStateStore.has(key) ? mockState.globalStateStore.get(key) : defaultValue,
        update: async (key: string, value: unknown) => {
          mockState.globalStateStore.set(key, value);
        },
      },
    } as never);

    await waitForRuleScan(() => manager.getRuleFiles().length > 0);

    const resolved = manager.resolveRuleSet();
    expect(resolved.conflicts).toHaveLength(1);
    expect(resolved.conflicts[0]?.message).toContain('Multiple active rules share the same file name: AGENTS.md');
  });
});
