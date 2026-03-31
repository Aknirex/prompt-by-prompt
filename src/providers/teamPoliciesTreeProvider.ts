import * as path from 'path';
import * as vscode from 'vscode';
import { RuleManager } from '../services/ruleManager';
import { SharedLibrarySummary, TeamPolicyPack, TeamPolicySourceState } from '../types/teamPolicy';

class SharedLibrariesGroupItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'sources' | 'libraries'
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue =
      kind === 'sources'
        ? 'sharedLibrarySourceGroup'
        : 'sharedLibraryLibraryGroup';
  }
}

class SharedLibrarySectionItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly kind: 'rules' | 'prompts',
    public readonly entries: TeamPolicyPack['rules'] | TeamPolicyPack['prompts']
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.contextValue = kind === 'rules'
      ? 'sharedLibraryRulesGroup'
      : 'sharedLibraryPromptsGroup';
    this.iconPath = new vscode.ThemeIcon(kind === 'rules' ? 'symbol-constant' : 'symbol-string');
  }
}

class SharedLibraryActionItem extends vscode.TreeItem {
  constructor(label: string, description: string, command: vscode.Command) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'sharedLibraryActionItem';
    this.iconPath = new vscode.ThemeIcon('edit');
    this.command = command;
  }
}

class SharedLibraryInfoItem extends vscode.TreeItem {
  constructor(label: string, description?: string, icon = 'info') {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = description;
    this.contextValue = 'sharedLibraryInfoItem';
    this.iconPath = new vscode.ThemeIcon(icon);
  }
}

class SharedLibrarySourceItem extends vscode.TreeItem {
  constructor(public readonly sourceState: TeamPolicySourceState) {
    super(sourceState.sourceId, vscode.TreeItemCollapsibleState.None);
    this.description = sourceState.status === 'synced'
      ? (sourceState.lastSyncedAt ? `synced ${sourceState.lastSyncedAt}` : 'synced')
      : 'sync issue';
    this.tooltip = sourceState.lastSyncError || sourceState.lastSyncedAt || sourceState.type;
    this.contextValue = 'sharedLibrarySourceItem';
    this.iconPath = new vscode.ThemeIcon(
      sourceState.status === 'synced' ? 'pass-filled' : 'warning',
      sourceState.status === 'synced'
        ? new vscode.ThemeColor('testing.iconPassed')
        : new vscode.ThemeColor('problemsWarningIcon.foreground')
    );
    this.command = {
      command: 'pbp.retryTeamPolicySourceSync',
      title: 'Retry Shared Source Sync',
      arguments: [this],
    };
  }
}

class SharedLibraryRuleItem extends vscode.TreeItem {
  constructor(
    rule: TeamPolicyPack['rules'][number],
    pack?: SharedLibrarySummary
  ) {
    super(rule.ruleId, vscode.TreeItemCollapsibleState.None);
    this.description = rule.canonicalKey;
    this.tooltip = [
      `Library: ${pack?.name ?? 'Shared Library'}`,
      `Rule ID: ${rule.ruleId}`,
      `Canonical Key: ${rule.canonicalKey}`,
    ].join('\n');
    this.contextValue = 'sharedLibraryRuleItem';
    this.iconPath = new vscode.ThemeIcon('file-code');
  }
}

class SharedLibraryPromptItem extends vscode.TreeItem {
  constructor(
    prompt: TeamPolicyPack['prompts'][number],
    pack?: SharedLibrarySummary
  ) {
    super(prompt.name, vscode.TreeItemCollapsibleState.None);
    this.description = prompt.category || 'Shared Library';
    this.tooltip = [
      `Library: ${pack?.name ?? 'Shared Library'}`,
      `Prompt ID: ${prompt.id}`,
      prompt.description || '',
    ].filter(Boolean).join('\n');
    this.contextValue = 'sharedLibraryPromptItem';
    this.iconPath = new vscode.ThemeIcon('comment-discussion');
  }
}

class SharedLibraryPackItem extends vscode.TreeItem {
  constructor(
    public readonly library: SharedLibrarySummary,
    public readonly pack?: TeamPolicyPack
  ) {
    super(library.name, vscode.TreeItemCollapsibleState.Collapsed);
    this.description = `${library.ruleCount} rules, ${library.promptCount} prompts`;
    this.tooltip = this.buildTooltip(library);
    this.contextValue = 'sharedLibraryPackItem';
    this.iconPath = new vscode.ThemeIcon(
      library.status === 'active' ? 'package' : 'warning',
      library.status === 'active'
        ? undefined
        : new vscode.ThemeColor('problemsWarningIcon.foreground')
    );
  }

  private buildTooltip(library: SharedLibrarySummary): string {
    const version = library.resolvedVersion ?? library.version;
    const lines = [
      library.name,
      `Library ID: ${library.id}`,
      `Version: ${version}`,
      `Rules: ${library.ruleCount}`,
      `Prompts: ${library.promptCount}`,
      `Source: ${library.sourceId}`,
      `Status: ${library.status}`,
    ];

    if (library.description) {
      lines.push('', library.description);
    }

    return lines.join('\n');
  }
}

