import * as vscode from 'vscode';
import { PromptRepository } from '../core/prompt/PromptRepository';
import { PromptTemplate } from '../types/prompt';
import { t } from '../utils/i18n';

type PromptTreeItem = CategoryItem | PromptItem;

class CategoryItem extends vscode.TreeItem {
  constructor(public readonly category: string, public readonly source: string) {
    super(category, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = 'category';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class PromptItem extends vscode.TreeItem {
  constructor(public readonly prompt: PromptTemplate) {
    super(prompt.name, vscode.TreeItemCollapsibleState.None);
    this.description = prompt.description.length > 50
      ? prompt.description.substring(0, 50) + '...'
      : prompt.description;
    this.tooltip = new vscode.MarkdownString(
      `**${prompt.name}**\n\n${prompt.description}\n\n` +
      (prompt.tags.length ? `*Tags:* ${prompt.tags.join(', ')}\n\n` : '') +
      `*Source:* ${prompt.source ?? 'unknown'}`
    );
    this.contextValue = prompt.readOnly ? 'promptReadOnly' : 'prompt';
    this.iconPath = getCategoryIcon(prompt.category);
    this.command = { command: 'pbp.runPrompt', title: t('Run Prompt'), arguments: [prompt] };
  }
}

function getCategoryIcon(category?: string): vscode.ThemeIcon {
  const map: Record<string, string> = {
    'Development': 'code',
    'Code Analysis': 'search',
    'Code Generation': 'file-code',
    'Documentation': 'book',
    'Testing': 'beaker',
    'Data': 'database',
    'General': 'comment',
  };
  return new vscode.ThemeIcon(map[category ?? ''] ?? 'comment');
}

export class PromptsTreeProvider implements vscode.TreeDataProvider<PromptTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PromptTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private prompts: PromptTemplate[] = [];

  constructor(private readonly repo: PromptRepository) {
    repo.onDidChange(() => this.reload());
  }

  async reload(): Promise<void> {
    this.prompts = await this.repo.loadAll();
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this.reload();
  }

  getTreeItem(element: PromptTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PromptTreeItem): PromptTreeItem[] {
    if (!element) {
      const sources = [...new Set(this.prompts.map(p => getSourceLabel(p.source)))];
      if (sources.length === 0) return [];
      if (sources.length === 1) return this.getCategoryItems(sources[0]);
      return sources.map(src => {
        const g = new vscode.TreeItem(src, vscode.TreeItemCollapsibleState.Expanded) as CategoryItem;
        g.contextValue = 'source';
        (g as vscode.TreeItem).iconPath = new vscode.ThemeIcon('library');
        return g as unknown as CategoryItem;
      });
    }
    if (element.contextValue === 'source') {
      return this.getCategoryItems(element.label as string);
    }
    if (element instanceof CategoryItem) {
      return this.prompts
        .filter(p => getSourceLabel(p.source) === element.source && (p.category || 'General') === element.category)
        .map(p => new PromptItem(p));
    }
    return [];
  }

  private getCategoryItems(source: string): CategoryItem[] {
    const cats = [...new Set(
      this.prompts
        .filter(p => getSourceLabel(p.source) === source)
        .map(p => p.category || 'General')
    )];
    return cats.sort().map(cat => new CategoryItem(cat, source));
  }
}

function getSourceLabel(source?: string): string {
  switch (source) {
    case 'team-pack': return 'Team Library';
    case 'workspace': return 'Workspace';
    case 'global': return 'Personal';
    case 'builtin': return 'Built-in';
    default: return 'Other';
  }
}
