import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { PROMPT_SCHEMA_VERSION, PromptDefinition } from '../src/domain/prompt';
import { loadPromptStores, savePrompt } from '../src/infrastructure/promptStore';

const tempRoots: string[] = [];

describe('promptStore', () => {
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('saves and loads prompt files', async () => {
    const root = await createTempRoot();
    const prompt = createPrompt('first', 'First Prompt');
    const filePath = await savePrompt(root, prompt);

    const result = await loadPromptStores([{
      id: 'workspace',
      label: 'Workspace',
      rootDir: root,
      source: 'workspace',
      readOnly: false,
    }]);

    expect(path.basename(filePath)).toBe('first-prompt.prompt.yaml');
    expect(result.diagnostics).toEqual([]);
    expect(result.entries[0].prompt.title).toBe('First Prompt');
  });

  it('lets workspace prompts override user prompts with the same id', async () => {
    const userRoot = await createTempRoot();
    const workspaceRoot = await createTempRoot();

    await savePrompt(userRoot, createPrompt('same', 'User Prompt'));
    await savePrompt(workspaceRoot, createPrompt('same', 'Workspace Prompt'));

    const result = await loadPromptStores([
      { id: 'user', label: 'User', rootDir: userRoot, source: 'user', readOnly: false },
      { id: 'workspace', label: 'Workspace', rootDir: workspaceRoot, source: 'workspace', readOnly: false },
    ]);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].prompt.title).toBe('Workspace Prompt');
  });

  it('adds metadata to loaded entries', async () => {
    const root = await createTempRoot();
    await savePrompt(root, createPrompt('fav', 'Favorite Prompt'));

    const result = await loadPromptStores([{
      id: 'user',
      label: 'User',
      rootDir: root,
      source: 'user',
      readOnly: false,
    }], {
      fav: { favorite: true, lastUsedAt: '2026-04-29T00:00:00.000Z' },
    });

    expect(result.entries[0]).toMatchObject({
      favorite: true,
      lastUsedAt: '2026-04-29T00:00:00.000Z',
    });
  });
});

async function createTempRoot(): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-'));
  tempRoots.push(root);
  return root;
}

function createPrompt(id: string, title: string): PromptDefinition {
  return {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    id,
    title,
    description: '',
    category: 'General',
    tags: [],
    body: `Body for ${title}`,
    variables: [],
  };
}

