import * as vscode from 'vscode';
import { RuleManager } from '../services/ruleManager';
import { ResolvedRuleSet } from '../types/rule';
import { TeamPolicyPack, TeamPolicySourceState } from '../types/teamPolicy';

class TeamPoliciesGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'sources' | 'binding' | 'packs'
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue =
      kind === 'sources'
        ? 'teamPolicySourceGroup'
        : kind === 'binding'
          ? 'teamPolicyBindingGroup'
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
    this.tooltip = sourceState.lastSyncError || sourceState.lastSyncedAt || sourceState.type;
    this.contextValue = 'teamPolicySourceItem';
    this.iconPath = new vscode.ThemeIcon(
      sourceState.status === 'synced' ? 'pass-filled' : 'warning',
      sourceState.status === 'synced'
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('problemsWarningIcon.foreground')
    );
    this.command = {
      command: 'pbp.retryTeamPolicySourceSync',
      title: 'Retry Team Policy Source Sync',
      arguments: [this],
    };
  }
}

class TeamPolicyPackItem extends vscode.TreeItem {
  constructor(public readonly pack: TeamPolicyPack) {
    super(pack.name, vscode.TreeItemCollapsibleState.None);
    this.description = `${pack.rules.length} rules, ${pack.prompts.length} prompts`;
    this.tooltip = this.buildTooltip(pack);
    this.contextValue = 'teamPolicyPackItem';
    this.iconPath = new vscode.ThemeIcon(
      pack.status === 'active' ? 'package' : 'warning',
      pack.status === 'active'
        ? undefined
        : new vscode.ThemeColor('problemsWarningIcon.foreground')
    );
  }

  private buildTooltip(pack: TeamPolicyPack): string {
    const version = pack.resolvedVersion ?? pack.version;
    const lines = [
      pack.name,
      `Pack ID: ${pack.id}`,
      `Version: ${version}`,
      `Rules: ${pack.rules.length}`,
      `Prompts: ${pack.prompts.length}`,
      `Profiles: ${pack.profiles.length}`,
    ];

    if (pack.description) {
      lines.push('', pack.description);
    }

    return lines.join('\n');
  }
}

type TeamPoliciesElement =
  | TeamPoliciesGroupItem
  | TeamPolicyInfoItem
  | TeamPolicySourceItem
  | TeamPolicyPackItem;

export class TeamPoliciesTreeProvider implements vscode.TreeDataProvider<TeamPoliciesElement> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TeamPoliciesElement | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private sourceStates: TeamPolicySourceState[] = [];
  private installedPacks: TeamPolicyPack[] = [];
  private resolvedRuleSet?: ResolvedRuleSet;

  constructor(private readonly ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.sourceStates = this.ruleManager.getTeamPolicySourceStates();
    this.installedPacks = this.ruleManager.getInstalledTeamPacks();
    this.resolvedRuleSet = this.ruleManager.resolveRuleSet();
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: TeamPoliciesElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TeamPoliciesElement): Thenable<TeamPoliciesElement[]> {
    if (!element) {
      return Promise.resolve([
        new TeamPoliciesGroupItem('Sync Sources', 'sources'),
        new TeamPoliciesGroupItem('Workspace Binding', 'binding'),
        new TeamPoliciesGroupItem('Installed Packs', 'packs'),
      ]);
    }

    if (element instanceof TeamPoliciesGroupItem) {
      switch (element.kind) {
        case 'sources':
          return Promise.resolve(this.getSourceItems());
        case 'binding':
          return Promise.resolve(this.getBindingItems());
        case 'packs':
          return Promise.resolve(this.getPackItems());
      }
    }

    return Promise.resolve([]);
  }

  private getSourceItems(): TeamPoliciesElement[] {
    if (this.sourceStates.length === 0) {
      return [new TeamPolicyInfoItem('No team policy sources', 'Use Connect Team Policy Source to add one', 'plug')];
    }

    return this.sourceStates.map((state) => new TeamPolicySourceItem(state));
  }

  private getBindingItems(): TeamPoliciesElement[] {
    const binding = this.resolvedRuleSet?.binding;
    const version = this.resolvedRuleSet?.policyVersion;
    const items: TeamPoliciesElement[] = [];

    if (!binding?.packId) {
      items.push(new TeamPolicyInfoItem('No active team binding', 'Using workspace/global rules only', 'circle-slash'));
      return items;
    }

    items.push(new TeamPolicyInfoItem('Pack', binding.packId, 'package'));
    items.push(new TeamPolicyInfoItem('Profile', binding.profileId ?? 'none', 'layers'));
    items.push(new TeamPolicyInfoItem('Binding Source', binding.source, 'link'));
    items.push(new TeamPolicyInfoItem('Personal Overrides', binding.allowPersonalOverrides ? 'allowed' : 'blocked', 'person'));

    if (version) {
      items.push(new TeamPolicyInfoItem('Resolved Version', version.resolvedVersion ?? version.declaredVersion, 'git-commit'));
    }

    return items;
  }

  private getPackItems(): TeamPoliciesElement[] {
    if (this.installedPacks.length === 0) {
      return [new TeamPolicyInfoItem('No installed packs', 'Sync a team policy source to load shared prompts and rules', 'package')];
    }

    return this.installedPacks.map((pack) => new TeamPolicyPackItem(pack));
  }
}
