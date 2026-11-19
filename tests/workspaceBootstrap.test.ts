import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createBootstrapFiles,
  reservePromptFilePath,
  writeBootstrapFiles,
} from '../src/application/workspaceBootstrap';

const tempRoots: string[] = [];

describe('workspaceBootstrap', () => {
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('creates default and optional adapter files', () => {
    const files = createBootstrapFiles('Demo', ['cursor', 'cline', 'windsurf']);
    const paths = files.map((file) => file.relativePath);

    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('.github/prompts/implement-task.prompt.md');
    expect(paths).toContain('.github/agents/implementation.agent.md');
    expect(paths).toContain('.cursor/rules/pbp-project.mdc');
    expect(paths).toContain('.clinerules/01-project.md');
    expect(paths).toContain('.windsurf/rules/pbp-project.md');
  });

  it('skips existing files unless overwrite is requested', async () => {
    const root = await createTempRoot();
    const files = createBootstrapFiles('Demo');
    await fs.promises.writeFile(path.join(root, 'AGENTS.md'), 'existing', 'utf8');

    const first = await writeBootstrapFiles(root, files, 'skip-existing');
    expect(first.skipped).toContain('AGENTS.md');
    expect(await fs.promises.readFile(path.join(root, 'AGENTS.md'), 'utf8')).toBe('existing');

    const second = await writeBootstrapFiles(root, files, 'overwrite-existing');
    expect(second.overwritten).toContain('AGENTS.md');
    expect(await fs.promises.readFile(path.join(root, 'AGENTS.md'), 'utf8')).toContain('Demo AI Operating Guide');
  });

  it('reserves prompt file names without overwriting existing files', async () => {
    const root = await createTempRoot();
    const promptDir = path.join(root, '.github', 'prompts');
    await fs.promises.mkdir(promptDir, { recursive: true });
    await fs.promises.writeFile(path.join(promptDir, 'fix-auth.prompt.md'), 'old', 'utf8');

    const reserved = reservePromptFilePath(root, '.github/prompts', 'Fix Auth');

    expect(path.basename(reserved)).toBe('fix-auth-1.prompt.md');
  });
});

async function createTempRoot(): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-'));
  tempRoots.push(root);
  return root;
}
