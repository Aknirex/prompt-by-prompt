/**
 * Tree View Provider for Project Rules
 * Displays rule files, active profiles, and currently resolved rules.
 */

import * as vscode from 'vscode';
import { RuleManager } from '../services/ruleManager';
import { RuleFile, RuleProfile, ResolvedRuleEntry, ResolvedRuleSet } from '../types/rule';
import { t } from '../utils/i18n';

class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleFile, options?: { active?: boolean; description?: string }) {
    super(rule.name, vscode.TreeItemCollapsibleState.None);

    this.tooltip = rule.path;

    if (rule.scope === 'global') {
      if (options?.active) {
        this.description = options.description || `(${t('Active')})`;
        this.contextValue = 'globalRuleItem_active';
        this.iconPath = new vscode.ThemeIcon('pass-filled', new vscode.ThemeColor('testing.iconPassed'));
      } else {
        this.description = options?.description || rule.path;
        this.contextValue = 'globalRuleItem';
        this.iconPath = new vscode.ThemeIcon('circle-outline');
      }
    } else {
      this.description = options?.description || (options?.active ? `(${t('Active')})` : rule.path);
      this.contextValue = 'workspaceRuleItem';
      this.iconPath = new vscode.ThemeIcon(options?.active ? 'shield' : 'shield');
    }

    this.command = {
      command: 'vscode.open',
      title: t('Edit Rule'),
      arguments: [vscode.Uri.file(rule.path)]
    };
  }
}

class RuleProfileItem extends vscode.TreeItem {
  constructor(public readonly profile: RuleProfile) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);
    this.description = profile.isActive
      ? `(${t('Active')})`
      : t('{0} global', profile.enabledRuleIds.length);
    this.contextValue = profile.isActive ? 'ruleProfileItem_active' : 'ruleProfileItem';
    this.iconPath = new vscode.ThemeIcon(profile.isActive ? 'layers-active' : 'layers');
    this.command = profile.isActive
      ? undefined
      : {
          command: 'pbp.setActiveRuleProfile',
          title: t('Set Active Rule Profile'),
          arguments: [this]
        };
  }
}

class RuleGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'profiles' | 'active' | 'workspace' | 'global'
  ) {
    super(t(label), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue =
      kind === 'profiles'
        ? 'ruleProfileGroup'
        : kind === 'active'
          ? 'activeRuleGroup'
          : kind === 'global'
            ? 'globalRuleGroup'
            : 'workspaceRuleGroup';
  }
}

type TreeElement = RuleGroupItem | RuleItem | RuleProfileItem;

export class RulesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> =
    new vscode.EventEmitter<TreeElement | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private workspaceRules: RuleFile[] = [];
  private globalRules: RuleFile[] = [];
  private ruleProfiles: RuleProfile[] = [];
  private resolvedRuleSet?: ResolvedRuleSet;

  constructor(private ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.workspaceRules = this.ruleManager.getWorkspaceRules();
    this.globalRules = this.ruleManager.getGlobalRules();
    this.ruleProfiles = this.ruleManager.getRuleProfiles();
    this.resolvedRuleSet = this.ruleManager.resolveRuleSet();
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeElement): Thenable<TreeElement[]> {
    if (element instanceof RuleGroupItem) {
      switch (element.kind) {
        case 'profiles':
          return Promise.resolve(this.ruleProfiles.map(profile => new RuleProfileItem(profile)));
        case 'active':
          return Promise.resolve((this.resolvedRuleSet?.activeEntries ?? []).map((entry: ResolvedRuleEntry) =>
            new RuleItem(entry.rule, { active: true, description: entry.reason })
          ));
        case 'workspace':
          return Promise.resolve(this.workspaceRules.map(rule => new RuleItem(rule)));
        case 'global': {
          const activeGlobalRuleIds = new Set(this.resolvedRuleSet?.globalRules.map(rule => rule.id) ?? []);
          return Promise.resolve(this.globalRules.map(rule => new RuleItem(rule, { active: activeGlobalRuleIds.has(rule.id) })));
        }
      }
    }

    if (element) {
      return Promise.resolve([]);
    }

    return Promise.resolve([
      new RuleGroupItem('Active Profile', 'profiles'),
      new RuleGroupItem('Active Rules', 'active'),
      new RuleGroupItem('Workspace Rules', 'workspace'),
      new RuleGroupItem('Global Rules', 'global')
    ]);
  }
}
