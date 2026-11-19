import * as fs from 'fs';
import * as path from 'path';
import {
  renderClineRule,
  renderCursorRule,
  renderProjectAgentsMd,
  renderStarterAgent,
  renderStarterPrompt,
  renderWindsurfRule,
} from '../domain/taskPackRenderer';
import { slugify } from '../utils/text';

export type AdapterTarget = 'cursor' | 'cline' | 'windsurf';
export type BootstrapWritePolicy = 'skip-existing' | 'overwrite-existing';

export interface BootstrapFile {
  relativePath: string;
  content: string;
  description: string;
  optional: boolean;
}

export interface BootstrapWriteResult {
  created: string[];
  overwritten: string[];
  skipped: string[];
}

export function createBootstrapFiles(projectName: string, adapters: AdapterTarget[] = []): BootstrapFile[] {
  const files: BootstrapFile[] = [
    {
      relativePath: 'AGENTS.md',
      content: renderProjectAgentsMd(projectName),
      description: 'Cross-agent repository operating guide',
      optional: false,
    },
    {
      relativePath: '.github/prompts/implement-task.prompt.md',
      content: renderStarterPrompt(
        'Implement Task',
        'Turn a scoped task pack into implementation work',
        [
          'Use the attached task pack as the source of truth.',
          '',
          '- Inspect the referenced files before editing.',
          '- Implement the goal end to end.',
          '- Keep changes scoped to the acceptance criteria.',
          '- Run the listed verification commands when possible.',
        ].join('\n')
      ),
      description: 'Reusable implementation prompt file',
      optional: false,
    },
    {
      relativePath: '.github/prompts/review-task.prompt.md',
      content: renderStarterPrompt(
        'Review Task',
        'Review a change or selected files with concrete findings',
        [
          'Review the supplied context for correctness, regressions, missing tests, and maintainability.',
          '',
          'Lead with prioritized findings. Include file paths or concrete behavior references. Keep summaries short.',
        ].join('\n')
      ),
      description: 'Reusable code review prompt file',
      optional: false,
    },
    {
      relativePath: '.github/agents/implementation.agent.md',
      content: renderStarterAgent(
        'implementation',
        'Focused implementation agent for scoped task packs',
        [
          'You are a focused implementation agent.',
          '',
          '- Start by identifying the files and tests relevant to the task.',
          '- Make the smallest coherent change that satisfies the task pack.',
          '- Preserve existing style and public contracts.',
          '- Verify with the task pack commands or explain why verification was blocked.',
        ].join('\n')
      ),
      description: 'Workspace custom implementation agent',
      optional: false,
    },
    {
      relativePath: '.github/agents/reviewer.agent.md',
      content: renderStarterAgent(
        'reviewer',
        'Review agent for correctness, regressions, and missing tests',
        [
          'You are a code reviewer.',
          '',
          '- Prioritize concrete bugs and behavioral regressions.',
          '- Include severity and evidence for each finding.',
          '- Call out missing tests and residual risk.',
          '- Avoid broad style commentary unless it hides a real defect.',
        ].join('\n')
      ),
      description: 'Workspace custom review agent',
      optional: false,
    },
  ];

  if (adapters.includes('cursor')) {
    files.push({
      relativePath: '.cursor/rules/pbp-project.mdc',
      content: renderCursorRule(projectName),
      description: 'Cursor project rule adapter',
      optional: true,
    });
  }

  if (adapters.includes('cline')) {
    files.push({
      relativePath: '.clinerules/01-project.md',
      content: renderClineRule(projectName),
      description: 'Cline project rule adapter',
      optional: true,
    });
  }

  if (adapters.includes('windsurf')) {
    files.push({
      relativePath: '.windsurf/rules/pbp-project.md',
      content: renderWindsurfRule(projectName),
      description: 'Windsurf workspace rule adapter',
      optional: true,
    });
  }

  return files;
}

export function renderBootstrapPreview(files: BootstrapFile[], rootPath: string): string {
  const lines = [
    '# Prompt by Prompt Workspace Bootstrap Preview',
    '',
    `Workspace: ${rootPath}`,
    '',
    'The following files will be created or updated only after confirmation.',
    '',
  ];

  for (const file of files) {
    lines.push(`## ${file.relativePath}`, '', `${file.description}${file.optional ? ' (optional adapter)' : ''}`, '');
  }

  return lines.join('\n');
}

export async function writeBootstrapFiles(
  rootPath: string,
  files: BootstrapFile[],
  policy: BootstrapWritePolicy
): Promise<BootstrapWriteResult> {
  const result: BootstrapWriteResult = {
    created: [],
    overwritten: [],
    skipped: [],
  };

  for (const file of files) {
    const targetPath = path.join(rootPath, file.relativePath);
    const exists = fs.existsSync(targetPath);

    if (exists && policy === 'skip-existing') {
      result.skipped.push(file.relativePath);
      continue;
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.promises.writeFile(targetPath, file.content, 'utf8');
    if (exists) {
      result.overwritten.push(file.relativePath);
    } else {
      result.created.push(file.relativePath);
    }
  }

  return result;
}

export function reservePromptFilePath(rootPath: string, promptFilesPath: string, title: string): string {
  const promptDir = path.join(rootPath, promptFilesPath);
  const baseName = slugify(title);
  let suffix = 0;

  while (true) {
    const fileName = suffix === 0 ? `${baseName}.prompt.md` : `${baseName}-${suffix}.prompt.md`;
    const filePath = path.join(promptDir, fileName);
    if (!fs.existsSync(filePath)) {
      return filePath;
    }
    suffix += 1;
  }
}
