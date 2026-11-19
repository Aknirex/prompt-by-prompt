import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import * as vscode from 'vscode';
import { ContextCollector } from './application/contextCollector';
import { renderAuditReport, scanCustomizations } from './application/customizationScanner';
import { refineTaskPackWithLanguageModel } from './application/languageModelRefiner';
import {
  AdapterTarget,
  createBootstrapFiles,
  renderBootstrapPreview,
  reservePromptFilePath,
  writeBootstrapFiles,
} from './application/workspaceBootstrap';
import {
  addContextItems,
  createTaskPack,
  removeContextItem,
  TaskIntent,
  TaskPack,
} from './domain/taskPack';
import { renderPromptFile, renderTaskPackMarkdown } from './domain/taskPackRenderer';
import { WorkbenchProvider } from './providers/workbenchProvider';

interface PromptByPromptSettings {
  contextBudgetChars: number;
  includeDiagnostics: boolean;
  includeGitDiff: boolean;
  enableLanguageModelAssist: boolean;
  promptFilesPath: string;
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const controller = new PromptByPromptController(context);
  await controller.activate();
}

export function deactivate(): void {
  // VS Code disposes registered subscriptions.
}

class PromptByPromptController {
  private readonly workbenchProvider = new WorkbenchProvider();
  private readonly output = vscode.window.createOutputChannel('Prompt by Prompt');
  private taskPack: TaskPack | undefined;

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public async activate(): Promise<void> {
    const treeView = vscode.window.createTreeView('pbp.workbenchView', {
      treeDataProvider: this.workbenchProvider,
      showCollapseAll: true,
    });

    this.context.subscriptions.push(this.output, this.workbenchProvider, treeView);
    this.registerCommands();
    this.registerRefreshHooks();
    this.refreshWorkbench();
  }

  private registerCommands(): void {
    const commands: vscode.Disposable[] = [
      vscode.commands.registerCommand('pbp.refreshWorkbench', () => this.runCommand(() => this.refreshWorkbench())),
      vscode.commands.registerCommand('pbp.newTaskPack', () => this.runCommand(() => this.newTaskPack())),
      vscode.commands.registerCommand('pbp.addSelectionContext', () => this.runCommand(() => this.addSelectionContext())),
      vscode.commands.registerCommand('pbp.addCurrentFileContext', () => this.runCommand(() => this.addCurrentFileContext())),
      vscode.commands.registerCommand('pbp.addFilesContext', () => this.runCommand(() => this.addFilesContext())),
      vscode.commands.registerCommand('pbp.addGitDiffContext', () => this.runCommand(() => this.addGitDiffContext())),
      vscode.commands.registerCommand('pbp.addDiagnosticsContext', () => this.runCommand(() => this.addDiagnosticsContext())),
      vscode.commands.registerCommand('pbp.addNoteContext', () => this.runCommand(() => this.addNoteContext())),
      vscode.commands.registerCommand('pbp.copyTaskPack', () => this.runCommand(() => this.copyTaskPack())),
      vscode.commands.registerCommand('pbp.previewTaskPack', () => this.runCommand(() => this.previewTaskPack())),
      vscode.commands.registerCommand('pbp.savePromptFile', () => this.runCommand(() => this.savePromptFile())),
      vscode.commands.registerCommand('pbp.bootstrapWorkspace', () => this.runCommand(() => this.bootstrapWorkspace())),
      vscode.commands.registerCommand('pbp.auditCustomizations', () => this.runCommand(() => this.auditCustomizations())),
      vscode.commands.registerCommand('pbp.refineTaskPack', () => this.runCommand(() => this.refineTaskPack())),
      vscode.commands.registerCommand('pbp.clearTaskPack', () => this.runCommand(() => this.clearTaskPack())),
      vscode.commands.registerCommand('pbp.removeContextItem', (itemId?: unknown) => this.runCommand(() => this.removeContextItem(itemId))),
    ];

    this.context.subscriptions.push(...commands);
  }

