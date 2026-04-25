import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FilePromptRepository } from '../src/infrastructure/files/filePromptRepository';

describe('FilePromptRepository', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-file-prompt-repo-'));
  });

  afterEach(async () => {
    await fs.promises.rm(rootDir, { recursive: true, force: true });
  });

  it('loads prompt yaml files recursively with stable file storage refs', async () => {
    await fs.promises.mkdir(path.join(rootDir, 'nested'), { recursive: true });
    await fs.promises.writeFile(path.join(rootDir, 'review.yaml'), [
      'id: review',
      'name: Review',
      'template: Review {{selection}}.',
    ].join('\n'), 'utf8');
    await fs.promises.writeFile(path.join(rootDir, 'nested', 'test.yml'), [
      'id: test',
      'name: Test',
      'template: Test {{file_content}}.',
    ].join('\n'), 'utf8');
    await fs.promises.writeFile(path.join(rootDir, 'ignore.txt'), 'nope', 'utf8');

    const repository = new FilePromptRepository({
      id: 'workspace',
      label: 'Workspace',
      rootDir,
      source: { kind: 'workspace', workspaceFolder: rootDir },
    });

    const items = await repository.list();

    expect(items.map((item) => item.prompt.id)).toEqual(['test', 'review']);
    expect(items.find((item) => item.prompt.id === 'review')?.storage).toEqual({
      kind: 'file',
      path: path.join(rootDir, 'review.yaml'),
      workspaceFolder: rootDir,
    });
  });

  it('uses the file name as fallback id for legacy prompt files without ids', async () => {
    await fs.promises.writeFile(path.join(rootDir, 'explain.yaml'), [
      'name: Explain',
      'template: Explain {{selection}}.',
    ].join('\n'), 'utf8');

    const repository = new FilePromptRepository({
      id: 'personal',
      label: 'Personal',
      rootDir,
      source: { kind: 'personal' },
    });

    const items = await repository.list();

    expect(items[0]?.prompt.id).toBe('explain');
    expect(items[0]?.readOnly).toBe(false);
  });

  it('returns read-only shared storage refs for shared prompt packs', async () => {
    await fs.promises.writeFile(path.join(rootDir, 'team-review.yaml'), [
      'id: team-review',
      'name: Team Review',
      'template: Review with team rules.',
    ].join('\n'), 'utf8');

    const repository = new FilePromptRepository({
      id: 'team',
      label: 'Team',
      rootDir,
      source: { kind: 'shared', libraryId: 'team-pack', libraryVersion: '1.0.0' },
      readOnly: true,
    });

    const items = await repository.list();

    expect(items[0]?.readOnly).toBe(true);
    expect(items[0]?.storage).toEqual({
      kind: 'shared',
      libraryId: 'team-pack',
      sourceFile: 'team-review.yaml',
    });
  });

  it('fails with a useful message when a prompt file is invalid', async () => {
    await fs.promises.writeFile(path.join(rootDir, 'broken.yaml'), [
      'id: broken',
      'name: Broken',
      'template: ""',
    ].join('\n'), 'utf8');

    const repository = new FilePromptRepository({
      id: 'personal',
      label: 'Personal',
      rootDir,
      source: { kind: 'personal' },
    });

    await expect(repository.list()).rejects.toThrow(/Invalid prompt file .*broken\.yaml.*Prompt body is required/);
  });
});