type TeamPoliciesElement =
  | SharedLibrariesGroupItem
  | SharedLibrarySectionItem
  | SharedLibraryInfoItem
  | SharedLibraryActionItem
  | SharedLibrarySourceItem
  | SharedLibraryPackItem
  | SharedLibraryRuleItem
  | SharedLibraryPromptItem;

export class TeamPoliciesTreeProvider implements vscode.TreeDataProvider<TeamPoliciesElement> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TeamPoliciesElement | undefined | null | void>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  private sourceStates: TeamPolicySourceState[] = [];
  private installedLibraries: SharedLibrarySummary[] = [];
  private installedPackMap = new Map<string, TeamPolicyPack>();

  constructor(private readonly ruleManager: RuleManager) {
    this.ruleManager.onDidChange(() => this.refresh());
  }

  refresh(): void {
    this.sourceStates = this.ruleManager.getTeamPolicySourceStates();
    this.installedLibraries = this.ruleManager.getSharedLibrarySummaries();
    this.installedPackMap = new Map(
      this.ruleManager.getInstalledTeamPacks().map((pack) => [pack.id, pack])
    );
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: TeamPoliciesElement): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TeamPoliciesElement): Thenable<TeamPoliciesElement[]> {
    if (!element) {
      return Promise.resolve([
        new SharedLibrariesGroupItem('Sync Sources', 'sources'),
        new SharedLibrariesGroupItem('Shared Libraries', 'libraries'),
      ]);
    }

    if (element instanceof SharedLibrariesGroupItem) {
      switch (element.kind) {
        case 'sources':
          return Promise.resolve(this.getSourceItems());
        case 'libraries':
          return Promise.resolve(this.getLibraryItems());
      }
    }

    if (element instanceof SharedLibraryPackItem) {
      return Promise.resolve(this.getPackChildren(element));
    }

    if (element instanceof SharedLibrarySectionItem) {
      if (element.kind === 'rules') {
        return Promise.resolve((element.entries as TeamPolicyPack['rules']).map((rule) => new SharedLibraryRuleItem(rule)));
      }

      return Promise.resolve((element.entries as TeamPolicyPack['prompts']).map((prompt) => new SharedLibraryPromptItem(prompt)));
    }

    return Promise.resolve([]);
  }

  private getSourceItems(): TeamPoliciesElement[] {
    if (this.sourceStates.length === 0) {
      return [new SharedLibraryInfoItem('No shared library sources', 'Use Connect Shared Source to add one', 'plug')];
    }

    return this.sourceStates.map((state) => new SharedLibrarySourceItem(state));
  }

  private getLibraryItems(): TeamPoliciesElement[] {
    if (this.installedLibraries.length === 0) {
      return [new SharedLibraryInfoItem('No shared libraries', 'Sync a source to load prompts and rules', 'package')];
    }

    return this.installedLibraries.map((library) => {
      const pack = this.installedPackMap.get(library.id);
      return new SharedLibraryPackItem(library, pack);
    });
  }

  private getPackChildren(item: SharedLibraryPackItem): TeamPoliciesElement[] {
    const pack = item.pack;
    if (!pack) {
      return [
        new SharedLibraryInfoItem('Library metadata unavailable', 'Refresh the source to reload this library', 'warning'),
      ];
    }

    const version = item.library.resolvedVersion ?? item.library.version;
    const children: TeamPoliciesElement[] = [
      new SharedLibraryInfoItem('Version', version, 'tag'),
      new SharedLibraryInfoItem('Source', item.library.sourceId, 'link'),
      new SharedLibraryInfoItem('Status', item.library.status, item.library.status === 'active' ? 'pass-filled' : 'warning'),
      new SharedLibraryInfoItem('Trust', item.library.trust, item.library.trust === 'trusted' ? 'shield' : 'warning'),
      new SharedLibraryInfoItem('Path', item.library.sourcePath, 'folder'),
      new SharedLibraryActionItem('Open Manifest', 'Inspect pack.json for this library', {
        command: 'vscode.open',
        title: 'Open Manifest',
        arguments: [vscode.Uri.file(path.join(item.library.sourcePath, 'pack.json'))],
      }),
      new SharedLibraryActionItem('Reveal Source Folder', 'Open the library folder in your file explorer', {
        command: 'revealFileInOS',
        title: 'Reveal Source Folder',
        arguments: [vscode.Uri.file(item.library.sourcePath)],
      }),
    ];

    if (pack.rules.length > 0) {
      children.push(new SharedLibrarySectionItem(`Rules (${pack.rules.length})`, 'rules', pack.rules));
    }

    if (pack.prompts.length > 0) {
      children.push(new SharedLibrarySectionItem(`Prompts (${pack.prompts.length})`, 'prompts', pack.prompts));
    }

    return children;
  }
}
