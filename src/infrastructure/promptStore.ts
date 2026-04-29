import * as fs from 'fs';
import * as path from 'path';
import { decodePromptYaml, encodePromptYaml } from '../domain/promptCodec';
import { PromptDefinition, PromptEntry, PromptMetadataMap, PromptSource } from '../domain/prompt';
import { slugify } from '../utils/text';

export interface PromptStoreDefinition {
  id: string;
  label: string;
  rootDir: string;
  source: PromptSource;
  readOnly: boolean;
}

export interface PromptStoreDiagnostic {
  storeId: string;
  filePath: string;
  message: string;
}

export interface PromptStoreLoadResult {
  entries: PromptEntry[];
  diagnostics: PromptStoreDiagnostic[];
}

export async function loadPromptStores(
  stores: PromptStoreDefinition[],
  metadata: PromptMetadataMap = {}
): Promise<PromptStoreLoadResult> {
  const entries: PromptEntry[] = [];
  const diagnostics: PromptStoreDiagnostic[] = [];

  for (const store of stores) {
    const files = await findPromptFiles(store.rootDir);
    for (const filePath of files) {
      const fallbackId = path.basename(filePath, path.extname(filePath));
      const content = await fs.promises.readFile(filePath, 'utf8');
      const decoded = decodePromptYaml(content, fallbackId);

      if (!decoded.ok) {
        diagnostics.push({ storeId: store.id, filePath, message: decoded.error });
        continue;
      }

      const promptMetadata = metadata[decoded.prompt.id] ?? {};
      entries.push({
        prompt: decoded.prompt,
        source: store.source,
        filePath,
        readOnly: store.readOnly,
        favorite: promptMetadata.favorite ?? false,
        lastUsedAt: promptMetadata.lastUsedAt,
      });
    }
  }

  return {
    entries: dedupeAndSortEntries(entries),
    diagnostics,
  };
}

export async function savePrompt(rootDir: string, prompt: PromptDefinition): Promise<string> {
  await fs.promises.mkdir(rootDir, { recursive: true });
  const filePath = await reservePromptFilePath(rootDir, prompt.title);
  await fs.promises.writeFile(filePath, encodePromptYaml(prompt), 'utf8');
  return filePath;
}

export async function updatePromptFile(filePath: string, prompt: PromptDefinition): Promise<void> {
  await fs.promises.writeFile(filePath, encodePromptYaml({
    ...prompt,
    updatedAt: new Date().toISOString(),
  }), 'utf8');
}

export async function deletePromptFile(filePath: string): Promise<void> {
  await fs.promises.unlink(filePath);
}

export async function findPromptFiles(rootDir: string): Promise<string[]> {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const result: string[] = [];
  await visit(rootDir, result);
  return result.sort((left, right) => left.localeCompare(right));
}

function dedupeAndSortEntries(entries: PromptEntry[]): PromptEntry[] {
  const winners = new Map<string, PromptEntry>();
  for (const entry of [...entries].sort((left, right) => sourceRank(left.source) - sourceRank(right.source))) {
    winners.set(entry.prompt.id, entry);
  }

  return Array.from(winners.values()).sort(comparePromptEntries);
}

function comparePromptEntries(left: PromptEntry, right: PromptEntry): number {
  if (left.favorite !== right.favorite) {
    return left.favorite ? -1 : 1;
  }

  const categoryCompare = left.prompt.category.localeCompare(right.prompt.category);
  if (categoryCompare !== 0) {
    return categoryCompare;
  }

  return left.prompt.title.localeCompare(right.prompt.title);
}

function sourceRank(source: PromptSource): number {
  switch (source) {
    case 'builtin':
      return 0;
    case 'user':
      return 1;
    case 'workspace':
      return 2;
  }
}

async function visit(rootDir: string, result: string[]): Promise<void> {
  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      await visit(entryPath, result);
      continue;
    }

    if (isPromptFile(entry.name)) {
      result.push(entryPath);
    }
  }
}

function isPromptFile(fileName: string): boolean {
  return fileName.endsWith('.prompt.yaml')
    || fileName.endsWith('.prompt.yml')
    || fileName.endsWith('.yaml')
    || fileName.endsWith('.yml');
}

async function reservePromptFilePath(rootDir: string, title: string): Promise<string> {
  const baseName = slugify(title);
  let suffix = 0;

  while (true) {
    const fileName = suffix === 0 ? `${baseName}.prompt.yaml` : `${baseName}-${suffix}.prompt.yaml`;
    const filePath = path.join(rootDir, fileName);
    if (!fs.existsSync(filePath)) {
      return filePath;
    }
    suffix += 1;
  }
}

