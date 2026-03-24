/**
 * Tree View Provider for Prompts
 * Displays prompts grouped by category in VS Code sidebar
 */

import * as vscode from 'vscode';
import { PromptTemplate } from '../types/prompt';
import { t } from '../utils/i18n';

/**
 * Custom TreeItem for prompts
 */
class PromptItem extends vscode.TreeItem {
  constructor(
    public readonly prompt: PromptTemplate,
    public readonly kind: 'source' | 'category' | 'prompt' = 'prompt',
    public readonly key?: string,
    public readonly parentKey?: string
  ) {
    super(
      kind === 'prompt' ? prompt.name : t(key || ''),
      kind !== 'prompt'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None
    );

    if (kind === 'prompt') {
      this.description = prompt.description.substring(0, 50) + 
        (prompt.description.length > 50 ? '...' : '');
      
      this.tooltip = this.createTooltip(prompt);
      this.contextValue = 'prompt';
      this.iconPath = this.getIconForCategory(prompt.category);
      this.command = {
        command: 'pbp.runPrompt',
        title: t('Run Prompt'),
        arguments: [prompt]
      };
    } else if (kind === 'category') {
      this.contextValue = 'category';
      this.iconPath = new vscode.ThemeIcon('folder');
    } else {
      this.contextValue = 'source';
      this.iconPath = new vscode.ThemeIcon('library');
    }
  }

  private createTooltip(prompt: PromptTemplate): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    
    md.appendMarkdown(`**${prompt.name}**\n\n`);
    md.appendMarkdown(`${prompt.description}\n\n`);
    
    if (prompt.tags.length > 0) {
      md.appendMarkdown(`**${t('Tags')}:** ${prompt.tags.join(', ')}\n\n`);
    }
    
    if (prompt.author) {
      md.appendMarkdown(`**${t('Author')}:** ${prompt.author}\n\n`);
    }
    
    md.appendMarkdown(`**${t('Source')}:** ${prompt.source || t('Unknown')}`);
    
    return md;
  }

  private getIconForCategory(category?: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      'Development': 'code',
      'Code Analysis': 'search',
      'Code Generation': 'file-code',
      'Documentation': 'book',
      'Testing': 'beaker',
      'Data': 'database',
      'General': 'file-text'
    };
    
    const iconName = iconMap[category || 'General'] || 'file-text';
    return new vscode.ThemeIcon(iconName);
  }
}

export class PromptsTreeProvider implements vscode.TreeDataProvider<PromptItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<PromptItem | undefined | null | void> = 
    new vscode.EventEmitter<PromptItem | undefined | null | void>();
  
  readonly onDidChangeTreeData: vscode.Event<PromptItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private prompts: PromptTemplate[] = [];

  /**
   * Update prompts and refresh tree
   */
  setPrompts(prompts: PromptTemplate[]): void {
    this.prompts = prompts;
    this.refresh();
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: PromptItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  getChildren(element?: PromptItem): Thenable<PromptItem[]> {
    if (!element) {
      return Promise.resolve(this.getSourceItems());
    } else if (element.kind === 'source') {
      return Promise.resolve(this.getCategoryItems(element.key!));
    } else if (element.kind === 'category') {
      return Promise.resolve(this.getPromptItems(element.parentKey!, element.key!));
    }
    
    return Promise.resolve([]);
  }

  private getSourceItems(): PromptItem[] {
    const sources = new Set(this.prompts.map((prompt) => this.getSourceLabel(prompt)));
    return Array.from(sources).sort().map((source) =>
      new PromptItem({} as PromptTemplate, 'source', source)
    );
  }

  /**
   * Get category items
   */
  private getCategoryItems(source: string): PromptItem[] {
    const categories = new Set(
      this.prompts
        .filter((prompt) => this.getSourceLabel(prompt) === source)
        .map((prompt) => prompt.category || 'General')
    );

    return Array.from(categories).sort().map((category) =>
      new PromptItem({} as PromptTemplate, 'category', category, source)
    );
  }

  /**
   * Get prompt items for a category
   */
  private getPromptItems(source: string, category: string): PromptItem[] {
    const categoryPrompts = this.prompts.filter(p => 
      this.getSourceLabel(p) === source &&
      (p.category || 'General') === category
    );
    
    return categoryPrompts.map(prompt => new PromptItem(prompt, 'prompt'));
  }

  private getSourceLabel(prompt: PromptTemplate): string {
    switch (prompt.source) {
      case 'team-pack':
        return 'Team Library';
      case 'workspace':
        return 'Workspace';
      case 'global':
        return 'Personal';
      case 'builtin':
        return 'Built-in';
      default:
        return 'Other';
    }
  }
}
