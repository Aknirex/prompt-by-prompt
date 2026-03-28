import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { PromptTemplate } from '../../types/prompt';
import { PromptRepository } from './PromptRepository';

const LEGACY_KEY = 'pbp.globalPrompts';

export interface LegacyStateReader {
  getGlobal<T>(key: string): T | undefined;
  setGlobal<T>(key: string, value: T): Promise<void>;
  globalStoragePath: string;
}

export async function migrateIfNeeded(
  stateReader: LegacyStateReader,
  repo: PromptRepository
): Promise<number> {
  const legacy = stateReader.getGlobal<Record<string, PromptTemplate>>(LEGACY_KEY);
  if (!legacy || Object.keys(legacy).length === 0) return 0;

  let migrated = 0;
  for (const prompt of Object.values(legacy)) {
    try {
      await repo.save({ ...prompt, source: 'global', filePath: undefined });
      migrated++;
    } catch {
      // skip individual failures
    }
  }

  // Clear legacy key after migration
  await stateReader.setGlobal(LEGACY_KEY, undefined);
  return migrated;
}