  private registerRefreshHooks(): void {
    this.context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('pbp')) {
          this.refreshWorkbench();
        }
      }),
      vscode.workspace.onDidChangeWorkspaceFolders(() => this.refreshWorkbench())
    );
  }

  private async newTaskPack(): Promise<void> {
    const title = await vscode.window.showInputBox({
      title: 'New Task Pack',
      prompt: 'What should the agent do?',
      placeHolder: 'Fix the failing auth tests',
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? null : 'Title is required.',
    });

    if (!title) {
      return;
    }

    const intent = await vscode.window.showQuickPick(intentQuickPickItems(), {
      title: 'New Task Pack',
      placeHolder: 'Choose the closest task intent',
      ignoreFocusOut: true,
    });

    if (!intent) {
      return;
    }

    const goal = await vscode.window.showInputBox({
      title: 'New Task Pack',
      prompt: 'Goal',
      value: title,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim() ? null : 'Goal is required.',
    });

    if (!goal) {
      return;
    }

    const pack = createTaskPack({
      id: randomUUID(),
      title,
      intent: intent.value,
      goal,
    });

    this.taskPack = pack;
    await this.addDefaultContext();
    this.refreshWorkbench();
    vscode.window.showInformationMessage(`Created task pack "${title}".`);
  }

  private async addDefaultContext(): Promise<void> {
    if (!this.taskPack) {
      return;
    }

    const settings = this.getSettings();
    const collector = new ContextCollector(settings);
    const workspaceFolder = this.getActiveWorkspaceFolder();
    const items = [
      ...collector.collectActiveSelection(),
      ...(settings.includeDiagnostics ? collector.collectDiagnostics(workspaceFolder) : []),
      ...(settings.includeGitDiff && workspaceFolder ? await collector.collectGitDiff(workspaceFolder) : []),
    ];

    this.taskPack = addContextItems(this.taskPack, items);
  }

  private async addSelectionContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const items = new ContextCollector(this.getSettings()).collectActiveSelection();
    if (items.length === 0) {
      vscode.window.showWarningMessage('No active selection or current line found.');
      return;
    }

    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async addCurrentFileContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const items = new ContextCollector(this.getSettings()).collectActiveFile();
    if (items.length === 0) {
      vscode.window.showWarningMessage('No active file found.');
      return;
    }

    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async addFilesContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const uris = await vscode.window.showOpenDialog({
      title: 'Add Files to Task Pack',
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: true,
      defaultUri: this.getActiveWorkspaceFolder()?.uri,
      openLabel: 'Add Files',
    });

    if (!uris || uris.length === 0) {
      return;
    }

    const items = await new ContextCollector(this.getSettings()).collectFiles(uris);
    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async addGitDiffContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    const workspaceFolder = this.getActiveWorkspaceFolder();
    if (!pack || !workspaceFolder) {
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('Open a workspace folder before adding Git diff context.');
      }
      return;
    }

    const items = await new ContextCollector(this.getSettings()).collectGitDiff(workspaceFolder);
    if (items.length === 0) {
      vscode.window.showInformationMessage('No Git diff found.');
      return;
    }

    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async addDiagnosticsContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const items = new ContextCollector(this.getSettings()).collectDiagnostics(this.getActiveWorkspaceFolder());
    if (items.length === 0) {
      vscode.window.showInformationMessage('No VS Code diagnostics found.');
      return;
    }

    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async addNoteContext(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const note = await vscode.window.showInputBox({
      title: 'Add Note',
      prompt: 'Add any extra context, constraint, or decision',
      ignoreFocusOut: true,
    });

    if (typeof note === 'undefined') {
      return;
    }

    const items = new ContextCollector(this.getSettings()).collectNote(note);
    this.taskPack = addContextItems(pack, items);
    this.refreshWorkbench();
  }

  private async copyTaskPack(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    await vscode.env.clipboard.writeText(renderTaskPackMarkdown(pack));
    vscode.window.showInformationMessage(`Copied task pack "${pack.title}" to clipboard.`);
  }

  private async previewTaskPack(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    await this.openMarkdownDocument(renderTaskPackMarkdown(pack), 'Prompt by Prompt Task Pack');
  }

  private async savePromptFile(): Promise<void> {
    const pack = await this.requireTaskPack();
    const workspaceFolder = await this.pickWorkspaceFolder();
    if (!pack || !workspaceFolder) {
      return;
    }

    const settings = this.getSettings();
    const filePath = reservePromptFilePath(workspaceFolder.uri.fsPath, settings.promptFilesPath, pack.title);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, renderPromptFile(pack), 'utf8');
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
    await vscode.window.showTextDocument(document);
    vscode.window.showInformationMessage(`Saved ${path.relative(workspaceFolder.uri.fsPath, filePath).replace(/\\/g, '/')}.`);
  }

  private async bootstrapWorkspace(): Promise<void> {
    const workspaceFolder = await this.pickWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const adapterItems = await vscode.window.showQuickPick([
      { label: 'Cursor', value: 'cursor' as AdapterTarget, description: '.cursor/rules/pbp-project.mdc' },
      { label: 'Cline', value: 'cline' as AdapterTarget, description: '.clinerules/01-project.md' },
      { label: 'Windsurf', value: 'windsurf' as AdapterTarget, description: '.windsurf/rules/pbp-project.md' },
    ], {
      title: 'Optional Agent Rule Adapters',
      placeHolder: 'Choose adapters to generate, or press Enter to skip',
      canPickMany: true,
      ignoreFocusOut: true,
    });

    if (!adapterItems) {
      return;
    }

    const adapters = adapterItems.map((item) => item.value);
    const files = createBootstrapFiles(workspaceFolder.name, adapters);
    const preview = renderBootstrapPreview(files, workspaceFolder.uri.fsPath);
    await this.openMarkdownDocument(preview, 'Prompt by Prompt Bootstrap Preview');

    const existingFiles = files.filter((file) => fs.existsSync(path.join(workspaceFolder.uri.fsPath, file.relativePath)));
    const actions = existingFiles.length > 0
      ? ['Create (Skip Existing)', 'Create (Overwrite Existing)']
      : ['Create'];

    const confirmation = await vscode.window.showWarningMessage(
      `Create ${files.length} AI customization file(s) in ${workspaceFolder.name}?`,
      { modal: true },
      ...actions
    );

    if (!confirmation) {
      return;
    }

    const policy = confirmation === 'Create (Overwrite Existing)' ? 'overwrite-existing' : 'skip-existing';
    const result = await writeBootstrapFiles(workspaceFolder.uri.fsPath, files, policy);
    this.output.appendLine('Workspace bootstrap complete.');
    this.output.appendLine(`Created: ${result.created.join(', ') || 'none'}`);
    this.output.appendLine(`Overwritten: ${result.overwritten.join(', ') || 'none'}`);
    this.output.appendLine(`Skipped: ${result.skipped.join(', ') || 'none'}`);
    vscode.window.showInformationMessage(
      `Bootstrap complete: ${result.created.length} created, ${result.overwritten.length} overwritten, ${result.skipped.length} skipped.`
    );
  }

  private async auditCustomizations(): Promise<void> {
    const workspaceFolder = await this.pickWorkspaceFolder();
    if (!workspaceFolder) {
      return;
    }

    const audit = await scanCustomizations(workspaceFolder.uri.fsPath);
    await this.openMarkdownDocument(renderAuditReport(audit), 'Prompt by Prompt Audit');
  }

  private async refineTaskPack(): Promise<void> {
    const pack = await this.requireTaskPack();
    if (!pack) {
      return;
    }

    const settings = this.getSettings();
    if (!settings.enableLanguageModelAssist) {
      vscode.window.showInformationMessage('Language model assist is disabled in settings.');
      return;
    }

    const refined = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Refining task pack',
      cancellable: true,
    }, async (_progress, token) => refineTaskPackWithLanguageModel(pack, token));

    if (!refined) {
      vscode.window.showInformationMessage('No language model response was available. The current task pack was left unchanged.');
      return;
    }

    this.taskPack = refined;
    this.refreshWorkbench();
    vscode.window.showInformationMessage(`Refined task pack "${refined.title}".`);
  }

  private clearTaskPack(): void {
    this.taskPack = undefined;
    this.refreshWorkbench();
  }

  private async removeContextItem(value?: unknown): Promise<void> {
    const itemId = resolveContextItemId(value);
    if (!this.taskPack || !itemId) {
      return;
    }

    this.taskPack = removeContextItem(this.taskPack, itemId);
    this.refreshWorkbench();
  }

  private async requireTaskPack(): Promise<TaskPack | undefined> {
    if (this.taskPack) {
      return this.taskPack;
    }

    const action = await vscode.window.showInformationMessage('Create a task pack first.', 'New Task Pack');
    if (action === 'New Task Pack') {
      await this.newTaskPack();
      return this.taskPack;
    }

    return undefined;
  }

  private async pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      vscode.window.showWarningMessage('Open a workspace folder first.');
      return undefined;
    }

    if (folders.length === 1) {
      return folders[0];
    }

    const selected = await vscode.window.showQuickPick(folders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })), {
      title: 'Choose Workspace Folder',
      ignoreFocusOut: true,
    });

    return selected?.folder;
  }

  private getActiveWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      return vscode.workspace.getWorkspaceFolder(activeUri);
    }

    return vscode.workspace.workspaceFolders?.[0];
  }

  private getSettings(): PromptByPromptSettings {
    const config = vscode.workspace.getConfiguration('pbp');
    return {
      contextBudgetChars: Math.max(4000, config.get<number>('contextBudgetChars', 80000)),
      includeDiagnostics: config.get<boolean>('includeDiagnostics', true),
      includeGitDiff: config.get<boolean>('includeGitDiff', true),
      enableLanguageModelAssist: config.get<boolean>('enableLanguageModelAssist', true),
      promptFilesPath: normalizePromptFilesPath(config.get<string>('promptFilesPath', '.github/prompts')),
    };
  }

  private refreshWorkbench(): void {
    this.workbenchProvider.setTaskPack(this.taskPack);
  }

  private async openMarkdownDocument(content: string, title: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({
      language: 'markdown',
      content,
    });
    await vscode.window.showTextDocument(document, { preview: true });
    this.output.appendLine(title);
  }

  private async runCommand(action: () => void | Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Error: ${message}`);
      vscode.window.showErrorMessage(message);
    }
  }
}

function intentQuickPickItems(): Array<vscode.QuickPickItem & { value: TaskIntent }> {
  return [
    { label: 'Implement', value: 'implement', description: 'Build or change behavior' },
    { label: 'Fix', value: 'fix', description: 'Resolve a bug or failure' },
    { label: 'Refactor', value: 'refactor', description: 'Improve structure without changing behavior' },
    { label: 'Review', value: 'review', description: 'Find issues and risks' },
    { label: 'Test', value: 'test', description: 'Add or improve tests' },
    { label: 'Docs', value: 'docs', description: 'Create or update documentation' },
    { label: 'Custom', value: 'custom', description: 'Something else' },
  ];
}

function normalizePromptFilesPath(value: string | undefined): string {
  const normalized = (value ?? '.github/prompts').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  return normalized || '.github/prompts';
}

function resolveContextItemId(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { item?: { id?: unknown } };
  return typeof candidate.item?.id === 'string' ? candidate.item.id : undefined;
}
