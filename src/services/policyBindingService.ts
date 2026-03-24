import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PolicyBinding, ResolvedPolicyBinding, TeamPolicyPack } from '../types/teamPolicy';

export class PolicyBindingService {
  constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveBinding(packs: TeamPolicyPack[]): ResolvedPolicyBinding {
    const workspaceBinding = this.readWorkspaceBinding();
    if (workspaceBinding) {
      return {
        source: 'workspace',
        packId: workspaceBinding.packId,
        packVersion: workspaceBinding.packVersion,
        profileId: workspaceBinding.profileId,
        allowPersonalOverrides: workspaceBinding.allowPersonalOverrides,
        pinned: workspaceBinding.pinned,
        reasons: ['Workspace policy binding declared in .pbp/policy.json'],
      };
    }

    const config = vscode.workspace.getConfiguration('pbp');
    const defaultPackId = config.get<string>('defaultTeamPackId');
    const defaultProfileId = config.get<string>('defaultTeamProfileId');
    const allowPersonalOverrides = config.get<boolean>('allowPersonalPolicyOverrides', true);

    if (defaultPackId || defaultProfileId) {
      return {
        source: 'settings',
        packId: defaultPackId,
        profileId: defaultProfileId,
        allowPersonalOverrides,
        pinned: false,
        reasons: ['Resolved from user settings defaults'],
      };
    }

    const firstPack = packs[0];
    return {
      source: 'implicit',
      packId: undefined,
      packVersion: undefined,
      profileId: undefined,
      allowPersonalOverrides: true,
      pinned: false,
      reasons: firstPack ? ['No explicit team policy binding; falling back to legacy rule resolution'] : ['No team policy pack available'],
    };
  }

  private readWorkspaceBinding(): PolicyBinding | undefined {
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!rootPath) {
      return undefined;
    }

    const policyPath = path.join(rootPath, '.pbp', 'policy.json');
    if (!fs.existsSync(policyPath)) {
      return undefined;
    }

    try {
      const content = fs.readFileSync(policyPath, 'utf8');
      const parsed = JSON.parse(content) as Partial<PolicyBinding>;
      if (!parsed.packId || !parsed.profileId) {
        return undefined;
      }

      return {
        packId: parsed.packId,
        packVersion: parsed.packVersion,
        profileId: parsed.profileId,
        allowPersonalOverrides: parsed.allowPersonalOverrides ?? true,
        pinned: parsed.pinned ?? Boolean(parsed.packVersion),
      };
    } catch (error) {
      console.error('Failed to read workspace policy binding', error);
      return undefined;
    }
  }
}
