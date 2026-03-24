/**
 * Rule Manager Service
 * Manages workspace and global rule files with explicit refresh only.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentType } from '../types/agent';
import { RuleFile, RuleFormat, RuleProfile, ResolvedRuleConflict, ResolvedRuleEntry, ResolvedRuleSet } from '../types/rule';
import { t } from '../utils/i18n';

export const KNOWN_RULE_FILES = [
  'AGENTS.md',
  '.clinerules',
  '.cursorrules',
  '.windsurfrules',
  '.aiderrules',
  '.codeiumrules'
];

export class RuleManager {
  private static readonly ACTIVE_PROFILE_KEY = 'pbp.activeRuleProfileId';

  private onDidChangeRules: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChange = this.onDidChangeRules.event;
  private ruleFiles: RuleFile[] = [];
  private ruleProfiles: RuleProfile[] = [];
  private isScanning = false;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.initialize();
  }

  public async initialize() {
    await this.scanRuleFiles();
  }

  public async scanRuleFiles(): Promise<RuleFile[]> {
    if (this.isScanning) {
      return this.ruleFiles;
    }

    this.isScanning = true;

    try {
      const newRuleFiles: RuleFile[] = [];

      if (vscode.workspace.workspaceFolders) {
        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

        for (const fileName of KNOWN_RULE_FILES) {
          const filePath = path.join(rootPath, fileName);
          if (!fs.existsSync(filePath)) {
            continue;
          }

          try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            newRuleFiles.push(this.createRuleFileRecord(fileName, filePath, content, 'workspace'));
          } catch (error) {
            console.error(`Error reading ${fileName}`, error);
          }
        }
      }

      const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
      const legacyGlobalRulePath = path.join(this.context.globalStorageUri.fsPath, 'global-rules.md');
      if (fs.existsSync(legacyGlobalRulePath)) {
        fs.mkdirSync(globalRulesDir, { recursive: true });
        const migratedPath = path.join(globalRulesDir, 'default-rules.md');
        if (!fs.existsSync(migratedPath)) {
          fs.renameSync(legacyGlobalRulePath, migratedPath);
          await this.context.globalState.update('pbp.activeGlobalRule', migratedPath);
        }
      }

      const globalRuleFiles = fs.existsSync(globalRulesDir)
        ? fs.readdirSync(globalRulesDir).filter(file => file.endsWith('.md'))
        : [];

      let activeRulePath = this.context.globalState.get<string>('pbp.activeGlobalRule');
      if ((!activeRulePath || !fs.existsSync(activeRulePath)) && globalRuleFiles.length > 0) {
        activeRulePath = path.join(globalRulesDir, globalRuleFiles[0]);
        await this.context.globalState.update('pbp.activeGlobalRule', activeRulePath);
      }

      for (const fileName of globalRuleFiles) {
        const filePath = path.join(globalRulesDir, fileName);
        try {
          const content = await fs.promises.readFile(filePath, 'utf-8');
          newRuleFiles.push(this.createRuleFileRecord(fileName, filePath, content, 'global'));
        } catch (error) {
          console.error(`Error reading global rule ${fileName}`, error);
        }
      }

      this.ruleFiles = newRuleFiles;
      await this.refreshProfiles(activeRulePath);
      this.onDidChangeRules.fire();
      return this.ruleFiles;
    } finally {
      this.isScanning = false;
    }
  }

  public getRuleFiles(): RuleFile[] {
    return this.ruleFiles;
  }

  public getWorkspaceRules(): RuleFile[] {
    return this.ruleFiles.filter(rule => rule.scope === 'workspace');
  }

  public getGlobalRules(): RuleFile[] {
    return this.ruleFiles.filter(rule => rule.scope === 'global');
  }

  public getRuleProfiles(): RuleProfile[] {
    return this.ruleProfiles;
  }

  public getActiveProfile(): RuleProfile | undefined {
    return this.ruleProfiles.find(profile => profile.isActive) ?? this.ruleProfiles[0];
  }

  public getActiveGlobalRule(): RuleFile | undefined {
    const profile = this.getActiveProfile();
    if (!profile) {
      return undefined;
    }

    return this.getGlobalRules().find(rule => profile.enabledRuleIds.includes(rule.id));
  }

  public resolveRuleSet(options?: {
    agentType?: AgentType;
    supportsStructuredContext?: boolean;
  }): ResolvedRuleSet {
    const profile = this.getActiveProfile() ?? {
      id: 'workspace-only',
      name: 'Workspace Only',
      enabledRuleIds: [],
      priority: 0,
      isActive: true,
    };
    const workspaceRules = this.getWorkspaceRules();
    const globalRules = this.getGlobalRules().filter(rule => profile.enabledRuleIds.includes(rule.id));
    const activeEntries = [...workspaceRules, ...globalRules]
      .filter(rule => this.appliesToAgent(rule, options?.agentType))
      .map(rule => this.createResolvedRuleEntry(rule, profile, options?.agentType));
    const activeRules = activeEntries.map(entry => entry.rule);
    const conflicts = this.detectConflicts(activeRules);
    const notes: string[] = [];

    notes.push(`Active profile: ${profile.name}`);
    if (options?.agentType) {
      notes.push(`Resolved for agent: ${options.agentType}`);
    }
    notes.push(
      `Injection mode: ${options?.supportsStructuredContext ? 'structured context when adapter support is added' : 'text fallback'}`
    );
    if (workspaceRules.length > 0) {
      notes.push(`Workspace rules: ${workspaceRules.length}`);
    }
    if (globalRules.length > 0) {
      notes.push(`Global rules: ${globalRules.length}`);
    }
    if (conflicts.length > 0) {
      notes.push('Potential rule conflicts detected. Review the conflict section below.');
    }

    return {
      profile,
      workspaceRules,
      globalRules,
      activeRules,
      activeEntries,
      injectionMode: options?.supportsStructuredContext ? 'structured-context' : 'text-fallback',
      notes,
      conflicts,
    };
  }

  public async setActiveRuleProfile(profileId: string): Promise<void> {
    await this.context.globalState.update(RuleManager.ACTIVE_PROFILE_KEY, profileId);
    await this.refreshProfiles();
    this.onDidChangeRules.fire();
  }

  public async setActiveGlobalRule(rulePath: string): Promise<void> {
    await this.context.globalState.update('pbp.activeGlobalRule', rulePath);
    const targetRule = this.getGlobalRules().find(rule => rule.path === rulePath);
    if (targetRule) {
      const profile = this.ruleProfiles.find(candidate => candidate.enabledRuleIds.includes(targetRule.id));
      if (profile) {
        await this.context.globalState.update(RuleManager.ACTIVE_PROFILE_KEY, profile.id);
      }
    }
    await this.scanRuleFiles();
  }

  public async createGlobalRule(fileName: string): Promise<void> {
    if (!fileName.endsWith('.md')) {
      fileName += '.md';
    }

    const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
    fs.mkdirSync(globalRulesDir, { recursive: true });

    const filePath = path.join(globalRulesDir, fileName);
    if (fs.existsSync(filePath)) {
      vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
      return;
    }

    await fs.promises.writeFile(filePath, `# ${fileName}\n\n`, 'utf-8');
    vscode.window.showInformationMessage(t('Global rule {0} created.', fileName));
    await this.setActiveGlobalRule(filePath);
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  public async createRuleFile(fileName: string, template = ''): Promise<void> {
    if (!vscode.workspace.workspaceFolders) {
      vscode.window.showErrorMessage(t('No workspace open to create rule file.'));
      return;
    }

    const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const filePath = path.join(rootPath, fileName);

    if (fs.existsSync(filePath)) {
      vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
      return;
    }

    try {
      await fs.promises.writeFile(filePath, template, 'utf-8');
      vscode.window.showInformationMessage(`${t('Created')} ${fileName}`);
      await this.scanRuleFiles();
    } catch (error) {
      vscode.window.showErrorMessage(`${t('Failed to create prompt').replace('prompt', '')}${fileName}: ${error}`);
    }
  }

  public async deleteRuleFile(uri: vscode.Uri): Promise<void> {
    const confirm = await vscode.window.showWarningMessage(
      `${t('Are you sure you want to delete')} ${path.basename(uri.fsPath)}?`,
      { modal: true },
      t('Delete')
    );

    if (confirm !== t('Delete')) {
      return;
    }

    try {
      await vscode.workspace.fs.delete(uri);
      vscode.window.showInformationMessage(`${t('Deleted')} ${path.basename(uri.fsPath)}`);
      await this.scanRuleFiles();
    } catch (error) {
      vscode.window.showErrorMessage(t('Failed to delete {0}: {1}', path.basename(uri.fsPath), String(error)));
    }
  }

  private createRuleFileRecord(name: string, filePath: string, content: string, scope: 'workspace' | 'global'): RuleFile {
    const format: RuleFormat = name.endsWith('.md') ? 'markdown' : 'plain';
    const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : undefined;
    return {
      id: `${scope}:${filePath.toLowerCase()}`,
      name,
      path: filePath,
      scope,
      format,
      content,
      updatedAt: stats?.mtime.toISOString(),
    };
  }

  private async refreshProfiles(activeRulePath?: string): Promise<void> {
    const globalRules = this.getGlobalRules();
    const activeProfileId = this.context.globalState.get<string>(RuleManager.ACTIVE_PROFILE_KEY);
    const profiles: RuleProfile[] = [
      {
        id: 'workspace-only',
        name: 'Workspace Only',
        enabledRuleIds: [],
        priority: 0,
      },
      ...globalRules.map((rule, index) => ({
        id: `global-profile:${rule.id}`,
        name: `Global: ${rule.name}`,
        enabledRuleIds: [rule.id],
        priority: 100 + index,
      })),
    ];

    const fallbackProfileId =
      profiles.find(profile =>
        activeRulePath
        && profile.enabledRuleIds.some(ruleId =>
          this.ruleFiles.some(rule => rule.id === ruleId && rule.path === activeRulePath)
        )
      )?.id
      ?? activeProfileId
      ?? 'workspace-only';

    this.ruleProfiles = profiles.map(profile => ({
      ...profile,
      isActive: profile.id === fallbackProfileId,
    }));

    if (!this.ruleProfiles.some(profile => profile.isActive) && this.ruleProfiles[0]) {
      this.ruleProfiles[0].isActive = true;
    }

    const activeProfile = this.getActiveProfile();
    await this.context.globalState.update(RuleManager.ACTIVE_PROFILE_KEY, activeProfile?.id);

    const activeGlobalRuleId = activeProfile?.enabledRuleIds[0];
    const activeGlobalRule = activeGlobalRuleId
      ? this.getGlobalRules().find(rule => rule.id === activeGlobalRuleId)
      : undefined;
    await this.context.globalState.update('pbp.activeGlobalRule', activeGlobalRule?.path);
  }

  private appliesToAgent(rule: RuleFile, agentType?: AgentType): boolean {
    if (!rule.appliesTo || rule.appliesTo.length === 0 || !agentType) {
      return true;
    }

    return rule.appliesTo.includes(agentType);
  }

  private createResolvedRuleEntry(rule: RuleFile, profile: RuleProfile, agentType?: AgentType): ResolvedRuleEntry {
    const reasons: string[] = [];

    if (rule.scope === 'workspace') {
      reasons.push('Workspace rule discovered in the current project');
    } else {
      reasons.push(`Enabled by active profile "${profile.name}"`);
    }

    if (agentType) {
      reasons.push(`Included for target ${agentType}`);
    }

    if (rule.appliesTo && rule.appliesTo.length > 0) {
      reasons.push(`Applies to: ${rule.appliesTo.join(', ')}`);
    } else {
      reasons.push('Applies to all agents');
    }

    return {
      rule,
      reason: reasons.join(' | '),
    };
  }

  private detectConflicts(rules: RuleFile[]): ResolvedRuleConflict[] {
    const groupedByName = new Map<string, RuleFile[]>();

    for (const rule of rules) {
      const existing = groupedByName.get(rule.name) ?? [];
      existing.push(rule);
      groupedByName.set(rule.name, existing);
    }

    const conflicts: ResolvedRuleConflict[] = [];
    for (const [name, groupedRules] of groupedByName.entries()) {
      if (groupedRules.length < 2) {
        continue;
      }

      conflicts.push({
        type: 'duplicate-name',
        message: `Multiple active rules share the same file name: ${name}`,
        ruleIds: groupedRules.map(rule => rule.id),
      });
    }

    return conflicts;
  }
}
