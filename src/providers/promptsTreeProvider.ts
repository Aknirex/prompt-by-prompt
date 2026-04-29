import * as vscode from 'vscode';
import { PromptEntry } from '../domain/prompt';

type PromptTreeNode =
  | { kind: 'group'; label: string; entries: PromptEntry[]; id: string }
  | { kind: 'prompt'; entry: PromptEntry };

export class PromptsTreeProvider implements vscode.TreeDataProvider<PromptTreeNode> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PromptTreeNode | undefined>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private entries: PromptEntry[] = [];

  public setEntries(entries: PromptEntry[]): void {
    this.entries = entries;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  public getTreeItem(node: PromptTreeNode): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(
        `${node.label} (${node.entries.length})`,
        vscode.TreeItemCollapsibleState.Expanded
      );
      item.id = node.id;
      item.contextValue = 'promptGroup';
      item.iconPath = new vscode.ThemeIcon(node.id === 'favorites' ? 'star-full' : 'folder');
      return item;
    }

    const { entry } = node;
    const item = new vscode.TreeItem(entry.prompt.title, vscode.TreeItemCollapsibleState.None);
    item.id = `${entry.source}:${entry.prompt.id}`;
    item.description = entry.prompt.tags.length > 0 ? entry.prompt.tags.join(', ') : entry.source;
    item.tooltip = this.getPromptTooltip(entry);
    item.contextValue = entry.readOnly ? 'prompt.builtin' : `prompt.${entry.source}`;
    item.iconPath = new vscode.ThemeIcon(entry.favorite ? 'star-full' : 'symbol-string');
    item.command = {
      command: 'pbp.previewPrompt',
      title: 'Preview Prompt',
      arguments: [entry],
    };
    return item;
  }

  public getChildren(node?: PromptTreeNode): PromptTreeNode[] {
    if (node?.kind === 'group') {
      return node.entries.map((entry) => ({ kind: 'prompt', entry }));
    }

    if (node?.kind === 'prompt') {
      return [];
    }

    const groups: PromptTreeNode[] = [];
    const favorites = this.entries.filter((entry) => entry.favorite);
    if (favorites.length > 0) {
      groups.push({ kind: 'group', label: 'Favorites', entries: favorites, id: 'favorites' });
    }

    for (const [category, entries] of this.groupByCategory(this.entries)) {
      groups.push({ kind: 'group', label: category, entries, id: `category:${category}` });
    }

    return groups;
  }

  public dispose(): void {
    this.onDidChangeTreeDataEmitter.dispose();
  }

  private groupByCategory(entries: PromptEntry[]): Map<string, PromptEntry[]> {
    const groups = new Map<string, PromptEntry[]>();
    for (const entry of entries) {
      const category = entry.prompt.category || 'General';
      groups.set(category, [...(groups.get(category) ?? []), entry]);
    }

    return new Map([...groups.entries()].sort(([left], [right]) => left.localeCompare(right)));
  }

  private getPromptTooltip(entry: PromptEntry): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString(undefined, true);
    tooltip.appendMarkdown(`**${entry.prompt.title}**\n\n`);
    if (entry.prompt.description) {
      tooltip.appendMarkdown(`${entry.prompt.description}\n\n`);
    }
    tooltip.appendMarkdown(`Source: ${entry.source}`);
    if (entry.filePath) {
      tooltip.appendMarkdown(`\n\nFile: \`${entry.filePath}\``);
    }
    return tooltip;
  }
}

