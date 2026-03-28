import * as vscode from 'vscode';
import { TeamPolicyPack, TeamPolicySourceState } from '../types/teamPolicy';
import { ResolvedRuleSet } from '../types/rule';

type TeamPoliciesElement = TeamPoliciesGroupItem | TeamPolicySourceItem | TeamPolicyPackItem | TeamPolicyInfoItem;

class TeamPoliciesGroupItem extends vscode.TreeItem {
  constructor(label: string, public readonly kind: 'sources' | 'binding' | 'packs') {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = kind === 'sources' ? 'teamPolicySourceGroup'
      : kind === 'binding' ? 'teamPolicyBindingGroup'
      : 'teamPolicyPackGroup';
  }
}

class TeamPolicyInfoItem extends vscode.TreeItem {
  constructor(label: string, description?: string, icon = 'info') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'teamPolicyInfoItem';
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

class TeamPolicySourceItem extends vscode.TreeItem {
  constructor(public readonly sourceState: TeamPolicySourceState) {
    super(sourceState.sourceId, vscode.TreeItemCollapsibleState.None);
    this.description = sourceState.status === 'synced'
      ? (sourceState.lastSyncedAt ? `synced ${sourceState.lastSyncedAt}` : 'synced')
      : 'sync issue';
    this.tooltip = sourceState.lastSyncError ?? sourceState.lastSyncedAt ?? sourceState.type;
    this.contextValue = 'teamPolicySourceItem';
    this.iconPath = new vscode.ThemeIcon(
      sourceState.status === 'synced' ? 'pass-filled' : 'warning',
      sourceState.status === 'synced'
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('problemsWarningIcon.foreground')
    );
    this.command = { command: 'pbp.retryTeamPolicySourceSync', title: 'Retry Sync', arguments: [{ sourceState }] };
  }
}

class TeamPolicyPackItem extends vscode.TreeItem {
  constructor(public readonly pack: TeamPolicyPack) {
    super(pack.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${pack.rules.length} rules, ${pack.prompts.length} prompts`;
    this.contextValue = 'teamPolicyPackItem';
    this.iconPath = new vscode.ThemeIcon('package');
    this.tooltip = `Version: ${pack.version ?? 'unknown'}`;
  }
}

export class TeamPoliciesTreeProvider implements vscode.TreeDataProvider<TeamPoliciesElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<TeamPoliciesElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sourceStates: TeamPolicySourceState[] = [];
  private resolvedRuleSet: ResolvedRuleSet | undefined;
  private installedPacks: TeamPolicyPack[] = [];

  update(sourceStates: TeamPolicySourceState[], resolvedRuleSet: ResolvedRuleSet | undefined, installedPacks: TeamPolicyPack[]): void {
    this.sourceStates = sourceStates;
    this.resolvedRuleSet = resolvedRuleSet;
    this.installedPacks = installedPacks;
    this._onDidChangeTreeData.fire();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TeamPoliciesElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TeamPoliciesElement): TeamPoliciesElement[] {
    if (element instanceof TeamPoliciesGroupItem) {
      switch (element.kind) {
        case 'sources': return this.getSourceItems();
        case 'binding': return this.getBindingItems();
        case 'packs': return this.getPackItems();
      }
    }
    if (!element) {
      return [
        new TeamPoliciesGroupItem('Sources', 'sources'),
        new TeamPoliciesGroupItem('Active Binding', 'binding'),
        new TeamPoliciesGroupItem('Installed Packs', 'packs'),
      ];
    }
    return [];
  }

  private getSourceItems(): TeamPoliciesElement[] {
    if (this.sourceStates.length === 0) {
      return [new TeamPolicyInfoItem('No team policy sources', 'Use Connect Team Policy Source to add one', 'plug')];
    }
    return this.sourceStates.map(s => new TeamPolicySourceItem(s));
  }

  private getBindingItems(): TeamPoliciesElement[] {
    const binding = this.resolvedRuleSet?.binding;
    if (!binding?.packId) {
      return [new TeamPolicyInfoItem('No active team binding', 'Using workspace/global rules only', 'circle-slash')];
    }
    return [
      new TeamPolicyInfoItem('Pack', binding.packId, 'package'),
      new TeamPolicyInfoItem('Profile', binding.profileId ?? 'none', 'layers'),
      new TeamPolicyInfoItem('Source', binding.source, 'link'),
      new TeamPolicyInfoItem('Personal Overrides', binding.allowPersonalOverrides ? 'allowed' : 'blocked', 'person'),
    ];
  }

  private getPackItems(): TeamPoliciesElement[] {
    if (this.installedPacks.length === 0) {
      return [new TeamPolicyInfoItem('No installed packs', 'Sync a team policy source to load shared prompts and rules', 'package')];
    }
    return this.installedPacks.map(p => new TeamPolicyPackItem(p));
  }
}
