import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const globalStateStore = new Map<string, unknown>();

  return {
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
    globalStateStore,
    configValues: {} as Record<string, unknown>,
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
        get: vi.fn((key: string, fallback?: unknown) =>
          mockState.configValues[key.replace('pbp.', '')] ?? fallback),
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

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-workspace-'));
    globalDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-global-'));
    mockState.workspaceFolders = [{ uri: { fsPath: workspaceDir } }];
    mockState.globalStateStore.clear();
    mockState.configValues = {};
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

    await manager.initialize();

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

    await manager.initialize();

    const resolved = manager.resolveRuleSet();
    expect(resolved.conflicts).toHaveLength(1);
    expect(resolved.conflicts[0]?.message).toContain('Multiple active rules share the same file name: AGENTS.md');
  });

  it('resolves team policy pack rules from workspace binding and exposes policy version metadata', async () => {
    const packDir = path.join(globalDir, 'team-pack');
    await fs.promises.mkdir(path.join(packDir, 'rules'), { recursive: true });
    await fs.promises.mkdir(path.join(packDir, 'profiles'), { recursive: true });
    await fs.promises.mkdir(path.join(workspaceDir, '.pbp'), { recursive: true });

    await fs.promises.writeFile(path.join(packDir, 'pack.json'), JSON.stringify({
      id: 'acme-engineering',
      name: 'Acme Engineering Policy Pack',
      version: '1.4.2',
    }), 'utf8');
    await fs.promises.writeFile(path.join(packDir, 'rules', 'secure-defaults.md'), '# secure defaults', 'utf8');
    await fs.promises.writeFile(path.join(packDir, 'profiles', 'frontend-standard.json'), JSON.stringify({
      id: 'frontend-standard',
      name: 'Frontend Standard',
      enabledRuleIds: [],
      requiredRuleIds: ['secure-defaults'],
    }), 'utf8');
    await fs.promises.writeFile(path.join(workspaceDir, '.pbp', 'policy.json'), JSON.stringify({
      packId: 'acme-engineering',
      packVersion: '1.4.2',
      profileId: 'frontend-standard',
      allowPersonalOverrides: true,
      pinned: true,
    }), 'utf8');

    mockState.configValues = {
      teamPolicySources: [{ id: 'local-pack', type: 'local-folder', path: packDir }],
    };

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

    await manager.initialize();

    const resolved = manager.resolveRuleSet({ agentType: 'codex', supportsStructuredContext: false });
    expect(resolved.profile.name).toBe('Frontend Standard');
    expect(resolved.teamRules?.map(rule => rule.name)).toContain('secure-defaults.md');
    expect(resolved.activeRules.map(rule => rule.name)).toContain('secure-defaults.md');
    expect(resolved.policyVersion).toEqual({
      packId: 'acme-engineering',
      declaredVersion: '1.4.2',
      resolvedVersion: '1.4.2',
    });
    expect(resolved.binding?.source).toBe('workspace');
  });

  it('parses rule frontmatter into effective policy preferences and guardrails', async () => {
    await fs.promises.writeFile(path.join(workspaceDir, 'AGENTS.md'), `---
title: Workspace Guardrail
kind: guardrail
category: tooling
required: true
canonicalKey: workspace:shell-compatibility
---
Ensure terminal commands are compatible with the current shell.
`, 'utf8');

    await fs.promises.mkdir(path.join(globalDir, 'global-rules'), { recursive: true });
    const globalRulePath = path.join(globalDir, 'global-rules', 'response-style.md');
    await fs.promises.writeFile(globalRulePath, `---
title: Concise Responses
kind: preference
preferenceKey: responseStyle
preferenceValue: concise
priority: 150
---
Provide concise and direct solutions.
`, 'utf8');
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

    await manager.initialize();

    const policy = manager.resolvePolicy({ agentType: 'codex', supportsStructuredContext: false });
    expect(policy.guardrails.map((guardrail) => guardrail.text)).toContain('Ensure terminal commands are compatible with the current shell.');
    expect(policy.preferences).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: 'responseStyle',
        value: 'concise',
      }),
    ]));
    expect(policy.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({
        title: 'Workspace Guardrail',
        kind: 'guardrail',
        category: 'tooling',
      }),
      expect.objectContaining({
        title: 'Concise Responses',
        kind: 'preference',
      }),
      ]));
  });

  it('loads workspace rules from every workspace folder', async () => {
    const secondWorkspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-workspace-'));
    await fs.promises.writeFile(path.join(workspaceDir, 'AGENTS.md'), '# workspace one', 'utf8');
    await fs.promises.writeFile(path.join(secondWorkspaceDir, '.cursorrules'), '# workspace two', 'utf8');
    mockState.workspaceFolders = [
      { uri: { fsPath: workspaceDir } },
      { uri: { fsPath: secondWorkspaceDir } },
    ];

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

    await manager.initialize();

    const workspaceRules = manager.getWorkspaceRules().map((rule) => rule.name);
    expect(workspaceRules).toEqual(expect.arrayContaining(['AGENTS.md', '.cursorrules']));

    await fs.promises.rm(secondWorkspaceDir, { recursive: true, force: true });
  });
});
