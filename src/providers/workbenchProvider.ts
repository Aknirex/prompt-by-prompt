import * as vscode from 'vscode';
import { ContextItem, TaskPack } from '../domain/taskPack';

type WorkbenchNode =
  | { kind: 'action'; label: string; description?: string; command: string; icon: string }
  | { kind: 'group'; label: string; id: string; children: WorkbenchNode[]; icon: string }
  | { kind: 'summary'; label: string; description?: string; icon: string }
  | { kind: 'context'; item: ContextItem };

export class WorkbenchProvider implements vscode.TreeDataProvider<WorkbenchNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<WorkbenchNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private taskPack: TaskPack | undefined;

  public setTaskPack(taskPack: TaskPack | undefined): void {
    this.taskPack = taskPack;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(node: WorkbenchNode): vscode.TreeItem {
    switch (node.kind) {
      case 'group':
        return this.groupItem(node);
      case 'action':
        return this.actionItem(node);
      case 'summary':
        return this.summaryItem(node);
      case 'context':
        return this.contextItem(node.item);
    }
  }

  public getChildren(node?: WorkbenchNode): WorkbenchNode[] {
    if (node?.kind === 'group') {
      return node.children;
    }

    if (node) {
      return [];
    }

    return [
      {
        kind: 'group',
        label: 'Actions',
        id: 'actions',
        icon: 'tools',
        children: this.actionNodes(),
      },
      {
        kind: 'group',
        label: 'Current Task Pack',
        id: 'current',
        icon: 'symbol-string',
        children: this.currentTaskNodes(),
      },
      {
        kind: 'group',
        label: 'Workspace',
        id: 'workspace',
        icon: 'repo',
        children: [
          { kind: 'action', label: 'Bootstrap Workspace AI Setup', command: 'pbp.bootstrapWorkspace', icon: 'rocket' },
          { kind: 'action', label: 'Audit AI Customizations', command: 'pbp.auditCustomizations', icon: 'shield' },
        ],
      },
    ];
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private actionNodes(): WorkbenchNode[] {
    return [
      { kind: 'action', label: 'New Task Pack', command: 'pbp.newTaskPack', icon: 'add' },
      { kind: 'action', label: 'Add Selection or Current Line', command: 'pbp.addSelectionContext', icon: 'selection' },
      { kind: 'action', label: 'Add Current File', command: 'pbp.addCurrentFileContext', icon: 'file-code' },
      { kind: 'action', label: 'Add Files...', command: 'pbp.addFilesContext', icon: 'files' },
      { kind: 'action', label: 'Add Git Diff', command: 'pbp.addGitDiffContext', icon: 'git-pull-request' },
      { kind: 'action', label: 'Add Diagnostics', command: 'pbp.addDiagnosticsContext', icon: 'warning' },
      { kind: 'action', label: 'Add Note', command: 'pbp.addNoteContext', icon: 'note' },
      { kind: 'action', label: 'Refine Task Pack', command: 'pbp.refineTaskPack', icon: 'sparkle' },
      { kind: 'action', label: 'Copy Task Pack', command: 'pbp.copyTaskPack', icon: 'clippy' },
      { kind: 'action', label: 'Save as Prompt File', command: 'pbp.savePromptFile', icon: 'save' },
    ];
  }

  private currentTaskNodes(): WorkbenchNode[] {
    if (!this.taskPack) {
      return [
        { kind: 'summary', label: 'No task pack yet', description: 'Run New Task Pack', icon: 'circle-slash' },
      ];
    }

    return [
      { kind: 'summary', label: this.taskPack.title, description: this.taskPack.intent, icon: 'symbol-event' },
      { kind: 'summary', label: 'Goal', description: this.taskPack.goal || 'No goal', icon: 'target' },
      { kind: 'summary', label: `${this.taskPack.contextItems.length} context item(s)`, icon: 'references' },
      ...this.taskPack.contextItems.map((item): WorkbenchNode => ({ kind: 'context', item })),
      { kind: 'action', label: 'Preview Task Pack', command: 'pbp.previewTaskPack', icon: 'preview' },
      { kind: 'action', label: 'Clear Task Pack', command: 'pbp.clearTaskPack', icon: 'trash' },
    ];
  }

  private groupItem(node: Extract<WorkbenchNode, { kind: 'group' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
    item.id = node.id;
    item.iconPath = new vscode.ThemeIcon(node.icon);
    return item;
  }

  private actionItem(node: Extract<WorkbenchNode, { kind: 'action' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.description = node.description;
    item.iconPath = new vscode.ThemeIcon(node.icon);
    item.command = { command: node.command, title: node.label };
    item.contextValue = 'pbp.action';
    return item;
  }

  private summaryItem(node: Extract<WorkbenchNode, { kind: 'summary' }>): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.description = node.description;
    item.iconPath = new vscode.ThemeIcon(node.icon);
    item.contextValue = 'pbp.summary';
    return item;
  }

  private contextItem(contextItem: ContextItem): vscode.TreeItem {
    const item = new vscode.TreeItem(contextItem.label, vscode.TreeItemCollapsibleState.None);
    item.description = contextItem.kind;
    item.tooltip = contextItem.source ?? contextItem.summary ?? contextItem.label;
    item.iconPath = new vscode.ThemeIcon(contextItem.truncated ? 'fold' : 'file-text');
    item.contextValue = 'pbp.contextItem';
    return item;
  }
}
