import * as vscode from 'vscode';
import { RuleFile, RuleProfile, ResolvedRuleSet } from '../types/rule';
import { t } from '../utils/i18n';

type RulesTreeElement = RuleGroupItem | RuleItem | RuleProfileItem | PolicyInfoItem;

class RuleGroupItem extends vscode.TreeItem {
  constructor(label: string, public readonly kind: string) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'ruleGroup';
    this.iconPath = new vscode.ThemeIcon('folder');
  }
}

class PolicyInfoItem extends vscode.TreeItem {
  constructor(label: string, description?: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'policyInfoItem';
    this.iconPath = new vscode.ThemeIcon('info');
  }
}

class RuleItem extends vscode.TreeItem {
  constructor(public readonly rule: RuleFile, options?: { active?: boolean; description?: string }) {
    super(rule.name, vscode.TreeItemCollapsibleState.None);
    this.tooltip = rule.path;
    const isActive = options?.active ?? false;

    if (rule.scope === 'global') {
      this.description = options?.description ?? (isActive ? `(${t('Active')})` : rule.path);
      this.contextValue = isActive ? 'globalRuleItem_active' : 'globalRuleItem';
      this.iconPath = new vscode.ThemeIcon(
        isActive ? 'pass-filled' : 'circle-outline',
        isActive ? new vscode.ThemeColor('testing.iconPassed') : undefined
      );
    } else if (rule.scope === 'team-pack') {
      this.description = options?.description ?? `${rule.packId ?? 'team-pack'}${rule.required ? ' (required)' : ''}`;
      this.contextValue = 'teamRuleItem';
      this.iconPath = new vscode.ThemeIcon(isActive ? 'shield' : 'library');
    } else {
      this.description = options?.description ?? (isActive ? `(${t('Active')})` : rule.path);
      this.contextValue = 'workspaceRuleItem';
      this.iconPath = new vscode.ThemeIcon('shield');
    }

    this.command = { command: 'vscode.open', title: t('Edit Rule'), arguments: [vscode.Uri.file(rule.path)] };
  }
}

class RuleProfileItem extends vscode.TreeItem {
  constructor(public readonly profile: RuleProfile) {
    super(profile.name, vscode.TreeItemCollapsibleState.None);
    this.description = profile.isActive ? `(${t('Active')})` : `${profile.enabledRuleIds.length} rules`;
    this.contextValue = profile.isActive ? 'ruleProfileItem_active' : 'ruleProfileItem';
    this.iconPath = new vscode.ThemeIcon(profile.isActive ? 'layers-active' : 'layers');
    this.command = profile.isActive ? undefined : {
      command: 'pbp.setActiveProfile',
      title: t('Set Active Profile'),
      arguments: [{ profile }],
    };
  }
}

export class RulesTreeProvider implements vscode.TreeDataProvider<RulesTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RulesTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private workspaceRules: RuleFile[] = [];
  private globalRules: RuleFile[] = [];
  private teamRules: RuleFile[] = [];
  private ruleProfiles: RuleProfile[] = [];
  private resolvedRuleSet: ResolvedRuleSet | undefined;

  update(data: {
    workspaceRules: RuleFile[];
    globalRules: RuleFile[];
    teamRules: RuleFile[];
    profiles: RuleProfile[];
    resolved: ResolvedRuleSet | undefined;
  }): void {
    this.workspaceRules = data.workspaceRules;
    this.globalRules = data.globalRules;
    this.teamRules = data.teamRules;
    this.ruleProfiles = data.profiles;
    this.resolvedRuleSet = data.resolved;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RulesTreeElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RulesTreeElement): RulesTreeElement[] {
    if (element instanceof RuleGroupItem) {
      switch (element.kind) {
        case 'policy': {
          const binding = this.resolvedRuleSet?.binding;
          if (!binding) return [new PolicyInfoItem('No active binding', 'Using workspace/global rules')];
          return [
            new PolicyInfoItem('Pack', binding.packId),
            new PolicyInfoItem('Profile', binding.profileId ?? 'none'),
          ];
        }
        case 'profiles':
          return this.ruleProfiles.map(p => new RuleProfileItem(p));
        case 'active': {
          const entries = this.resolvedRuleSet?.activeEntries ?? [];
          return entries.map(e => new RuleItem(e.rule, { active: true, description: e.reason }));
        }
        case 'team':
          return this.teamRules.map(r => new RuleItem(r));
        case 'workspace':
          return this.workspaceRules.map(r => new RuleItem(r));
        case 'global': {
          const activeIds = new Set(this.resolvedRuleSet?.globalRules.map(r => r.id) ?? []);
          return this.globalRules.map(r => new RuleItem(r, { active: activeIds.has(r.id) }));
        }
      }
    }
    if (!element) {
      return [
        new RuleGroupItem('Active Policy', 'policy'),
        new RuleGroupItem('Active Profile', 'profiles'),
        new RuleGroupItem('Active Rules', 'active'),
        new RuleGroupItem('Team Rules', 'team'),
        new RuleGroupItem('Workspace Rules', 'workspace'),
        new RuleGroupItem('Global Rules', 'global'),
      ];
    }
    return [];
  }
}
