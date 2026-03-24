import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AgentType } from '../types/agent';
import { ManagedRuleProfile, RuleIdentity, TeamPolicyPack, TeamPolicySourceConfig, TeamPolicySourceTrust } from '../types/teamPolicy';

interface TeamPolicyPackManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
}

interface ProfileFile {
  id: string;
  name: string;
  enabledRuleIds?: string[];
  requiredRuleIds?: string[];
  allowExtension?: boolean;
  appliesTo?: string[];
}

export class TeamPolicyService {
  private packs: TeamPolicyPack[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async refresh(): Promise<TeamPolicyPack[]> {
    const loadedPacks: TeamPolicyPack[] = [];
    for (const source of this.getConfiguredSources()) {
      const sourcePath = this.resolveSourcePath(source);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        continue;
      }

      const pack = await this.loadPackFromFolder(source, sourcePath);
      if (pack) {
        loadedPacks.push(pack);
      }
    }

    this.packs = loadedPacks;
    return this.packs;
  }

  public getInstalledPacks(): TeamPolicyPack[] {
    return this.packs;
  }

  public getPackById(packId: string): TeamPolicyPack | undefined {
    return this.packs.find((pack) => pack.id === packId);
  }

  private getConfiguredSources(): TeamPolicySourceConfig[] {
    const config = vscode.workspace.getConfiguration('pbp');
    const rawSources = config.get<unknown[]>('teamPolicySources', []);
    const sources: TeamPolicySourceConfig[] = [];

    for (const rawSource of rawSources) {
      if (typeof rawSource === 'string') {
        sources.push({
          id: rawSource,
          type: 'local-folder',
          path: rawSource,
          trust: 'trusted',
        });
        continue;
      }

      if (!rawSource || typeof rawSource !== 'object') {
        continue;
      }

      const candidate = rawSource as Record<string, unknown>;
      const type = candidate.type === 'git' ? 'git' : 'local-folder';
      const configuredPath = typeof candidate.path === 'string'
        ? candidate.path
        : typeof candidate.rootPath === 'string'
          ? candidate.rootPath
          : undefined;

      if (!configuredPath) {
        continue;
      }

      sources.push({
        id: typeof candidate.id === 'string' ? candidate.id : configuredPath,
        type,
        path: configuredPath,
        url: typeof candidate.url === 'string' ? candidate.url : undefined,
        packPath: typeof candidate.packPath === 'string' ? candidate.packPath : undefined,
        trust: this.normalizeTrust(candidate.trust),
        requestedVersion: typeof candidate.requestedVersion === 'string' ? candidate.requestedVersion : undefined,
        resolvedVersion: typeof candidate.resolvedVersion === 'string' ? candidate.resolvedVersion : undefined,
      });
    }

    return sources;
  }

  private normalizeTrust(value: unknown): TeamPolicySourceTrust {
    return value === 'untrusted' || value === 'revoked' ? value : 'trusted';
  }

  private resolveSourcePath(source: TeamPolicySourceConfig): string | undefined {
    if (!source.path) {
      return undefined;
    }

    return source.packPath ? path.join(source.path, source.packPath) : source.path;
  }

  private async loadPackFromFolder(source: TeamPolicySourceConfig, folderPath: string): Promise<TeamPolicyPack | undefined> {
    const packJsonPath = path.join(folderPath, 'pack.json');
    if (!fs.existsSync(packJsonPath)) {
      return undefined;
    }

    try {
      const manifest = JSON.parse(await fs.promises.readFile(packJsonPath, 'utf8')) as TeamPolicyPackManifest;
      if (!manifest.id || !manifest.name || !manifest.version) {
        return undefined;
      }

      const rules = await this.loadRules(folderPath, manifest.id, manifest.version);
      const profiles = await this.loadProfiles(folderPath, manifest.id);
      const stats = await fs.promises.stat(packJsonPath);

      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        sourceId: source.id,
        sourcePath: folderPath,
        requestedVersion: source.requestedVersion,
        resolvedVersion: source.resolvedVersion ?? manifest.version,
        updatedAt: stats.mtime.toISOString(),
        profiles,
        rules,
        prompts: [],
        status: source.trust === 'revoked' ? 'disabled' : 'active',
        trust: source.trust ?? 'trusted',
      };
    } catch (error) {
      console.error(`Failed to load team policy pack from ${folderPath}`, error);
      return undefined;
    }
  }

  private async loadRules(folderPath: string, packId: string, packVersion: string): Promise<RuleIdentity[]> {
    const rulesDir = path.join(folderPath, 'rules');
    if (!fs.existsSync(rulesDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(rulesDir, { withFileTypes: true });
    const rules: RuleIdentity[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const ruleId = path.basename(entry.name, path.extname(entry.name));
      rules.push({
        ruleId,
        canonicalKey: `team-pack:${packId}:${ruleId}`,
        packId,
        packVersion,
      });
    }

    return rules;
  }

  private async loadProfiles(folderPath: string, packId: string): Promise<ManagedRuleProfile[]> {
    const profilesDir = path.join(folderPath, 'profiles');
    if (!fs.existsSync(profilesDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(profilesDir, { withFileTypes: true });
    const profiles: ManagedRuleProfile[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) {
        continue;
      }

      try {
        const profilePath = path.join(profilesDir, entry.name);
        const parsed = JSON.parse(await fs.promises.readFile(profilePath, 'utf8')) as ProfileFile;
        if (!parsed.id || !parsed.name) {
          continue;
        }

        profiles.push({
          id: parsed.id,
          name: parsed.name,
          enabledRuleIds: parsed.enabledRuleIds ?? [],
          requiredRuleIds: parsed.requiredRuleIds ?? [],
          priority: 200,
          appliesTo: this.normalizeAgentList(parsed.appliesTo),
          origin: 'team-pack',
          packId,
          locked: true,
          allowExtension: parsed.allowExtension ?? true,
        });
      } catch (error) {
        console.error(`Failed to load team policy profile ${entry.name}`, error);
      }
    }

    return profiles;
  }

  private normalizeAgentList(values: string[] | undefined): AgentType[] | undefined {
    if (!values || values.length === 0) {
      return undefined;
    }

    return values.filter((value): value is AgentType => typeof value === 'string');
  }
}
