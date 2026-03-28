import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { AgentType } from '../../types/agent';
import { ManagedRuleProfile, RuleIdentity, TeamPolicyPack, TeamPolicySourceConfig, TeamPolicySourceTrust } from '../../types/teamPolicy';
import { PromptTemplate } from '../../types/prompt';
import { parseRuleDocument } from '../../utils/ruleFrontmatter';

interface PackManifest {
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

export class TeamPackLoader {
  async loadFromFolder(
    source: TeamPolicySourceConfig,
    sourcePath: string
  ): Promise<TeamPolicyPack | undefined> {
    const manifestPath = path.join(sourcePath, 'pack.json');
    if (!fs.existsSync(manifestPath)) return undefined;

    let manifest: PackManifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as PackManifest;
      if (!manifest.id || !manifest.name || !manifest.version) return undefined;
    } catch {
      return undefined;
    }

    const profiles = await this.loadProfiles(sourcePath, manifest.id);
    const rules = await this.loadRuleIdentities(sourcePath);
    const prompts = await this.loadPrompts(sourcePath, manifest);

    return {
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      sourceId: source.id,
      sourcePath,
      requestedVersion: source.requestedVersion,
      resolvedVersion: source.resolvedVersion,
      updatedAt: new Date().toISOString(),
      profiles,
      rules,
      prompts,
      status: 'active',
      trust: source.trust ?? 'trusted',
    };
  }

  private async loadProfiles(sourcePath: string, packId: string): Promise<ManagedRuleProfile[]> {
    const profilesDir = path.join(sourcePath, 'profiles');
    if (!fs.existsSync(profilesDir)) return [];

    const files = fs.readdirSync(profilesDir).filter(f => f.endsWith('.json'));
    const profiles: ManagedRuleProfile[] = [];

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(profilesDir, file), 'utf8')) as Partial<ProfileFile>;
        if (!raw.id || !raw.name) continue;
        profiles.push({
          id: raw.id,
          name: raw.name,
          enabledRuleIds: raw.enabledRuleIds ?? [],
          requiredRuleIds: raw.requiredRuleIds,
          allowExtension: raw.allowExtension,
          priority: 0,
          appliesTo: raw.appliesTo as AgentType[] | undefined,
          origin: 'team-pack',
          packId,
          locked: true,
        });
      } catch {
        // skip malformed profile
      }
    }

    return profiles;
  }

  private async loadRuleIdentities(sourcePath: string): Promise<RuleIdentity[]> {
    const rulesDir = path.join(sourcePath, 'rules');
    if (!fs.existsSync(rulesDir)) return [];

    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    const identities: RuleIdentity[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(rulesDir, file), 'utf8');
        const parsed = parseRuleDocument(content);
        const fm = parsed.metadata;
        identities.push({
          ruleId: fm.ruleId ?? file,
          canonicalKey: fm.canonicalKey ?? file,
          packId: undefined,
        });
      } catch {
        // skip
      }
    }

    return identities;
  }

  private async loadPrompts(sourcePath: string, manifest: PackManifest): Promise<import('../../types/teamPolicy').SharedPromptTemplate[]> {
    const promptsDir = path.join(sourcePath, 'prompts');
    if (!fs.existsSync(promptsDir)) return [];

    const files = fs.readdirSync(promptsDir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const prompts: import('../../types/teamPolicy').SharedPromptTemplate[] = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(promptsDir, file), 'utf8');
        const raw = yaml.load(content) as Partial<PromptTemplate>;
        if (!raw || !raw.id || !raw.name) continue;
        prompts.push({
          id: raw.id,
          name: raw.name,
          description: raw.description ?? '',
          category: raw.category ?? '',
          tags: raw.tags ?? [],
          template: raw.template ?? '',
          variables: raw.variables,
          source: 'team-pack',
          packId: manifest.id,
          packVersion: manifest.version,
          readOnly: true,
        });
      } catch {
        // skip
      }
    }

    return prompts;
  }
}
