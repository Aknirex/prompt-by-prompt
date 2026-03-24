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
    } else if (rule.scope === 'team-pack') {
      this.description = options?.description || `${rule.packId ?? 'team-pack'}${rule.required ? ' (required)' : ''}`;
      this.contextValue = 'teamRuleItem';
      this.iconPath = new vscode.ThemeIcon(options?.active ? 'shield' : 'library');
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

class PolicyInfoItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'policyInfoItem';
    this.iconPath = new vscode.ThemeIcon('pass');
  }
}

class RuleGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'policy' | 'profiles' | 'active' | 'workspace' | 'global' | 'team'
  ) {
    super(t(label), vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue =
      kind === 'policy'
        ? 'activePolicyGroup'
        : kind === 'profiles'
        ? 'ruleProfileGroup'
        : kind === 'active'
          ? 'activeRuleGroup'
          : kind === 'team'
            ? 'teamRuleGroup'
          : kind === 'global'
            ? 'globalRuleGroup'
            : 'workspaceRuleGroup';
  }
}

type TreeElement = RuleGroupItem | RuleItem | RuleProfileItem | PolicyInfoItem;

export class RulesTreeProvider implements vscode.TreeDataProvider<TreeElement> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeElement | undefined | null | void> =
    new vscode.EventEmitter<TreeElement | undefined | null | void>();

  readonly onDidChangeTreeData: vscode.Event<TreeElement | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private workspaceRules: RuleFile[] = [];
  private globalRules: RuleFile[] = [];
  private teamRules: RuleFile[] = [];
  private ruleProfiles: RuleProfile[] = [];
  private resolvedRuleSet?: ResolvedRuleSet;

  constructor(private ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.workspaceRules = this.ruleManager.getWorkspaceRules();
    this.globalRules = this.ruleManager.getGlobalRules();
    this.teamRules = this.ruleManager.getTeamPackRules();
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
        case 'policy': {
          const items: TreeElement[] = [];
          if (this.resolvedRuleSet?.binding) {
            items.push(new PolicyInfoItem('Binding Source', this.resolvedRuleSet.binding.source));
          }
          if (this.resolvedRuleSet?.policyVersion) {
            items.push(new PolicyInfoItem('Effective Pack', this.resolvedRuleSet.policyVersion.packId));
            items.push(new PolicyInfoItem('Policy Version', this.resolvedRuleSet.policyVersion.resolvedVersion ?? this.resolvedRuleSet.policyVersion.declaredVersion));
          }
          if (items.length === 0) {
            items.push(new PolicyInfoItem('Active Policy', 'Legacy workspace/global rules'));
          }
          return Promise.resolve(items);
        }
        case 'profiles':
          return Promise.resolve(this.ruleProfiles.map(profile => new RuleProfileItem(profile)));
        case 'active':
          return Promise.resolve((this.resolvedRuleSet?.activeEntries ?? []).map((entry: ResolvedRuleEntry) =>
            new RuleItem(entry.rule, { active: true, description: entry.reason })
          ));
        case 'team':
          return Promise.resolve(this.teamRules.map(rule => new RuleItem(rule)));
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
      new RuleGroupItem('Active Policy', 'policy'),
      new RuleGroupItem('Active Profile', 'profiles'),
      new RuleGroupItem('Active Rules', 'active'),
      new RuleGroupItem('Team Rules', 'team'),
      new RuleGroupItem('Workspace Rules', 'workspace'),
      new RuleGroupItem('Global Rules', 'global')
    ]);
  }
}
