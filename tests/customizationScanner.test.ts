import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderAuditReport, scanCustomizations } from '../src/application/customizationScanner';

const tempRoots: string[] = [];

describe('customizationScanner', () => {
  afterEach(async () => {
    for (const root of tempRoots.splice(0)) {
      await fs.promises.rm(root, { recursive: true, force: true });
    }
  });

  it('finds known customization files and reports legacy duplication', async () => {
    const root = await createTempRoot();
    await write(root, 'AGENTS.md', '# Rules');
    await write(root, '.cursorrules', 'Use TypeScript.');
    await write(root, '.cursor/rules/project.mdc', [
      '---',
      'description: Project',
      'alwaysApply: true',
      '---',
      '',
      'Use TypeScript.',
    ].join('\n'));

    const audit = await scanCustomizations(root);

    expect(audit.files.map((file) => file.relativePath)).toContain('.cursor/rules/project.mdc');
    expect(audit.diagnostics.some((diagnostic) => diagnostic.message.includes('legacy'))).toBe(true);
    expect(renderAuditReport(audit)).toContain('AI Customizations Audit');
  });

  it('reports missing AGENTS.md and invalid frontmatter', async () => {
    const root = await createTempRoot();
    await write(root, '.github/prompts/broken.prompt.md', [
      '---',
      'description: [',
      '---',
      '',
      'Broken prompt.',
    ].join('\n'));

    const audit = await scanCustomizations(root);

    expect(audit.diagnostics.some((diagnostic) => diagnostic.message.includes('No AGENTS.md'))).toBe(true);
    expect(audit.diagnostics.some((diagnostic) => diagnostic.message.includes('Invalid YAML frontmatter'))).toBe(true);
  });
});

async function createTempRoot(): Promise<string> {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'pbp-'));
  tempRoots.push(root);
  return root;
}

async function write(root: string, relativePath: string, content: string): Promise<void> {
  const targetPath = path.join(root, relativePath);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, content, 'utf8');
}
