import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  configValues: {} as Record<string, unknown>,
  globalStateStore: new Map<string, unknown>(),
}));

vi.mock('vscode', async () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: (key: string, fallback?: unknown) =>
        mockState.configValues[key.replace('pbp.', '')] ?? fallback,
    })),
  },
}));

function runGit(args: string[], cwd: string): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=PromptByPrompt', '-c', 'user.email=pbp@example.com', ...args],
    { cwd, encoding: 'utf8' }
  ).trim();
}

describe('TeamPolicyService', () => {
  let sourceRepoDir: string;
  let globalDir: string;

  beforeEach(async () => {
    sourceRepoDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-policy-git-source-'));
    globalDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-policy-git-global-'));
    mockState.configValues = {};
    mockState.globalStateStore.clear();

    runGit(['init', '-b', 'main'], sourceRepoDir);
    await fs.promises.mkdir(path.join(sourceRepoDir, 'rules'), { recursive: true });
    await fs.promises.mkdir(path.join(sourceRepoDir, 'profiles'), { recursive: true });
    await fs.promises.writeFile(path.join(sourceRepoDir, 'pack.json'), JSON.stringify({
      id: 'acme-engineering',
      name: 'Acme Engineering Policy Pack',
      version: '1.4.2',
    }), 'utf8');
    await fs.promises.writeFile(path.join(sourceRepoDir, 'rules', 'secure-defaults.md'), '# secure defaults', 'utf8');
    await fs.promises.writeFile(path.join(sourceRepoDir, 'profiles', 'frontend-standard.json'), JSON.stringify({
      id: 'frontend-standard',
      name: 'Frontend Standard',
      enabledRuleIds: ['secure-defaults'],
    }), 'utf8');
    runGit(['add', '.'], sourceRepoDir);
    runGit(['commit', '-m', 'initial pack'], sourceRepoDir);
  });

  afterEach(async () => {
    await fs.promises.rm(sourceRepoDir, { recursive: true, force: true });
    await fs.promises.rm(globalDir, { recursive: true, force: true });
  });

  it('clones git team policy sources into global shared cache and resolves commit sha', async () => {
    mockState.configValues = {
      teamPolicySources: [{
        id: 'acme-git',
        type: 'git',
        url: sourceRepoDir,
        trust: 'trusted',
      }],
    };

    const { TeamPolicyService } = await import('../src/services/teamPolicyService');
    const service = new TeamPolicyService({
      globalStorageUri: { fsPath: globalDir },
      globalState: {
        get: (key: string, defaultValue?: unknown) =>
          mockState.globalStateStore.has(key) ? mockState.globalStateStore.get(key) : defaultValue,
        update: async (key: string, value: unknown) => {
          mockState.globalStateStore.set(key, value);
        },
      },
    } as never);

    const packs = await service.refresh();
    expect(packs).toHaveLength(1);
    expect(packs[0]?.id).toBe('acme-engineering');
    expect(packs[0]?.resolvedVersion).toMatch(/^[0-9a-f]{40}$/);
    expect(packs[0]?.sourcePath).toContain(path.join(globalDir, 'team-policy-sources', 'acme-git'));
    expect(fs.existsSync(path.join(globalDir, 'team-policy-sources', 'acme-git', 'pack.json'))).toBe(true);
  });

  it('pulls updated commits for git team policy sources on refresh', async () => {
    mockState.configValues = {
      teamPolicySources: [{
        id: 'acme-git',
        type: 'git',
        url: sourceRepoDir,
        trust: 'trusted',
      }],
    };

    const { TeamPolicyService } = await import('../src/services/teamPolicyService');
    const service = new TeamPolicyService({
      globalStorageUri: { fsPath: globalDir },
      globalState: {
        get: (key: string, defaultValue?: unknown) =>
          mockState.globalStateStore.has(key) ? mockState.globalStateStore.get(key) : defaultValue,
        update: async (key: string, value: unknown) => {
          mockState.globalStateStore.set(key, value);
        },
      },
    } as never);

    const initialPacks = await service.refresh();
    const initialResolvedVersion = initialPacks[0]?.resolvedVersion;

    await fs.promises.writeFile(path.join(sourceRepoDir, 'pack.json'), JSON.stringify({
      id: 'acme-engineering',
      name: 'Acme Engineering Policy Pack',
      version: '1.4.3',
    }), 'utf8');
    runGit(['add', '.'], sourceRepoDir);
    runGit(['commit', '-m', 'bump pack version'], sourceRepoDir);

    const refreshedPacks = await service.refresh();
    expect(refreshedPacks[0]?.version).toBe('1.4.3');
    expect(refreshedPacks[0]?.resolvedVersion).toMatch(/^[0-9a-f]{40}$/);
    expect(refreshedPacks[0]?.resolvedVersion).not.toBe(initialResolvedVersion);
  });
});
