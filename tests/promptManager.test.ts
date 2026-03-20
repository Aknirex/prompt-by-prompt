import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => {
  const globalStateStore = new Map<string, unknown>();

  return {
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
    globalStateStore,
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
    public dispose(): void {
      this.listeners = [];
    }
  }

  return {
    workspace: {
      get workspaceFolders() {
        return mockState.workspaceFolders;
      },
    },
    EventEmitter,
  };
});

describe('PromptManager', () => {
  let workspaceDir: string;
  let extensionDir: string;
  let globalDir: string;

  const config = {
    promptsDir: '.prompts',
  };

  beforeEach(async () => {
    workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-prompt-workspace-'));
    extensionDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-prompt-extension-'));
    globalDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-prompt-global-'));
    mockState.workspaceFolders = [{ uri: { fsPath: workspaceDir } }];
    mockState.globalStateStore.clear();
  });

  afterEach(async () => {
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
    await fs.promises.rm(extensionDir, { recursive: true, force: true });
    await fs.promises.rm(globalDir, { recursive: true, force: true });
  });

  function createContext() {
    return {
      extensionPath: extensionDir,
      globalStorageUri: { fsPath: globalDir },
      globalState: {
        get: (key: string, defaultValue?: unknown) =>
          mockState.globalStateStore.has(key) ? mockState.globalStateStore.get(key) : defaultValue,
        update: async (key: string, value: unknown) => {
          mockState.globalStateStore.set(key, value);
        },
      },
    };
  }

  it('migrates legacy global prompts from globalState into global storage files', async () => {
    mockState.globalStateStore.set('pbp.globalPrompts', [
      {
        id: 'legacy-global',
        name: 'Legacy Global Prompt',
        description: 'from global state',
        category: 'General',
        tags: ['legacy'],
        version: '1.0.0',
        template: 'Legacy body',
      },
    ]);

    const { PromptManager } = await import('../src/services/promptManager');
    const manager = new PromptManager(createContext() as never, config as never);

    await manager.initialize();

    const prompts = manager.getAllPrompts().filter((prompt) => prompt.source === 'global');
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.name).toBe('Legacy Global Prompt');
    expect(prompts[0]?.filePath).toBeTruthy();

    const globalPromptFiles = await fs.promises.readdir(path.join(globalDir, 'prompts'));
    expect(globalPromptFiles).toContain('legacy-global-prompt.yaml');
    expect(mockState.globalStateStore.get('pbp.globalPrompts')).toEqual([]);
  });

  it('keeps workspace prompt storage consistent when prompt names change', async () => {
    const { PromptManager } = await import('../src/services/promptManager');
    const manager = new PromptManager(createContext() as never, config as never);

    const created = await manager.createPrompt(
      {
        name: 'Original Name',
        description: 'workspace prompt',
        category: 'General',
        template: 'hello',
        tags: [],
      },
      'workspace'
    );

    const originalPath = created.filePath;
    expect(originalPath).toBeTruthy();
    expect(fs.existsSync(originalPath!)).toBe(true);

    const updated = await manager.updatePrompt(created.id, {
      name: 'Renamed Prompt',
    });

    expect(updated?.filePath).toBeTruthy();
    expect(updated?.filePath).not.toBe(originalPath);
    expect(fs.existsSync(updated!.filePath!)).toBe(true);
    expect(fs.existsSync(originalPath!)).toBe(false);
  });

  it('stores global prompts as files and removes stale files on rename', async () => {
    const { PromptManager } = await import('../src/services/promptManager');
    const manager = new PromptManager(createContext() as never, config as never);

    const created = await manager.createPrompt(
      {
        name: 'Global Prompt',
        description: 'global prompt',
        category: 'General',
        template: 'body',
        tags: [],
      },
      'global'
    );

    const originalPath = created.filePath;
    expect(originalPath).toBeTruthy();
    expect(fs.existsSync(originalPath!)).toBe(true);
    expect(mockState.globalStateStore.get('pbp.globalPrompts')).toBeUndefined();

    const updated = await manager.updatePrompt(created.id, {
      name: 'Global Prompt Renamed',
    });

    expect(updated?.filePath).toBeTruthy();
    expect(updated?.filePath).not.toBe(originalPath);
    expect(fs.existsSync(updated!.filePath!)).toBe(true);
    expect(fs.existsSync(originalPath!)).toBe(false);
  });

  it('deletes workspace prompt files when prompts are removed', async () => {
    const { PromptManager } = await import('../src/services/promptManager');
    const manager = new PromptManager(createContext() as never, config as never);

    const created = await manager.createPrompt(
      {
        name: 'Delete Me',
        description: 'workspace prompt',
        category: 'General',
        template: 'temporary',
        tags: [],
      },
      'workspace'
    );

    expect(fs.existsSync(created.filePath!)).toBe(true);

    const deleted = await manager.deletePrompt(created.id);

    expect(deleted).toBe(true);
    expect(fs.existsSync(created.filePath!)).toBe(false);
    expect(manager.getPrompt(created.id)).toBeUndefined();
  });

  it('reloads file-backed global prompts without depending on legacy globalState bodies', async () => {
    const { PromptManager } = await import('../src/services/promptManager');
    const manager = new PromptManager(createContext() as never, config as never);

    await manager.createPrompt(
      {
        id: 'global-file-prompt',
        name: 'File Backed Global Prompt',
        description: 'stored as file',
        category: 'General',
        template: 'body from file',
        tags: [],
      },
      'global'
    );

    mockState.globalStateStore.set('pbp.globalPrompts', []);

    await manager.refresh();

    const reloaded = manager.getPrompt('global-file-prompt');
    expect(reloaded).toBeDefined();
    expect(reloaded?.source).toBe('global');
    expect(reloaded?.template).toBe('body from file');
    expect(reloaded?.filePath).toContain(path.join(globalDir, 'prompts'));
  });
});
