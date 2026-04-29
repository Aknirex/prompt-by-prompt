import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { collectEditorContext } from './application/editorContext';
import { loadPromptCatalog, PromptCatalogSnapshot, searchPrompts } from './application/promptCatalog';
import { createEmptyPrompt, PromptDefinition, PromptEntry, PromptMetadataMap } from './domain/prompt';
import { getMissingVariables, PromptVariableValues, renderPrompt } from './domain/promptRenderer';
import { deletePromptFile, PromptStoreDefinition, savePrompt } from './infrastructure/promptStore';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';

const METADATA_KEY = 'pbp.promptMetadata';

interface PromptByPromptSettings {
  libraryPath: string;
  defaultPromptTarget: 'workspace' | 'user';
  includeFileContext: boolean;
  showBuiltInPrompts: boolean;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new PromptByPromptController(context);
  await controller.activate();
}

export function deactivate(): void {
  // VS Code disposes subscriptions registered during activation.
}

class PromptByPromptController {
  private readonly treeProvider = new PromptsTreeProvider();
  private readonly output = vscode.window.createOutputChannel('Prompt by Prompt');
  private snapshot: PromptCatalogSnapshot = {
    entries: [],
    diagnostics: [],
    summary: { total: 0, workspace: 0, user: 0, builtin: 0, favorites: 0 },
  };

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async activate(): Promise<void> {
    this.context.subscriptions.push(this.output, this.treeProvider);

    const treeView = vscode.window.createTreeView('pbp.promptsView', {
      treeDataProvider: this.treeProvider,
      showCollapseAll: true,
    });
    this.context.subscriptions.push(treeView);

    this.registerCommands();
    this.registerRefreshHooks();
    await this.refresh();
  }

  private registerCommands(): void {
    const commands: vscode.Disposable[] = [
      vscode.commands.registerCommand('pbp.refreshPrompts', async () => this.refresh({ notify: true })),
      vscode.commands.registerCommand('pbp.createPrompt', async () => this.createPrompt()),
      vscode.commands.registerCommand('pbp.searchPrompts', async () => this.searchPrompts()),
      vscode.commands.registerCommand('pbp.copyPrompt', async (value?: unknown) => this.copyPrompt(value)),
      vscode.commands.registerCommand('pbp.previewPrompt', async (value?: unknown) => this.previewPrompt(value)),
      vscode.commands.registerCommand('pbp.editPrompt', async (value?: unknown) => this.editPrompt(value)),
      vscode.commands.registerCommand('pbp.duplicatePrompt', async (value?: unknown) => this.duplicatePrompt(value)),
      vscode.commands.registerCommand('pbp.deletePrompt', async (value?: unknown) => this.deletePrompt(value)),
      vscode.commands.registerCommand('pbp.toggleFavoritePrompt', async (value?: unknown) => this.toggleFavorite(value)),
      vscode.commands.registerCommand('pbp.openPromptFile', async (value?: unknown) => this.openPromptFile(value)),
      vscode.commands.registerCommand('pbp.openPromptLibrary', async () => this.openPromptLibrary()),
    ];

    this.context.subscriptions.push(...commands);
  }

