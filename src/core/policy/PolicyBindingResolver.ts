import * as fs from 'fs';
import * as path from 'path';
import { PolicyBinding, ResolvedPolicyBinding } from '../../types/teamPolicy';

export interface PolicyBindingConfigReader {
  get<T>(key: string, defaultValue: T): T;
}

export class PolicyBindingResolver {
  constructor(
    private readonly workspaceRoot: string | undefined,
    private readonly config: PolicyBindingConfigReader
  ) {}

  resolve(packIds: string[]): ResolvedPolicyBinding {
    const workspace = this.readWorkspaceBinding();
    if (workspace) {
      return {
        source: 'workspace',
        packId: workspace.packId,
        packVersion: workspace.packVersion,
        profileId: workspace.profileId,
        allowPersonalOverrides: workspace.allowPersonalOverrides,
        pinned: workspace.pinned,
        reasons: ['Workspace policy binding declared in .pbp/policy.json'],
      };
    }

    const defaultPackId = this.config.get<string>('defaultTeamPackId', '');
    const defaultProfileId = this.config.get<string>('defaultTeamProfileId', '');
    const allowPersonalOverrides = this.config.get<boolean>('allowPersonalPolicyOverrides', true);

    if (defaultPackId || defaultProfileId) {
      return {
        source: 'settings',
        packId: defaultPackId || undefined,
        profileId: defaultProfileId || undefined,
        allowPersonalOverrides,
        pinned: false,
        reasons: ['Resolved from user settings defaults'],
      };
    }

    return {
      source: 'implicit',
      packId: undefined,
      profileId: undefined,
      allowPersonalOverrides: true,
      pinned: false,
      reasons: packIds.length > 0
        ? ['No explicit binding; using legacy rule resolution']
        : ['No team policy pack available'],
    };
  }

  private readWorkspaceBinding(): PolicyBinding | undefined {
    if (!this.workspaceRoot) return undefined;
    const policyPath = path.join(this.workspaceRoot, '.pbp', 'policy.json');
    if (!fs.existsSync(policyPath)) return undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as Partial<PolicyBinding>;
      if (!parsed.packId || !parsed.profileId) return undefined;
      return {
        packId: parsed.packId,
        packVersion: parsed.packVersion,
        profileId: parsed.profileId,
        allowPersonalOverrides: parsed.allowPersonalOverrides ?? true,
        pinned: parsed.pinned ?? Boolean(parsed.packVersion),
      };
    } catch {
      return undefined;
    }
  }
}
