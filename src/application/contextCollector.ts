import * as cp from 'child_process';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { ContextItem, createContextItem } from '../domain/taskPack';

const execFile = promisify(cp.execFile);

export interface ContextCollectorSettings {
  contextBudgetChars: number;
}

export class ContextCollector {
  public constructor(private readonly settings: ContextCollectorSettings) {}

  public collectActiveSelection(): ContextItem[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = toWorkspacePath(document.uri, workspaceFolder);
    const selection = editor.selection.isEmpty
      ? document.lineAt(editor.selection.active.line).text
      : document.getText(editor.selection);

    if (!selection.trim()) {
      return [];
    }

    return [createContextItem({
      id: `selection:${document.uri.toString()}:${editor.selection.start.line}:${editor.selection.start.character}:${editor.selection.end.line}:${editor.selection.end.character}`,
      kind: 'selection',
      label: editor.selection.isEmpty ? `Current line in ${relativePath}` : `Selection from ${relativePath}`,
      source: `${relativePath}:${editor.selection.start.line + 1}`,
      language: document.languageId,
      content: selection,
      budgetChars: this.perItemBudget(1),
    })];
  }

  public collectActiveFile(): ContextItem[] {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return [];
    }

    const document = editor.document;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const relativePath = toWorkspacePath(document.uri, workspaceFolder);
    return [createContextItem({
      id: `file:${document.uri.toString()}`,
      kind: 'current-file',
      label: `Current file: ${relativePath}`,
      source: relativePath,
      language: document.languageId,
      content: document.getText(),
      budgetChars: this.perItemBudget(1),
    })];
  }

  public async collectFiles(uris: vscode.Uri[]): Promise<ContextItem[]> {
    const budget = this.perItemBudget(Math.max(uris.length, 1));
    const items: ContextItem[] = [];

    for (const uri of uris) {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const document = await vscode.workspace.openTextDocument(uri);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      const relativePath = toWorkspacePath(uri, workspaceFolder);
      items.push(createContextItem({
        id: `file:${uri.toString()}`,
        kind: 'file',
        label: relativePath,
        source: relativePath,
        language: document.languageId,
        content: Buffer.from(bytes).toString('utf8'),
        budgetChars: budget,
      }));
    }

    return items;
  }

  public async collectGitDiff(workspaceFolder: vscode.WorkspaceFolder): Promise<ContextItem[]> {
    try {
      const { stdout } = await execFile('git', ['diff', '--', '.'], {
        cwd: workspaceFolder.uri.fsPath,
        timeout: 5000,
        maxBuffer: Math.max(this.settings.contextBudgetChars * 2, 1024 * 1024),
      });

      if (!stdout.trim()) {
        return [];
      }

      return [createContextItem({
        id: `git-diff:${workspaceFolder.uri.toString()}`,
        kind: 'git-diff',
        label: `Git diff: ${workspaceFolder.name}`,
        source: workspaceFolder.name,
        language: 'diff',
        content: stdout,
        budgetChars: this.perItemBudget(1),
      })];
    } catch {
      return [];
    }
  }

  public collectDiagnostics(workspaceFolder?: vscode.WorkspaceFolder): ContextItem[] {
    const diagnostics = vscode.languages.getDiagnostics()
      .filter(([uri, entries]) => entries.length > 0 && (!workspaceFolder || uri.fsPath.startsWith(workspaceFolder.uri.fsPath)));

    if (diagnostics.length === 0) {
      return [];
    }

    const content = diagnostics.flatMap(([uri, entries]) => {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      const relativePath = toWorkspacePath(uri, folder);
      return entries.map((entry) => {
        const range = entry.range.start;
        return `${relativePath}:${range.line + 1}:${range.character + 1} ${severityLabel(entry.severity)} ${entry.message}`;
      });
    }).join('\n');

    return [createContextItem({
      id: `diagnostics:${workspaceFolder?.uri.toString() ?? 'workspace'}`,
      kind: 'diagnostics',
      label: 'VS Code diagnostics',
      language: 'text',
      content,
      budgetChars: this.perItemBudget(1),
    })];
  }

  public collectNote(note: string): ContextItem[] {
    if (!note.trim()) {
      return [];
    }

    return [createContextItem({
      id: `note:${Date.now()}`,
      kind: 'note',
      label: 'Manual note',
      language: 'markdown',
      content: note.trim(),
      budgetChars: this.perItemBudget(1),
    })];
  }

  private perItemBudget(count: number): number {
    return Math.max(2000, Math.floor(this.settings.contextBudgetChars / Math.max(count, 1)));
  }
}

export function toWorkspacePath(uri: vscode.Uri, workspaceFolder?: vscode.WorkspaceFolder): string {
  if (!workspaceFolder) {
    return uri.fsPath;
  }

  return path.relative(workspaceFolder.uri.fsPath, uri.fsPath).replace(/\\/g, '/');
}

function severityLabel(severity: vscode.DiagnosticSeverity): string {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return 'error';
    case vscode.DiagnosticSeverity.Warning:
      return 'warning';
    case vscode.DiagnosticSeverity.Information:
      return 'info';
    case vscode.DiagnosticSeverity.Hint:
      return 'hint';
  }
}