  private registerRefreshHooks(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/.prompts/**/*.{yaml,yml}');
    const refresh = () => void this.refresh();
    watcher.onDidCreate(refresh, undefined, this.context.subscriptions);
    watcher.onDidChange(refresh, undefined, this.context.subscriptions);
    watcher.onDidDelete(refresh, undefined, this.context.subscriptions);

    this.context.subscriptions.push(
      watcher,
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('pbp')) {
          void this.refresh();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        void this.refresh();
      })
    );
  }

  private async refresh(options: { notify?: boolean } = {}): Promise<void> {
    const settings = this.getSettings();
    const stores = this.createStoreDefinitions(settings);
    const metadata = this.getMetadata();
    this.snapshot = await loadPromptCatalog(stores, metadata);
    this.treeProvider.setEntries(this.snapshot.entries);

    this.output.clear();
    this.output.appendLine(`Loaded ${this.snapshot.summary.total} prompts`);
    for (const diagnostic of this.snapshot.diagnostics) {
      this.output.appendLine(`[${diagnostic.storeId}] ${diagnostic.filePath}: ${diagnostic.message}`);
    }

    if (options.notify) {
      vscode.window.showInformationMessage(`Loaded ${this.snapshot.summary.total} prompts.`);
    }
  }

  private async createPrompt(): Promise<void> {
    const title = await vscode.window.showInputBox({
      title: 'New Prompt',
      prompt: 'Prompt title',
      placeHolder: 'Code review checklist',
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? null : 'Title is required.',
    });

    if (!title) {
      return;
    }

    const prompt = createEmptyPrompt(randomUUID(), title);
    const description = await vscode.window.showInputBox({
      title: 'New Prompt',
      prompt: 'Short description',
      placeHolder: 'Review selected code for correctness and maintainability',
      ignoreFocusOut: true,
    });

    if (typeof description === 'undefined') {
      return;
    }

    const category = await vscode.window.showInputBox({
      title: 'New Prompt',
      prompt: 'Category',
      value: 'General',
      ignoreFocusOut: true,
    });

    if (typeof category === 'undefined') {
      return;
    }

    const rootDir = await this.getWritableRoot();
    if (!rootDir) {
      vscode.window.showWarningMessage('Open a workspace or switch the default prompt target to User.');
      return;
    }

    const filePath = await savePrompt(rootDir, {
      ...prompt,
      description,
      category: category.trim() || 'General',
    });

    await this.refresh();
    await this.openFile(filePath);
  }

  private async searchPrompts(): Promise<void> {
    const query = await vscode.window.showInputBox({
      title: 'Search Prompts',
      prompt: 'Search title, tag, category, description, or body',
      ignoreFocusOut: true,
    });

    if (typeof query === 'undefined') {
      return;
    }

    const entries = searchPrompts(this.snapshot.entries, query);
    const selected = await vscode.window.showQuickPick(entries.map((entry) => ({
      label: entry.favorite ? `$(star-full) ${entry.prompt.title}` : entry.prompt.title,
      description: `${entry.prompt.category} - ${entry.source}`,
      detail: entry.prompt.description,
      entry,
    })), {
      title: 'Prompt by Prompt',
      placeHolder: entries.length > 0 ? 'Choose a prompt to copy' : 'No prompts found',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    if (selected?.entry) {
      await this.copyPrompt(selected.entry);
    }
  }

  private async copyPrompt(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry) {
      return;
    }

    const rendered = await this.renderEntry(entry);
    if (!rendered) {
      return;
    }

    await vscode.env.clipboard.writeText(rendered);
    await this.markUsed(entry.prompt.id);
    vscode.window.showInformationMessage(`Copied "${entry.prompt.title}" to clipboard.`);
  }

  private async previewPrompt(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry) {
      return;
    }

    const rendered = await this.renderEntry(entry);
    if (!rendered) {
      return;
    }

    const content = [
      `# ${entry.prompt.title}`,
      '',
      entry.prompt.description,
      '',
      `Source: ${entry.source}`,
      '',
      '---',
      '',
      rendered,
      '',
    ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n');

    const document = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content,
    });
    await vscode.window.showTextDocument(document, { preview: true });
  }

  private async editPrompt(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry) {
      return;
    }

    if (entry.readOnly) {
      const action = await vscode.window.showInformationMessage(
        'Built-in prompts are read-only. Duplicate it to edit your own copy.',
        'Duplicate'
      );
      if (action === 'Duplicate') {
        await this.duplicatePrompt(entry);
      }
      return;
    }

    await this.openPromptFile(entry);
  }

  private async duplicatePrompt(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry) {
      return;
    }

    const rootDir = await this.getWritableRoot();
    if (!rootDir) {
      vscode.window.showWarningMessage('Open a workspace or switch the default prompt target to User.');
      return;
    }

    const now = new Date().toISOString();
    const prompt: PromptDefinition = {
      ...entry.prompt,
      id: randomUUID(),
      title: `${entry.prompt.title} Copy`,
      createdAt: now,
      updatedAt: now,
    };
    const filePath = await savePrompt(rootDir, prompt);
    await this.refresh();
    await this.openFile(filePath);
  }

  private async deletePrompt(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry || !entry.filePath) {
      return;
    }

    if (entry.readOnly) {
      vscode.window.showInformationMessage('Built-in prompts cannot be deleted.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Delete "${entry.prompt.title}"?`,
      { modal: true },
      'Delete'
    );

    if (confirm !== 'Delete') {
      return;
    }

    await deletePromptFile(entry.filePath);
    await this.refresh();
    vscode.window.showInformationMessage(`Deleted "${entry.prompt.title}".`);
  }

  private async toggleFavorite(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry) {
      return;
    }

    const metadata = this.getMetadata();
    metadata[entry.prompt.id] = {
      ...metadata[entry.prompt.id],
      favorite: !entry.favorite,
    };
    await this.context.globalState.update(METADATA_KEY, metadata);
    await this.refresh();
  }

  private async openPromptFile(value?: unknown): Promise<void> {
    const entry = await this.pickEntry(value);
    if (!entry?.filePath) {
      return;
    }

    await this.openFile(entry.filePath);
  }

  private async openPromptLibrary(): Promise<void> {
    const rootDir = await this.getWritableRoot();
    if (!rootDir) {
      vscode.window.showWarningMessage('Open a workspace or switch the default prompt target to User.');
      return;
    }

    await fs.promises.mkdir(rootDir, { recursive: true });
    await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(rootDir));
  }

  private async renderEntry(entry: PromptEntry): Promise<string | undefined> {
    const settings = this.getSettings();
    const context = collectEditorContext({ includeFileContent: settings.includeFileContext });
    const values = await this.collectVariableValues(entry.prompt, context);
    if (!values) {
      return undefined;
    }

    const rendered = renderPrompt(entry.prompt, context, values);
    if (!rendered.trim()) {
      vscode.window.showWarningMessage(`"${entry.prompt.title}" rendered to an empty prompt.`);
      return undefined;
    }

    return rendered;
  }

  private async collectVariableValues(
    prompt: PromptDefinition,
    context: ReturnType<typeof collectEditorContext>
  ): Promise<PromptVariableValues | undefined> {
    const values: PromptVariableValues = {};
    const missing = getMissingVariables(prompt, context, values);

    for (const variable of missing) {
      let value: string | undefined;
      if (variable.type === 'enum' && variable.values && variable.values.length > 0) {
        value = await vscode.window.showQuickPick(variable.values, {
          title: prompt.title,
          placeHolder: variable.description,
        });
      } else {
        value = await vscode.window.showInputBox({
          title: prompt.title,
          prompt: variable.description,
          value: typeof variable.defaultValue === 'undefined' ? '' : String(variable.defaultValue),
          ignoreFocusOut: true,
        });
      }

      if (typeof value === 'undefined') {
        return undefined;
      }

      values[variable.name] = this.normalizeVariableValue(value, variable.type);
    }

    return values;
  }

  private normalizeVariableValue(value: string, type: string): string | number | boolean {
    if (type === 'number') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : value;
    }

    if (type === 'boolean') {
      return value.toLowerCase() === 'true';
    }

    return value;
  }

  private async markUsed(promptId: string): Promise<void> {
    const metadata = this.getMetadata();
    metadata[promptId] = {
      ...metadata[promptId],
      lastUsedAt: new Date().toISOString(),
    };
    await this.context.globalState.update(METADATA_KEY, metadata);
    await this.refresh();
  }

  private async pickEntry(value?: unknown): Promise<PromptEntry | undefined> {
    const explicitEntry = this.resolveEntry(value);
    if (explicitEntry) {
      return explicitEntry;
    }

    const selected = await vscode.window.showQuickPick(this.snapshot.entries.map((entry) => ({
      label: entry.favorite ? `$(star-full) ${entry.prompt.title}` : entry.prompt.title,
      description: `${entry.prompt.category} - ${entry.source}`,
      detail: entry.prompt.description,
      entry,
    })), {
      title: 'Prompt by Prompt',
      placeHolder: 'Choose a prompt',
      matchOnDescription: true,
      matchOnDetail: true,
    });

    return selected?.entry;
  }

  private resolveEntry(value?: unknown): PromptEntry | undefined {
    if (isPromptEntry(value)) {
      return value;
    }

    if (value && typeof value === 'object' && isPromptEntry((value as { entry?: unknown }).entry)) {
      return (value as { entry: PromptEntry }).entry;
    }

    return undefined;
  }

  private async getWritableRoot(): Promise<string | undefined> {
    const settings = this.getSettings();
    if (settings.defaultPromptTarget === 'user') {
      return path.join(this.context.globalStorageUri.fsPath, 'prompts');
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.join(workspaceFolder.uri.fsPath, settings.libraryPath);
    }

    return path.join(this.context.globalStorageUri.fsPath, 'prompts');
  }

  private createStoreDefinitions(settings: PromptByPromptSettings): PromptStoreDefinition[] {
    const stores: PromptStoreDefinition[] = [
      {
        id: 'user',
        label: 'User',
        source: 'user' as const,
        rootDir: path.join(this.context.globalStorageUri.fsPath, 'prompts'),
        readOnly: false,
      },
      ...(vscode.workspace.workspaceFolders?.map((folder) => ({
        id: `workspace:${folder.uri.fsPath}`,
        label: folder.name,
        source: 'workspace' as const,
        rootDir: path.join(folder.uri.fsPath, settings.libraryPath),
        readOnly: false,
      })) ?? []),
    ];

    if (settings.showBuiltInPrompts) {
      stores.push({
        id: 'builtin',
        label: 'Built-in',
        source: 'builtin',
        rootDir: path.join(this.context.extensionPath, 'builtins', 'templates'),
        readOnly: true,
      });
    }

    return stores;
  }

  private getSettings(): PromptByPromptSettings {
    const config = vscode.workspace.getConfiguration('pbp');
    const libraryPath = config.get<string>('libraryPath', '.prompts').trim() || '.prompts';
    const defaultPromptTarget = config.get<string>('defaultPromptTarget', 'workspace') === 'user'
      ? 'user'
      : 'workspace';

    return {
      libraryPath,
      defaultPromptTarget,
      includeFileContext: config.get<boolean>('includeFileContext', true),
      showBuiltInPrompts: config.get<boolean>('showBuiltInPrompts', true),
    };
  }

  private getMetadata(): PromptMetadataMap {
    return this.context.globalState.get<PromptMetadataMap>(METADATA_KEY, {});
  }

  private async openFile(filePath: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document);
  }
}

function isPromptEntry(value: unknown): value is PromptEntry {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<PromptEntry>;
  return Boolean(candidate.prompt?.id && candidate.prompt.title);
}
