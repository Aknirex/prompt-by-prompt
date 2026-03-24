/**
 * Rule Manager Service
 * Manages workspace and global rule files with explicit refresh only.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentType } from '../types/agent';
import { RuleFile, RuleFormat, RuleProfile, ResolvedRuleConflict, ResolvedRuleEntry, ResolvedRuleSet } from '../types/rule';
import { ResolvedPolicyBinding, TeamPolicyPack } from '../types/teamPolicy';
import { t } from '../utils/i18n';
import { TeamPolicyService } from './teamPolicyService';
import { PolicyBindingService } from './policyBindingService';

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
  private installedPacks: TeamPolicyPack[] = [];
  private isScanning = false;
  private readonly teamPolicyService: TeamPolicyService;
  private readonly policyBindingService: PolicyBindingService;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.teamPolicyService = new TeamPolicyService(context);
    this.policyBindingService = new PolicyBindingService(context);
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

      this.installedPacks = await this.teamPolicyService.refresh();
      for (const pack of this.installedPacks) {
        newRuleFiles.push(...await this.loadTeamPackRules(pack));
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

  public getTeamPackRules(): RuleFile[] {
    return this.ruleFiles.filter(rule => rule.scope === 'team-pack');
  }

  public getInstalledTeamPacks(): TeamPolicyPack[] {
    return this.installedPacks;
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
    const binding = this.policyBindingService.resolveBinding(this.installedPacks);
    const profile = this.resolveProfile(binding) ?? {
      id: 'workspace-only',
      name: 'Workspace Only',
      enabledRuleIds: [],
      priority: 0,
      isActive: true,
      origin: 'built-in',
    };
    const workspaceRules = this.getWorkspaceRules();
    const globalRules = profile.origin === 'global'
      ? this.getGlobalRules().filter(rule => profile.enabledRuleIds.includes(rule.id))
      : [];
    const teamRules = profile.origin === 'team-pack'
      ? this.resolveTeamRules(profile)
      : [];
    const candidateRules = [
      ...teamRules.filter(rule => rule.required),
      ...teamRules.filter(rule => !rule.required),
      ...workspaceRules,
      ...globalRules,
    ];
    const applicableRules = candidateRules.filter(rule => this.appliesToAgent(rule, options?.agentType));
    const { activeEntries, inactiveEntries, conflicts } = this.resolveEntries(applicableRules, profile, options?.agentType);
    const activeRules = activeEntries.map(entry => entry.rule);
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
    if (teamRules.length > 0) {
      notes.push(`Team rules: ${teamRules.length}`);
    }
    if (binding.packId) {
      notes.push(`Policy binding: ${binding.source}`);
    }
    if (conflicts.length > 0) {
      notes.push('Potential rule conflicts detected. Review the conflict section below.');
    }

    const boundPack = binding.packId ? this.installedPacks.find(pack => pack.id === binding.packId) : undefined;

    return {
      profile,
      workspaceRules,
      globalRules,
      teamRules,
      activeRules,
      activeEntries,
      inactiveEntries,
      injectionMode: options?.supportsStructuredContext ? 'structured-context' : 'text-fallback',
      notes,
      conflicts,
      binding,
      policyVersion: boundPack
        ? {
            packId: boundPack.id,
            declaredVersion: boundPack.version,
            resolvedVersion: boundPack.resolvedVersion,
          }
        : undefined,
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
      origin: scope,
      format,
      content,
      updatedAt: stats?.mtime.toISOString(),
      canonicalKey: `${scope}:${name.toLowerCase()}`,
      priority: scope === 'workspace' ? 300 : 100,
    };
  }

  private async refreshProfiles(activeRulePath?: string): Promise<void> {
    const globalRules = this.getGlobalRules();
    const activeProfileId = this.context.globalState.get<string>(RuleManager.ACTIVE_PROFILE_KEY);
    const teamProfiles = this.installedPacks.flatMap(pack =>
      pack.profiles.map(profile => ({
        ...profile,
        id: `team-profile:${pack.id}:${profile.id}`,
        packId: pack.id,
        origin: 'team-pack' as const,
        priority: 200 + profile.priority,
      }))
    );
    const binding = this.policyBindingService.resolveBinding(this.installedPacks);
    const profiles: RuleProfile[] = [
      {
        id: 'workspace-only',
        name: 'Workspace Only',
        enabledRuleIds: [],
        priority: 0,
        origin: 'built-in',
      },
      ...teamProfiles,
      ...globalRules.map((rule, index) => ({
        id: `global-profile:${rule.id}`,
        name: `Global: ${rule.name}`,
        enabledRuleIds: [rule.id],
        priority: 100 + index,
        origin: 'global' as const,
      })),
    ];

    const fallbackProfileId =
      this.resolveBoundProfileId(binding, profiles)
      ?? (
      profiles.find(profile =>
        activeRulePath
        && profile.enabledRuleIds.some(ruleId =>
          this.ruleFiles.some(rule => rule.id === ruleId && rule.path === activeRulePath)
        )
      )?.id
      ?? activeProfileId
      ?? 'workspace-only');

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
    } else if (rule.scope === 'team-pack') {
      reasons.push(`Enabled by team policy profile "${profile.name}"`);
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
      status: 'active',
      required: rule.required === true,
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

  private async loadTeamPackRules(pack: TeamPolicyPack): Promise<RuleFile[]> {
    const rulesDir = path.join(pack.sourcePath, 'rules');
    if (!fs.existsSync(rulesDir)) {
      return [];
    }

    const files = (await fs.promises.readdir(rulesDir)).filter(file => file.endsWith('.md'));
    const rules: RuleFile[] = [];
    for (const fileName of files) {
      const filePath = path.join(rulesDir, fileName);
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const ruleId = path.basename(fileName, path.extname(fileName));
        const identity = pack.rules.find(rule => rule.ruleId === ruleId);
        const stats = await fs.promises.stat(filePath);
        rules.push({
          id: `team-pack:${pack.id}:${ruleId}`,
          name: fileName,
          path: filePath,
          scope: 'team-pack',
          origin: 'team-pack',
          format: 'markdown',
          content,
          updatedAt: stats.mtime.toISOString(),
          canonicalKey: identity?.canonicalKey ?? `team-pack:${pack.id}:${ruleId}`,
          packId: pack.id,
          packVersion: pack.version,
          priority: 400,
        });
      } catch (error) {
        console.error(`Error reading team policy rule ${fileName}`, error);
      }
    }

    return rules;
  }

  private resolveProfile(binding: ResolvedPolicyBinding): RuleProfile | undefined {
    const boundProfileId = this.resolveBoundProfileId(binding, this.ruleProfiles);
    if (boundProfileId) {
      return this.ruleProfiles.find(profile => profile.id === boundProfileId);
    }

    return this.getActiveProfile();
  }

  private resolveBoundProfileId(binding: ResolvedPolicyBinding, profiles: RuleProfile[]): string | undefined {
    if (!binding.profileId) {
      return undefined;
    }

    return profiles.find(profile =>
      profile.origin === 'team-pack'
      && profile.packId === binding.packId
      && (profile.id === binding.profileId || profile.id === `team-profile:${binding.packId}:${binding.profileId}`)
    )?.id;
  }

  private resolveTeamRules(profile: RuleProfile): RuleFile[] {
    if (!profile.packId) {
      return [];
    }

    const requiredRuleIds = new Set(profile.requiredRuleIds ?? []);
    const enabledRuleIds = new Set(profile.enabledRuleIds);
    return this.getTeamPackRules()
      .filter(rule => rule.packId === profile.packId && (enabledRuleIds.has(this.extractTeamRuleId(rule.id)) || requiredRuleIds.has(this.extractTeamRuleId(rule.id))))
      .map(rule => ({
        ...rule,
        required: requiredRuleIds.has(this.extractTeamRuleId(rule.id)),
        priority: requiredRuleIds.has(this.extractTeamRuleId(rule.id)) ? 500 : 400,
      }));
  }

  private extractTeamRuleId(ruleId: string): string {
    return ruleId.split(':').slice(2).join(':');
  }

  private resolveEntries(rules: RuleFile[], profile: RuleProfile, agentType?: AgentType): {
    activeEntries: ResolvedRuleEntry[];
    inactiveEntries: ResolvedRuleEntry[];
    conflicts: ResolvedRuleConflict[];
  } {
    const activeEntries: ResolvedRuleEntry[] = [];
    const inactiveEntries: ResolvedRuleEntry[] = [];
    const conflicts: ResolvedRuleConflict[] = [];
    const winners = new Map<string, RuleFile>();

    for (const rule of rules) {
      const key = rule.canonicalKey ?? rule.id;
      const winner = winners.get(key);
      if (!winner) {
        winners.set(key, rule);
        continue;
      }

      const winnerPriority = winner.priority ?? 0;
      const challengerPriority = rule.priority ?? 0;
      if (challengerPriority > winnerPriority) {
        winners.set(key, rule);
        inactiveEntries.push({
          ...this.createResolvedRuleEntry(winner, profile, agentType),
          status: 'shadowed',
          shadowedByRuleId: rule.id,
          reason: `${this.createResolvedRuleEntry(winner, profile, agentType).reason} | Shadowed by ${rule.name}`,
        });
        conflicts.push({
          type: 'priority-shadowed',
          message: `${winner.name} was shadowed by ${rule.name}`,
          ruleIds: [winner.id, rule.id],
        });
      } else {
        inactiveEntries.push({
          ...this.createResolvedRuleEntry(rule, profile, agentType),
          status: 'shadowed',
          shadowedByRuleId: winner.id,
          reason: `${this.createResolvedRuleEntry(rule, profile, agentType).reason} | Shadowed by ${winner.name}`,
        });
        conflicts.push({
          type: 'priority-shadowed',
          message: `${rule.name} was shadowed by ${winner.name}`,
          ruleIds: [rule.id, winner.id],
        });
      }
    }

    for (const rule of winners.values()) {
      activeEntries.push(this.createResolvedRuleEntry(rule, profile, agentType));
    }

    return {
      activeEntries,
      inactiveEntries,
      conflicts: [...this.detectConflicts(rules), ...conflicts],
    };
  }
}
