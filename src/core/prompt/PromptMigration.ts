import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { PromptTemplate } from '../../types/prompt';
import { PromptRepository } from './PromptRepository';

const LEGACY_KEY = 'pbp.globalPrompts';
const BUILTINS_SEEDED_KEY = 'pbp.builtinsSeeded';

export interface LegacyStateReader {
  getGlobal<T>(key: string): T | undefined;
  setGlobal(key: string, value: unknown): Promise<void>;
  globalStoragePath: string;
}

export async function migrateIfNeeded(
  stateReader: LegacyStateReader,
  repo: PromptRepository,
  extensionPath?: string
): Promise<number> {
  let migrated = 0;

  // Seed builtins on first run
  if (extensionPath && !stateReader.getGlobal<boolean>(BUILTINS_SEEDED_KEY)) {
    await seedBuiltins(repo, extensionPath);
    await stateReader.setGlobal(BUILTINS_SEEDED_KEY, true);
  }

  // Migrate legacy globalState prompts
  const legacy = stateReader.getGlobal<Record<string, PromptTemplate>>(LEGACY_KEY);
  if (legacy && Object.keys(legacy).length > 0) {
    for (const prompt of Object.values(legacy)) {
      try {
        await repo.save({ ...prompt, source: 'global', filePath: undefined });
        migrated++;
      } catch {
        // skip individual failures
      }
    }
    await stateReader.setGlobal(LEGACY_KEY, undefined);
  }

  return migrated;
}

async function seedBuiltins(repo: PromptRepository, extensionPath: string): Promise<void> {
  const builtinsDir = path.join(extensionPath, 'builtins', 'templates');
  if (!fs.existsSync(builtinsDir)) return;

  const files = fs.readdirSync(builtinsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
  for (const file of files) {
    const filePath = path.join(builtinsDir, file);
    try {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const parsed = yaml.load(content) as Partial<PromptTemplate>;
      if (!parsed || !parsed.name) continue;
      const prompt: PromptTemplate = {
        id: parsed.id || uuidv4(),
        name: parsed.name,
        description: parsed.description ?? '',
        category: parsed.category ?? 'General',
        tags: parsed.tags ?? [],
        version: parsed.version ?? '1.0.0',
        template: parsed.template ?? '',
        variables: parsed.variables,
        source: 'global',
        readOnly: false,
      };
      await repo.save(prompt);
    } catch {
      // skip individual failures
    }
  }
}
