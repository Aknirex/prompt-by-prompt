/**
 * Tree View Provider for Project Rules
 * Displays .agentrules files in VS Code sidebar
 */

import * as vscode from 'vscode';
import { RuleFile, RuleManager } from '../services/ruleManager';

/**
 * Custom TreeItem for rules
 */
class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleFile) {
    super(rule.name, vscode.TreeItemCollapsibleState.None);
    
    this.tooltip = rule.path;
    this.description = rule.path;
    this.contextValue = 'rule';
    this.iconPath = new vscode.ThemeIcon('shield');
    
    this.command = {
      command: 'vscode.open',
      title: 'Edit Rule',
      arguments: [vscode.Uri.file(rule.path)]
    };
  }
}

export class RulesTreeProvider implements vscode.TreeDataProvider<RuleItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<RuleItem | undefined | null | void> = 
    new vscode.EventEmitter<RuleItem | undefined | null | void>();
  
  readonly onDidChangeTreeData: vscode.Event<RuleItem | undefined | null | void> = 
    this._onDidChangeTreeData.event;

  private rules: RuleFile[] = [];

  constructor(private ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.rules = this.ruleManager.getRuleFiles();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: RuleItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  getChildren(element?: RuleItem): Thenable<RuleItem[]> {
    if (element) {
      return Promise.resolve([]);
    }
    
    return Promise.resolve(this.rules.map(rule => new RuleItem(rule)));
  }
}
