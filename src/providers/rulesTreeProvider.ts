/**
 * Tree View Provider for Project Rules
 * Keeps the rules view focused on what is actually useful:
 * activated rules, project rules, and local personal rules.
 */

import * as vscode from 'vscode';
import { RuleManager } from '../services/ruleManager';
import { RuleFile, ResolvedRuleConflict, ResolvedRuleSet } from '../types/rule';
import { t } from '../utils/i18n';

class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleFile, options?: { active?: boolean; description?: string }) {
    super(rule.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = rule.path;

    if (rule.scope === 'workspace') {
      this.description = options?.description || (options?.active ? t('Project') : rule.path);
      this.contextValue = 'workspaceRuleItem';
      this.iconPath = new vscode.ThemeIcon(options?.active ? 'shield' : 'file');
    } else if (rule.scope === 'global') {
      this.description = options?.description || (options?.active ? t('Personal') : rule.path);
      this.contextValue = 'globalRuleItem';
      this.iconPath = new vscode.ThemeIcon(options?.active ? 'pass-filled' : 'circle-outline', options?.active ? new vscode.ThemeColor('testing.iconPassed') : undefined);
    } else {
      this.description = options?.description || `${rule.packId ?? 'shared'}${rule.required ? ` (${t('required')})` : ''}`;
      this.contextValue = 'teamRuleItem';
      this.iconPath = new vscode.ThemeIcon(options?.active ? 'shield' : 'library');
    }

    this.command = {
      command: 'vscode.open',
      title: t('Edit Rule'),
      arguments: [vscode.Uri.file(rule.path)],
    };
  }
}

class InfoItem extends vscode.TreeItem {
  constructor(label: string, description?: string, icon: string = 'info') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'ruleInfoItem';
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

class ConflictItem extends vscode.TreeItem {
  constructor(conflict: ResolvedRuleConflict) {
    super(conflict.message, vscode.TreeItemCollapsibleState.None);
    this.description = conflict.type.replace(/-/g, ' ');
    this.contextValue = 'ruleConflictItem';
    this.tooltip = conflict.ruleIds.join(', ');
    this.iconPath = new vscode.ThemeIcon('warning');
  }
}

class RuleGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'workspace' | 'global'
  ) {
    super(t(label), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = kind === 'workspace'
      ? 'projectRuleGroup'
      : 'personalRuleGroup';
  }
}

type TreeElement = RuleGroupItem | RuleItem | InfoItem | ConflictItem;

export class RulesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<TreeElement | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRules: RuleFile[] = [];
  private globalRules: RuleFile[] = [];
  private resolvedRuleSet?: ResolvedRuleSet;

  constructor(private readonly ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.workspaceRules = this.ruleManager.getWorkspaceRules();
    this.globalRules = this.ruleManager.getGlobalRules();
    this.resolvedRuleSet = this.ruleManager.resolveRuleSet();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    if (element instanceof RuleGroupItem) {
      switch (element.kind) {
        case 'workspace':
          return Promise.resolve(this.workspaceRules.map((rule) => new RuleItem(rule)));
        case 'global': {
          const activeGlobalRuleIds = new Set(this.resolvedRuleSet?.globalRules.map((rule) => rule.id) ?? []);
          return Promise.resolve(this.globalRules.map((rule) =>
            new RuleItem(rule, { active: activeGlobalRuleIds.has(rule.id) })
          ));
        }
      }
    }

    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve(this.getRootItems());
  }

  private getRootItems(): TreeElement[] {
    const resolved = this.resolvedRuleSet;
    if (!resolved) {
      return [new InfoItem('No rules resolved yet', 'Open a file or refresh to evaluate the current rule set')];
    }

    const items: TreeElement[] = [
      new InfoItem('Active rules', `${resolved.activeEntries.length} rule(s)`, 'pass'),
    ];

    if ((resolved.conflicts ?? []).length > 0) {
      items.push(new InfoItem('Conflicts', `${resolved.conflicts.length} issue(s)`, 'warning'));
      items.push(...resolved.conflicts.map((conflict) => new ConflictItem(conflict)));
    } else {
      items.push(new InfoItem('Conflicts', 'None', 'pass'));
    }

    items.push(...resolved.activeEntries.map((entry) => new RuleItem(entry.rule, { active: true, description: entry.reason })));

    if (this.workspaceRules.length > 0) {
      items.push(new RuleGroupItem('Project Rules', 'workspace'));
    }

    if (this.globalRules.length > 0) {
      items.push(new RuleGroupItem('Personal Rules', 'global'));
    }

    return items;
  }

}
