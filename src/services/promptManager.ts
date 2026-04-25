/**
 * Prompt Manager Service
 *
 * Compatibility facade for the current extension commands and providers.
 * Internally this now loads prompts through the vNext prompt library stack:
 * PromptRepository -> PromptLibraryService -> PromptTemplate adapter.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { PromptLibraryEntry, PromptLibraryService, PromptLibrarySnapshot } from '../application/promptLibraryService';
import { PromptRepository } from '../application/promptRepository';
import {
  PROMPT_SCHEMA_VERSION,
  PromptDefinition,
  PromptLibraryItem,
  PromptMetadata,
  PromptSource,
  PromptVariableDefinition,
} from '../domain/prompt';
import { encodePromptYaml } from '../infrastructure/files/promptFileCodec';
import { FilePromptRepository } from '../infrastructure/files/filePromptRepository';
import { ExtensionConfig, PromptTemplate, PromptVariable } from '../types/prompt';
import { SharedPromptTemplate } from '../types/teamPolicy';
import { TeamPolicyService } from './teamPolicyService';
import { getWorkspaceFolderForUri, getWorkspaceFolders } from '../utils/workspace';

const GLOBAL_STATE_KEY = 'pbp.globalPrompts';
const GLOBAL_PROMPTS_DIR = 'prompts';
const PROMPT_USAGE_METADATA_KEY = 'pbp.promptUsageMetadata';

interface PromptUsageMetadata {
  favorite?: boolean;
  lastUsedAt?: string;
}

type PromptUsageMetadataMap = Record<string, PromptUsageMetadata>;

export class PromptManager {
  private prompts: Map<string, PromptTemplate> = new Map();
  private promptByLibraryEntryKey: Map<string, PromptTemplate> = new Map();
  private librarySnapshot: PromptLibrarySnapshot | undefined;
  private readonly onDidChangePrompts: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  private readonly teamPolicyService: TeamPolicyService;

  public readonly onDidChange = this.onDidChangePrompts.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: ExtensionConfig,
    teamPolicyService?: TeamPolicyService,
    private readonly sharedTeamPolicyCacheOnly = false
  ) {
    this.teamPolicyService = teamPolicyService ?? new TeamPolicyService(context);
  }

  async initialize(): Promise<void> {
    await this.loadAllPrompts();
  }

  private async loadAllPrompts(): Promise<void> {
    await this.migrateLegacyGlobalPrompts();

    if (!this.sharedTeamPolicyCacheOnly) {
      await this.teamPolicyService.refresh();
    }

    const libraryService = new PromptLibraryService(this.createRepositories());
    const snapshot = await libraryService.loadSnapshot();
    const entries = this.applyUsageMetadata(snapshot.entries);
    this.librarySnapshot = {
      ...snapshot,
      entries,
    };
    const entryPairs = entries.map((entry) => [entry.key, this.toPromptTemplate(entry.item)] as const);
    this.promptByLibraryEntryKey = new Map(entryPairs);
    this.prompts = this.createPromptMap(entryPairs.map(([, prompt]) => prompt));

    for (const diagnostic of snapshot.diagnostics) {
      console.warn(`[PromptManager] ${diagnostic.repositoryId}: ${diagnostic.message}`);
    }
  }

  private createRepositories(): PromptRepository[] {
    const repositories: PromptRepository[] = [
      new FilePromptRepository({
        id: 'builtin',
        label: 'Built-in',
        rootDir: path.join(this.context.extensionPath, 'builtins', 'templates'),
        source: { kind: 'builtin' },
        readOnly: true,
        strict: false,
      }),
      new FilePromptRepository({
        id: 'personal',
        label: 'Personal',
        rootDir: this.getGlobalPromptsDir(),
        source: { kind: 'personal' },
        strict: false,
      }),
      ...getWorkspaceFolders().map((workspaceFolder, index) => new FilePromptRepository({
        id: `workspace:${index}:${workspaceFolder.uri.fsPath}`,
        label: workspaceFolder.name ?? path.basename(workspaceFolder.uri.fsPath),
        rootDir: path.join(workspaceFolder.uri.fsPath, this.config.promptsDir, 'templates'),
        source: { kind: 'workspace', workspaceFolder: workspaceFolder.uri.fsPath },
        strict: false,
      })),
      this.createSharedPromptRepository(),
    ];

    return repositories;
  }

  private createSharedPromptRepository(): PromptRepository {
    return {
      id: 'shared',
      label: 'Shared Libraries',
      list: async () => this.teamPolicyService.getInstalledPacks().flatMap((pack) =>
        pack.prompts.map((prompt) => this.toSharedPromptItem(prompt))
      ),
    };
  }

  private toSharedPromptItem(prompt: SharedPromptTemplate): PromptLibraryItem {
    return {
      prompt: {
        id: prompt.id,
        schemaVersion: PROMPT_SCHEMA_VERSION,
        title: prompt.name,
        description: prompt.description || '',
        body: prompt.template,
        tags: prompt.tags || [],
        category: prompt.category || 'Shared Library',
        variables: this.toPromptVariableDefinitions(prompt.variables),
        metadata: {
          version: prompt.packVersion,
        },
      },
      source: {
        kind: 'shared',
        libraryId: prompt.packId,
        libraryVersion: prompt.packVersion,
      },
      readOnly: true,
      storage: {
        kind: 'shared',
        libraryId: prompt.packId,
        sourceFile: prompt.sourceFile,
      },
    };
  }

  getAllPrompts(): PromptTemplate[] {
    return Array.from(this.prompts.values());
  }

  getLibrarySnapshot(): PromptLibrarySnapshot | undefined {
    return this.librarySnapshot;
  }

  getPromptByLibraryEntryKeyMap(): Map<string, PromptTemplate> {
    return new Map(this.promptByLibraryEntryKey);
  }

  getPromptsByCategory(): Map<string, PromptTemplate[]> {
    const grouped = new Map<string, PromptTemplate[]>();

    for (const prompt of this.prompts.values()) {
      const category = prompt.category || 'General';
      grouped.set(category, [...(grouped.get(category) ?? []), prompt]);
    }

    return grouped;
  }

  getPrompt(id: string): PromptTemplate | undefined {
    return this.prompts.get(id);
  }

  searchPrompts(query: string): PromptTemplate[] {
    const snapshot = this.librarySnapshot;
    if (!snapshot) {
      return [];
    }

    const libraryService = new PromptLibraryService([]);
    return libraryService.search(snapshot, { query, includeBody: false })
      .map((entry) => this.prompts.get(entry.item.prompt.id))
      .filter((prompt): prompt is PromptTemplate => Boolean(prompt));
  }

  async markPromptUsed(id: string, usedAt: Date = new Date()): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      return false;
    }

    const usage = this.getUsageMetadata();
    usage[id] = {
      ...usage[id],
      lastUsedAt: usedAt.toISOString(),
    };
    await this.context.globalState.update(PROMPT_USAGE_METADATA_KEY, usage);

    prompt.lastUsedAt = usage[id].lastUsedAt;
    this.prompts.set(id, prompt);
    this.updateSnapshotUsage(id, usage[id]);
    this.updateEntryPromptUsage(id, usage[id]);
    this.onDidChangePrompts.fire();
    return true;
  }

  async setPromptFavorite(id: string, favorite: boolean): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      return false;
    }

    const usage = this.getUsageMetadata();
    usage[id] = {
      ...usage[id],
      favorite,
    };
    await this.context.globalState.update(PROMPT_USAGE_METADATA_KEY, usage);

    prompt.favorite = favorite;
    this.prompts.set(id, prompt);
    this.updateSnapshotUsage(id, usage[id]);
    this.updateEntryPromptUsage(id, usage[id]);
    this.onDidChangePrompts.fire();
    return true;
  }

  async createPrompt(prompt: Partial<PromptTemplate>, target: 'workspace' | 'global' = 'workspace'): Promise<PromptTemplate> {
    const newPrompt: PromptTemplate = {
      id: prompt.id || uuidv4(),
      name: prompt.name || 'Untitled Prompt',
      description: prompt.description || '',
      category: prompt.category || 'General',
      tags: prompt.tags || [],
      author: prompt.author,
      version: prompt.version || '1.0.0',
      parameters: prompt.parameters,
      variables: prompt.variables,
      template: prompt.template || '',
      source: target,
    };

    const workspaceFolders = getWorkspaceFolders();
    const hasWorkspace = workspaceFolders.length > 0;

    if (target === 'global' || !hasWorkspace) {
      newPrompt.source = 'global';
      await this.saveGlobalPrompt(newPrompt);
    } else {
      await this.saveWorkspacePrompt(newPrompt);
    }

    await this.refresh();
    return this.prompts.get(newPrompt.id) ?? newPrompt;
  }

  async updatePrompt(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate | null> {
    const existing = this.prompts.get(id);
    if (!existing) {
      return null;
    }

    if (existing.source === 'builtin' || existing.source === 'team-pack') {
      return null;
    }

    const updated: PromptTemplate = {
      ...existing,
      ...updates,
      id: existing.id,
      source: existing.source,
      filePath: existing.filePath,
    };

    if (existing.source === 'global') {
      await this.saveGlobalPrompt(updated);
    } else if (existing.source === 'workspace') {
      await this.saveWorkspacePrompt(updated, existing.filePath);
    }

    await this.refresh();
    return this.prompts.get(id) ?? updated;
  }

  async deletePrompt(id: string): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      return false;
    }

    if (prompt.source === 'builtin' || prompt.source === 'team-pack') {
      return false;
    }

    if (!prompt.filePath || !fs.existsSync(prompt.filePath)) {
      return false;
    }

    await fs.promises.unlink(prompt.filePath);
    await this.refresh();
    return true;
  }

  async refresh(): Promise<void> {
    await this.loadAllPrompts();
    this.onDidChangePrompts.fire();
  }

  dispose(): void {
    this.onDidChangePrompts.dispose();
  }

  private async migrateLegacyGlobalPrompts(): Promise<void> {
    const legacyPrompts = this.context.globalState.get<PromptTemplate[]>(GLOBAL_STATE_KEY, []);
    if (!Array.isArray(legacyPrompts) || legacyPrompts.length === 0) {
      return;
    }

    for (const legacyPrompt of legacyPrompts) {
      await this.saveGlobalPrompt({
        ...legacyPrompt,
        id: legacyPrompt.id || uuidv4(),
        name: legacyPrompt.name || 'Untitled Prompt',
        description: legacyPrompt.description || '',
        category: legacyPrompt.category || 'General',
        tags: legacyPrompt.tags || [],
        version: legacyPrompt.version || '1.0.0',
        template: legacyPrompt.template || '',
        source: 'global',
      });
    }

    await this.context.globalState.update(GLOBAL_STATE_KEY, []);
  }

  private async saveGlobalPrompt(prompt: PromptTemplate): Promise<void> {
    const promptsDir = this.getGlobalPromptsDir();
    await fs.promises.mkdir(promptsDir, { recursive: true });

    const filePath = prompt.filePath ?? path.join(promptsDir, `${this.sanitizeFilename(prompt.id)}.yaml`);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, encodePromptYaml(this.toPromptDefinition(prompt)), 'utf8');
    prompt.filePath = filePath;
  }

  private async saveWorkspacePrompt(prompt: PromptTemplate, previousFilePath?: string): Promise<void> {
    const workspaceFolders = getWorkspaceFolders();
    if (workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }

    const filePath = previousFilePath ?? this.getNewWorkspacePromptPath(prompt);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, encodePromptYaml(this.toPromptDefinition(prompt)), 'utf8');
    prompt.filePath = filePath;
  }

  private getNewWorkspacePromptPath(prompt: PromptTemplate): string {
    const workspaceFolders = getWorkspaceFolders();
    const targetRoot =
      getWorkspaceFolderForUri()?.uri.fsPath
      ?? workspaceFolders[0]?.uri.fsPath;

    if (!targetRoot) {
      throw new Error('No workspace folder open');
    }

    return path.join(targetRoot, this.config.promptsDir, 'templates', `${this.sanitizeFilename(prompt.id)}.yaml`);
  }

  private getGlobalPromptsDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, GLOBAL_PROMPTS_DIR);
  }

  private createPromptMap(prompts: PromptTemplate[]): Map<string, PromptTemplate> {
    const sorted = [...prompts].sort((left, right) =>
      this.sourcePrecedence(left.source) - this.sourcePrecedence(right.source)
    );
    return new Map(sorted.map((prompt) => [prompt.id, prompt]));
  }

  private applyUsageMetadata(entries: PromptLibraryEntry[]): PromptLibraryEntry[] {
    const usage = this.getUsageMetadata();
    return entries.map((entry) => {
      const promptUsage = usage[entry.item.prompt.id];
      if (!promptUsage) {
        return entry;
      }

      return {
        ...entry,
        item: {
          ...entry.item,
          prompt: {
            ...entry.item.prompt,
            metadata: {
              ...entry.item.prompt.metadata,
              ...promptUsage,
            },
          },
        },
      };
    });
  }

  private updateSnapshotUsage(id: string, usage: PromptUsageMetadata): void {
    if (!this.librarySnapshot) {
      return;
    }

    const entries = this.librarySnapshot.entries.map((entry) => {
      if (entry.item.prompt.id !== id) {
        return entry;
      }

      return {
        ...entry,
        item: {
          ...entry.item,
          prompt: {
            ...entry.item.prompt,
            metadata: {
              ...entry.item.prompt.metadata,
              ...usage,
            },
          },
        },
      };
    });

    this.librarySnapshot = {
      ...this.librarySnapshot,
      entries,
    };
  }

  private updateEntryPromptUsage(id: string, usage: PromptUsageMetadata): void {
    this.promptByLibraryEntryKey = new Map(
      Array.from(this.promptByLibraryEntryKey.entries()).map(([key, prompt]) => [
        key,
        prompt.id === id
          ? {
              ...prompt,
              favorite: usage.favorite ?? prompt.favorite,
              lastUsedAt: usage.lastUsedAt ?? prompt.lastUsedAt,
            }
          : prompt,
      ])
    );
  }

  private sourcePrecedence(source: PromptTemplate['source']): number {
    switch (source) {
      case 'builtin':
        return 0;
      case 'team-pack':
        return 1;
      case 'global':
        return 2;
      case 'workspace':
        return 3;
      default:
        return 0;
    }
  }

  private toPromptTemplate(item: PromptLibraryItem): PromptTemplate {
    const prompt = item.prompt;
    const source = this.toLegacySource(item.source);
    const usage = this.getUsageMetadata()[prompt.id];
    const template: PromptTemplate = {
      id: prompt.id,
      name: prompt.title,
      description: prompt.description,
      category: prompt.category || 'General',
      tags: prompt.tags,
      author: prompt.metadata.author,
      version: prompt.metadata.version || '1.0.0',
      variables: this.toPromptVariables(prompt.variables),
      template: prompt.body,
      source,
      readOnly: item.readOnly,
      favorite: usage?.favorite ?? prompt.metadata.favorite,
      lastUsedAt: usage?.lastUsedAt ?? prompt.metadata.lastUsedAt,
      filePath: item.storage?.kind === 'file' || item.storage?.kind === 'builtin'
        ? item.storage.path
        : this.resolveSharedPromptFilePath(item),
    };

    if (item.source.kind === 'shared') {
      template.packId = item.source.libraryId;
      template.packVersion = item.source.libraryVersion;
    }

    return template;
  }

  private resolveSharedPromptFilePath(item: PromptLibraryItem): string | undefined {
    if (item.source.kind !== 'shared' || item.storage?.kind !== 'shared' || !item.storage.sourceFile) {
      return undefined;
    }

    const pack = this.teamPolicyService.getPackById(item.source.libraryId);
    return pack ? path.join(pack.sourcePath, 'prompts', item.storage.sourceFile) : undefined;
  }

  private toLegacySource(source: PromptSource): PromptTemplate['source'] {
    switch (source.kind) {
      case 'personal':
        return 'global';
      case 'workspace':
        return 'workspace';
      case 'shared':
        return 'team-pack';
      case 'builtin':
      default:
        return 'builtin';
    }
  }

  private toPromptDefinition(prompt: PromptTemplate): PromptDefinition {
    const metadata: PromptMetadata = {
      author: prompt.author,
      version: prompt.version || '1.0.0',
      favorite: prompt.favorite,
      lastUsedAt: prompt.lastUsedAt,
    };

    return {
      id: prompt.id || uuidv4(),
      schemaVersion: PROMPT_SCHEMA_VERSION,
      title: prompt.name || 'Untitled Prompt',
      description: prompt.description || '',
      body: prompt.template || '',
      tags: prompt.tags || [],
      category: prompt.category || 'General',
      variables: this.toPromptVariableDefinitions(prompt.variables),
      metadata,
    };
  }

  private toPromptVariables(variables: PromptVariableDefinition[]): PromptVariable[] | undefined {
    if (variables.length === 0) {
      return undefined;
    }

    return variables.map((variable) => ({
      name: variable.name,
      description: variable.description,
      type: variable.type,
      required: variable.required,
      values: variable.enumValues,
      default: variable.defaultValue,
      placeholder: variable.placeholder,
      multiline: variable.multiline,
    }));
  }

  private toPromptVariableDefinitions(variables: PromptVariable[] | undefined): PromptVariableDefinition[] {
    if (!variables || variables.length === 0) {
      return [];
    }

    return variables.map((variable) => ({
      name: variable.name,
      description: variable.description || variable.name,
      type: variable.type,
      required: variable.required ?? false,
      enumValues: variable.type === 'enum' ? variable.values : undefined,
      defaultValue: variable.default,
      placeholder: variable.placeholder,
      multiline: variable.multiline,
      source: this.isEditorContextVariable(variable.name) ? 'editor-context' : 'manual',
    }));
  }

  private isEditorContextVariable(name: string): boolean {
    return [
      'selection',
      'filepath',
      'file_content',
      'lang',
      'project_name',
      'git_commit_diff',
      'line_number',
      'column_number',
    ].includes(name);
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'prompt';
  }

  private getUsageMetadata(): PromptUsageMetadataMap {
    return this.context.globalState.get<PromptUsageMetadataMap>(PROMPT_USAGE_METADATA_KEY, {});
  }
}
