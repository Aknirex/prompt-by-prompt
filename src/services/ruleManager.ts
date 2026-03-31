/**
 * Rule Manager Service
 * Manages workspace and global rule files with explicit refresh only.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentType } from '../types/agent';
import { EffectivePolicy, EffectiveRule, ExecutionPreference, Guardrail, RuleFile, RuleFormat, RuleProfile, ResolvedRuleConflict, ResolvedRuleEntry, ResolvedRuleSet } from '../types/rule';
import { TeamPolicyPack } from '../types/teamPolicy';
import { SharedLibrarySummary } from '../types/teamPolicy';
import { t } from '../utils/i18n';
import { parseRuleDocument } from '../utils/ruleFrontmatter';
import { TeamPolicyService } from './teamPolicyService';
import { getWorkspaceFolderForUri, getWorkspaceFolders } from '../utils/workspace';

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
  private readonly sharedTeamPolicyCacheOnly: boolean;

  constructor(
    private readonly context: vscode.ExtensionContext,
    teamPolicyService?: TeamPolicyService,
    sharedTeamPolicyCacheOnly = false
  ) {
    this.teamPolicyService = teamPolicyService ?? new TeamPolicyService(context);
    this.sharedTeamPolicyCacheOnly = sharedTeamPolicyCacheOnly;
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

      const workspaceFolders = getWorkspaceFolders();
      for (const workspaceFolder of workspaceFolders) {
        const rootPath = workspaceFolder.uri.fsPath;
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

      if (!this.sharedTeamPolicyCacheOnly) {
        this.installedPacks = await this.teamPolicyService.refresh();
      } else {
        this.installedPacks = this.teamPolicyService.getInstalledPacks();
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

  public getSharedLibrarySummaries(): SharedLibrarySummary[] {
    return this.teamPolicyService.getLibrarySummaries();
  }

  public getTeamPolicySourceStates() {
    return this.teamPolicyService.readPersistedSourceStates();
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
      origin: 'built-in',
    };
    const workspaceRules = this.getWorkspaceRules();
    const globalRules = profile.origin === 'global'
      ? this.getGlobalRules().filter(rule => profile.enabledRuleIds.includes(rule.id))
      : [];
    const candidateRules = [...workspaceRules, ...globalRules];
    const applicableRules = candidateRules.filter(rule => this.appliesToAgent(rule, options?.agentType));
    const { activeEntries, inactiveEntries, conflicts } = this.resolveEntries(applicableRules, profile, options?.agentType);
    const activeRules = activeEntries.map(entry => entry.rule);
    const notes: string[] = [];

    notes.push(`Activated rules profile: ${profile.name}`);
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
      notes.push(`Personal rules: ${globalRules.length}`);
    }
    if (conflicts.length > 0) {
      notes.push('Potential rule conflicts detected. Review the conflict section below.');
    }

    return {
      profile,
      workspaceRules,
      globalRules,
      teamRules: [],
      activeRules,
      activeEntries,
      inactiveEntries,
      injectionMode: options?.supportsStructuredContext ? 'structured-context' : 'text-fallback',
      notes,
      conflicts,
      binding: undefined,
      policyVersion: undefined,
    };
  }

  public resolvePolicy(options?: {
    agentType?: AgentType;
    supportsStructuredContext?: boolean;
  }): EffectivePolicy {
    const resolved = this.resolveRuleSet(options);
    const rules: EffectiveRule[] = resolved.activeEntries.map((entry) => ({
      id: entry.rule.id,
      canonicalKey: entry.rule.canonicalKey ?? entry.rule.id,
      title: entry.rule.title ?? entry.rule.name,
      body: entry.rule.content.trim(),
      source: entry.rule.origin ?? (entry.rule.scope === 'team-pack' ? 'team-pack' : entry.rule.scope),
      priority: entry.rule.priority ?? 0,
      required: entry.required === true || entry.rule.required === true,
      category: entry.rule.category,
      appliesTo: entry.rule.appliesTo,
      kind: entry.rule.kind ?? (entry.required === true || entry.rule.required === true ? 'guardrail' : 'instruction'),
      reason: entry.reason,
    }));

    const guardrails: Guardrail[] = rules
      .filter((rule) => rule.kind === 'guardrail' || rule.required)
      .map((rule) => ({
        id: rule.id,
        text: rule.body || rule.title,
        severity: 'hard',
        sourceRuleId: rule.id,
      }));

    const preferences: ExecutionPreference[] = [];
    for (const [index, rule] of rules.entries()) {
      const sourceRule = resolved.activeEntries[index]?.rule;
      if (rule.kind === 'preference' && sourceRule?.preferenceKey && sourceRule.preferenceValue !== undefined) {
        preferences.push({
          key: sourceRule.preferenceKey,
          value: sourceRule.preferenceValue,
          sourceRuleId: rule.id,
        });
        continue;
      }

      const normalizedBody = rule.body.toLowerCase();
      if (normalizedBody.includes('prefer pnpm instead of npm')) {
        preferences.push({ key: 'packageManager', value: 'pnpm', sourceRuleId: rule.id });
      }
      if (normalizedBody.includes('respond in the language of locale') || normalizedBody.includes('respond in zh-cn')) {
        preferences.push({ key: 'responseLanguage', value: 'locale', sourceRuleId: rule.id });
      }
      if (normalizedBody.includes('provide concise and direct solutions') || normalizedBody.includes('keep responses concise')) {
        preferences.push({ key: 'responseStyle', value: 'concise', sourceRuleId: rule.id });
      }
    }

    return {
      packId: resolved.policyVersion?.packId,
      profileId: resolved.profile.id,
      declaredVersion: resolved.policyVersion?.declaredVersion,
      resolvedVersion: resolved.policyVersion?.resolvedVersion,
      bindingSource: resolved.binding?.source,
      rules,
      preferences,
      guardrails,
      notes: resolved.notes,
      conflicts: resolved.conflicts,
    };
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

  public async createGlobalRule(fileName: string, template = ''): Promise<void> {
    fileName = this.normalizeRuleFileName(fileName);

    const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
    fs.mkdirSync(globalRulesDir, { recursive: true });

    const filePath = path.join(globalRulesDir, fileName);
    if (fs.existsSync(filePath)) {
      vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
      return;
    }

    await fs.promises.writeFile(filePath, template || `# ${fileName}\n\n`, 'utf-8');
    vscode.window.showInformationMessage(t('Global rule {0} created.', fileName));
    await this.setActiveGlobalRule(filePath);
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
  }

  public async createRuleFile(fileName: string, template = ''): Promise<void> {
    fileName = this.normalizeRuleFileName(fileName);

    const workspaceFolders = getWorkspaceFolders();
    if (workspaceFolders.length === 0) {
      vscode.window.showErrorMessage(t('No workspace open to create rule file.'));
      return;
    }

    const rootPath = getWorkspaceFolderForUri(vscode.window?.activeTextEditor?.document.uri)?.uri.fsPath
      ?? workspaceFolders[0].uri.fsPath;
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

  public async updateRuleFile(rule: RuleFile, fileName: string, content: string): Promise<void> {
    const nextFileName = this.normalizeRuleFileName(fileName);
    const previousPath = rule.path;
    const nextPath = path.join(path.dirname(previousPath), nextFileName);

    if (nextPath !== previousPath && fs.existsSync(nextPath)) {
      throw new Error(`${nextFileName} already exists.`);
    }

    await fs.promises.writeFile(nextPath, content, 'utf-8');

    if (nextPath !== previousPath && fs.existsSync(previousPath)) {
      await fs.promises.unlink(previousPath);
    }

    if (rule.scope === 'global') {
      const activeGlobalRule = this.context.globalState.get<string>('pbp.activeGlobalRule');
      if (activeGlobalRule === previousPath) {
        await this.context.globalState.update('pbp.activeGlobalRule', nextPath);
      }
    }

    await this.scanRuleFiles();
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

  private normalizeRuleFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return 'new-rule.md';
    }

    if (trimmed.startsWith('.') && !trimmed.includes('.', 1)) {
      return trimmed;
    }

    if (!trimmed.includes('.')) {
      return `${trimmed}.md`;
    }

    return trimmed;
  }

  private createRuleFileRecord(name: string, filePath: string, content: string, scope: 'workspace' | 'global'): RuleFile {
    const format: RuleFormat = name.endsWith('.md') ? 'markdown' : 'plain';
    const stats = fs.existsSync(filePath) ? fs.statSync(filePath) : undefined;
    const parsed = parseRuleDocument(content);
    return {
      id: `${scope}:${filePath.toLowerCase()}`,
      name,
      path: filePath,
      scope,
      origin: scope,
      format,
      content: parsed.body,
      updatedAt: stats?.mtime.toISOString(),
      canonicalKey: parsed.metadata.canonicalKey ?? `${scope}:${name.toLowerCase()}`,
      priority: parsed.metadata.priority ?? (scope === 'workspace' ? 300 : 100),
      appliesTo: parsed.metadata.appliesTo,
      required: parsed.metadata.required,
      title: parsed.metadata.title,
      category: parsed.metadata.category,
      kind: parsed.metadata.kind,
      preferenceKey: parsed.metadata.preferenceKey,
      preferenceValue: parsed.metadata.preferenceValue,
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
        origin: 'built-in',
      },
      ...globalRules.map((rule, index) => ({
        id: `global-profile:${rule.id}`,
        name: `Global: ${rule.name}`,
        enabledRuleIds: [rule.id],
        priority: 100 + index,
        origin: 'global' as const,
      })),
    ];

    const fallbackProfileId = profiles.find(profile =>
      activeRulePath
      && profile.enabledRuleIds.some(ruleId =>
        this.ruleFiles.some(rule => rule.id === ruleId && rule.path === activeRulePath)
      )
    )?.id ?? activeProfileId ?? 'workspace-only';

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
      reasons.push(`Enabled by active personal rule "${profile.name}"`);
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
