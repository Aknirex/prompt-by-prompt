import * as fs from 'fs';
import * as path from 'path';
import { PromptLibraryItem, PromptSource, PromptStorageRef } from '../../domain/prompt';
import { PromptRepository } from '../../application/promptRepository';
import { decodePromptYaml } from './promptFileCodec';

export interface FilePromptRepositoryOptions {
  id: string;
  label: string;
  rootDir: string;
  source: PromptSource;
  readOnly?: boolean;
  recursive?: boolean;
}

export class FilePromptRepository implements PromptRepository {
  readonly id: string;
  readonly label: string;

  private readonly rootDir: string;
  private readonly source: PromptSource;
  private readonly readOnly: boolean;
  private readonly recursive: boolean;

  constructor(options: FilePromptRepositoryOptions) {
    this.id = options.id;
    this.label = options.label;
    this.rootDir = options.rootDir;
    this.source = options.source;
    this.readOnly = options.readOnly ?? false;
    this.recursive = options.recursive ?? true;
  }

  async list(): Promise<PromptLibraryItem[]> {
    if (!fs.existsSync(this.rootDir)) {
      return [];
    }

    const files = await this.findPromptFiles(this.rootDir);
    const items: PromptLibraryItem[] = [];

    for (const filePath of files) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const decoded = decodePromptYaml(content, {
        fallbackId: path.basename(filePath, path.extname(filePath)),
      });

      if (!decoded.ok) {
        throw new Error(`Invalid prompt file ${filePath}: ${decoded.issues.map((issue) => issue.message).join('; ')}`);
      }

      items.push({
        prompt: decoded.prompt,
        source: this.source,
        readOnly: this.readOnly,
        storage: this.toStorageRef(filePath),
      });
    }

    return items;
  }

  private async findPromptFiles(dir: string): Promise<string[]> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && this.recursive) {
        files.push(...await this.findPromptFiles(fullPath));
        continue;
      }

      if (entry.isFile() && isPromptFile(entry.name)) {
        files.push(fullPath);
      }
    }

    return files.sort((left, right) => left.localeCompare(right));
  }

  private toStorageRef(filePath: string): PromptStorageRef {
    if (this.source.kind === 'builtin') {
      return {
        kind: 'builtin',
        path: filePath,
      };
    }

    if (this.source.kind === 'shared') {
      return {
        kind: 'shared',
        libraryId: this.source.libraryId,
        sourceFile: path.relative(this.rootDir, filePath),
      };
    }

    return {
      kind: 'file',
      path: filePath,
      workspaceFolder: this.source.kind === 'workspace' ? this.source.workspaceFolder : undefined,
    };
  }
}

function isPromptFile(fileName: string): boolean {
  return fileName.endsWith('.yaml') || fileName.endsWith('.yml');
}

