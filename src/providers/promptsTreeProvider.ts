/**
 * Tree View Provider for Prompts
 * Displays prompts grouped by category in VS Code sidebar
 */

import * as vscode from 'vscode';
import { PromptTemplate } from '../types/prompt';

/**
 * Custom TreeItem for prompts
 */
class PromptItem extends vscode.TreeItem {
  constructor(
    public readonly prompt: PromptTemplate,
    public readonly isCategory: boolean = false,
    public readonly category?: string
  ) {
    super(
      isCategory ? category! : prompt.name,
      isCategory 
        ? vscode.TreeItemCollapsibleState.Collapsed 
        : vscode.TreeItemCollapsibleState.None
    );

    if (!isCategory) {
      this.description = prompt.description.substring(0, 50) + 
        (prompt.description.length > 50 ? '...' : '');
      
      this.tooltip = this.createTooltip(prompt);
      this.contextValue = 'prompt';
      this.iconPath = this.getIconForCategory(prompt.category);
      this.command = {
        command: 'pbp.runPrompt',
        title: 'Run Prompt',
        arguments: [prompt]
      };
    } else {
      this.contextValue = 'category';
      this.iconPath = new vscode.ThemeIcon('folder');
    }
  }

  private createTooltip(prompt: PromptTemplate): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    
    md.appendMarkdown(`**${prompt.name}**\n\n`);
    md.appendMarkdown(`${prompt.description}\n\n`);
    
    if (prompt.tags.length > 0) {
      md.appendMarkdown(`**Tags:** ${prompt.tags.join(', ')}\n\n`);
    }
    
    if (prompt.author) {
      md.appendMarkdown(`**Author:** ${prompt.author}\n\n`);
    }
    
    md.appendMarkdown(`**Source:** ${prompt.source || 'unknown'}`);
    
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
      // Root level - return categories
      return Promise.resolve(this.getCategoryItems());
    } else if (element.isCategory) {
      // Category level - return prompts in this category
      return Promise.resolve(this.getPromptItems(element.category!));
    }
    
    return Promise.resolve([]);
  }

  /**
   * Get category items
   */
  private getCategoryItems(): PromptItem[] {
    const categories = new Set(this.prompts.map(p => p.category || 'General'));
    
    return Array.from(categories).map(category => 
      new PromptItem({} as PromptTemplate, true, category)
    );
  }

  /**
   * Get prompt items for a category
   */
  private getPromptItems(category: string): PromptItem[] {
    const categoryPrompts = this.prompts.filter(p => 
      (p.category || 'General') === category
    );
    
    return categoryPrompts.map(prompt => new PromptItem(prompt));
  }
}
