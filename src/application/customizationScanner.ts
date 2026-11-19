import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

export type AuditSeverity = 'info' | 'warning' | 'error';

export interface CustomizationFile {
  relativePath: string;
  kind: string;
  charCount: number;
}

export interface AuditDiagnostic {
  severity: AuditSeverity;
  message: string;
  relativePath?: string;
}

export interface CustomizationAudit {
  rootPath: string;
  files: CustomizationFile[];
  diagnostics: AuditDiagnostic[];
}

export async function scanCustomizations(rootPath: string): Promise<CustomizationAudit> {
  const files: CustomizationFile[] = [];
  const diagnostics: AuditDiagnostic[] = [];

  await collectKnownFiles(rootPath, files, diagnostics);
  addInventoryDiagnostics(files, diagnostics);

  return {
    rootPath,
    files: files.sort((left, right) => left.relativePath.localeCompare(right.relativePath)),
    diagnostics,
  };
}

export function renderAuditReport(audit: CustomizationAudit): string {
  const lines = [
    '# AI Customizations Audit',
    '',
    `Workspace: ${audit.rootPath}`,
    '',
    '## Diagnostics',
    '',
  ];

  if (audit.diagnostics.length === 0) {
    lines.push('- No issues found.', '');
  } else {
    for (const diagnostic of audit.diagnostics) {
      const location = diagnostic.relativePath ? ` (${diagnostic.relativePath})` : '';
      lines.push(`- ${diagnostic.severity.toUpperCase()}: ${diagnostic.message}${location}`);
    }
    lines.push('');
  }

  lines.push('## Discovered Files', '');
  if (audit.files.length === 0) {
    lines.push('- No AI customization files found.', '');
  } else {
    for (const file of audit.files) {
      lines.push(`- ${file.relativePath} - ${file.kind}, ${file.charCount} chars`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function collectKnownFiles(
  rootPath: string,
  files: CustomizationFile[],
  diagnostics: AuditDiagnostic[]
): Promise<void> {
  const directFiles: Array<[string, string]> = [
    ['AGENTS.md', 'cross-agent instructions'],
    ['AGENT.md', 'legacy cross-agent instructions'],
    ['.github/copilot-instructions.md', 'Copilot instructions'],
    ['.cursorrules', 'legacy Cursor rules'],
    ['.windsurfrules', 'legacy Windsurf rules'],
    ['.roorules', 'legacy Roo rules'],
  ];

  for (const [relativePath, kind] of directFiles) {
    await addFileIfExists(rootPath, relativePath, kind, files, diagnostics);
  }

  await addDirectoryFiles(rootPath, '.github/prompts', '.prompt.md', 'VS Code prompt file', files, diagnostics);
  await addDirectoryFiles(rootPath, '.github/agents', '.agent.md', 'VS Code custom agent', files, diagnostics);
  await addDirectoryFiles(rootPath, '.github/instructions', '.instructions.md', 'VS Code instructions file', files, diagnostics);
  await addDirectoryFiles(rootPath, '.cursor/rules', '.mdc', 'Cursor project rule', files, diagnostics);
  await addDirectoryFiles(rootPath, '.clinerules', '.md', 'Cline rule', files, diagnostics);
  await addDirectoryFiles(rootPath, '.clinerules', '.txt', 'Cline rule', files, diagnostics);
  await addDirectoryFiles(rootPath, '.windsurf/rules', '.md', 'Windsurf workspace rule', files, diagnostics);
  await addDirectoryFiles(rootPath, '.roo/rules', '.md', 'Roo rule', files, diagnostics);
}

async function addFileIfExists(
  rootPath: string,
  relativePath: string,
  kind: string,
  files: CustomizationFile[],
  diagnostics: AuditDiagnostic[]
): Promise<void> {
  const absolutePath = path.join(rootPath, relativePath);
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    return;
  }

  const content = await fs.promises.readFile(absolutePath, 'utf8');
  files.push({ relativePath: normalizePath(relativePath), kind, charCount: content.length });
  inspectFile(relativePath, kind, content, diagnostics);
}

async function addDirectoryFiles(
  rootPath: string,
  relativeDir: string,
  extension: string,
  kind: string,
  files: CustomizationFile[],
  diagnostics: AuditDiagnostic[]
): Promise<void> {
  const absoluteDir = path.join(rootPath, relativeDir);
  if (!fs.existsSync(absoluteDir) || !fs.statSync(absoluteDir).isDirectory()) {
    return;
  }

  const absoluteFiles = await walk(absoluteDir);
  for (const absolutePath of absoluteFiles.filter((filePath) => filePath.endsWith(extension))) {
    const relativePath = normalizePath(path.relative(rootPath, absolutePath));
    const content = await fs.promises.readFile(absolutePath, 'utf8');
    files.push({ relativePath, kind, charCount: content.length });
    inspectFile(relativePath, kind, content, diagnostics);
  }
}

function inspectFile(
  relativePath: string,
  kind: string,
  content: string,
  diagnostics: AuditDiagnostic[]
): void {
  if (content.length === 0) {
    diagnostics.push({ severity: 'warning', message: 'File is empty and may be ignored.', relativePath });
  }

  if (relativePath === '.cursorrules') {
    diagnostics.push({ severity: 'warning', message: 'Cursor root .cursorrules is legacy; prefer .cursor/rules/*.mdc.', relativePath });
  }

  if (relativePath === '.windsurfrules') {
    diagnostics.push({ severity: 'warning', message: 'Windsurf root .windsurfrules is legacy; prefer .windsurf/rules/*.md.', relativePath });
  }

  if (relativePath.startsWith('.roo/') || relativePath === '.roorules') {
    diagnostics.push({ severity: 'info', message: 'Roo Code customizations are detected but are not bootstrapped by Prompt by Prompt.', relativePath });
  }

  if (relativePath === '.github/copilot-instructions.md' && content.length > 4000) {
    diagnostics.push({
      severity: 'warning',
      message: 'Copilot code review may only use the first 4000 characters of this file.',
      relativePath,
    });
  }

  if ((kind.includes('rule') || kind.includes('instructions')) && content.length > 12000) {
    diagnostics.push({
      severity: 'warning',
      message: 'This rule/instructions file is large enough to dilute agent context. Consider splitting or scoping it.',
      relativePath,
    });
  }

  if (content.trimStart().startsWith('---')) {
    const parsed = parseFrontmatter(content);
    if (!parsed.ok) {
      diagnostics.push({ severity: 'error', message: `Invalid YAML frontmatter: ${parsed.error}`, relativePath });
    }
  }
}

function addInventoryDiagnostics(files: CustomizationFile[], diagnostics: AuditDiagnostic[]): void {
  const paths = new Set(files.map((file) => file.relativePath));
  if (!paths.has('AGENTS.md')) {
    diagnostics.push({ severity: 'warning', message: 'No AGENTS.md found. Add one for cross-agent baseline instructions.' });
  }

  if (!files.some((file) => file.relativePath.startsWith('.github/prompts/'))) {
    diagnostics.push({ severity: 'info', message: 'No VS Code prompt files found under .github/prompts/.' });
  }

  if (paths.has('.cursorrules') && files.some((file) => file.relativePath.startsWith('.cursor/rules/'))) {
    diagnostics.push({
      severity: 'warning',
      message: '.cursorrules and .cursor/rules are both present. Cursor project rules may supersede or duplicate legacy instructions.',
      relativePath: '.cursorrules',
    });
  }

  if (paths.has('AGENTS.md') && paths.has('.github/copilot-instructions.md')) {
    diagnostics.push({
      severity: 'info',
      message: 'Both AGENTS.md and Copilot instructions are present. Keep overlapping always-on guidance short.',
    });
  }
}

function parseFrontmatter(content: string): { ok: true } | { ok: false; error: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) {
    return { ok: false, error: 'Missing closing --- delimiter.' };
  }

  try {
    yaml.load(match[1]);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function walk(rootPath: string): Promise<string[]> {
  const entries = await fs.promises.readdir(rootPath, { withFileTypes: true });
  const result: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      result.push(...await walk(entryPath));
    } else if (entry.isFile()) {
      result.push(entryPath);
    }
  }

  return result;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}
