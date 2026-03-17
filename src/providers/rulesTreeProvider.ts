/**
 * Tree View Provider for Project Rules
 * Displays .agentrules files in VS Code sidebar
 */

import * as vscode from 'vscode';
import { RuleFile, RuleManager } from '../services/ruleManager';
import { t } from '../utils/i18n';

/**
 * Custom TreeItem for rules
 */
class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleFile) {
    super(rule.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = rule.path;
    
    // Assign specific context value for global vs workspace rules
    if (rule.isGlobal) {
      if (rule.isActive) {
        this.description = `(${t('Active')})`;
        this.contextValue = 'globalRuleItem_active';
        this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
      } else {
        this.description = rule.path;
        this.contextValue = 'globalRuleItem';
        this.iconPath = new vscode.ThemeIcon('circle-outline');
      }
    } else {
      this.description = rule.path;
      this.contextValue = 'workspaceRuleItem';
      this.iconPath = new vscode.ThemeIcon('shield');
    }

    this.command = {
      command: 'vscode.open',
      title: 'Edit Rule',
      arguments: [vscode.Uri.file(rule.path)]
    };
  }
}

class RuleGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly rules: RuleFile[],
    public readonly isGlobal: boolean
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = isGlobal ? 'globalRuleGroup' : 'workspaceRuleGroup';
    // Remove background icon for groups to make it cleaner like explorer
  }
}

type TreeElement = RuleGroupItem | RuleItem;

export class RulesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> =
    new vscode.EventEmitter<TreeElement | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private workspaceRules: RuleFile[] = [];
  private globalRules: RuleFile[] = [];

  constructor(private ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  /**
   * Refresh the tree view
   */
  refresh(): void {
    this.workspaceRules = this.ruleManager.getWorkspaceRules();
    this.globalRules = this.ruleManager.getGlobalRules();
    this._onDidChangeTreeData.fire();
  }

  /**
   * Get tree item for display
   */
  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  /**
   * Get children for a tree item
   */
  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    if (element instanceof RuleGroupItem) {
      return Promise.resolve(element.rules.map(rule => new RuleItem(rule)));
    }

    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      new RuleGroupItem(t('Workspace Rules'), this.workspaceRules, false),
      new RuleGroupItem(t('Global Rules'), this.globalRules, true)
    ]);
  }
}