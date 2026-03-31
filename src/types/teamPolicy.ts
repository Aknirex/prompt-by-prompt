import { PromptVariable } from './prompt';
import { AgentType } from './agent';

export type TeamPolicySourceType = 'git' | 'local-folder';
export type TeamPolicySourceTrust = 'trusted' | 'untrusted' | 'revoked';
export type TeamPolicyPackStatus = 'active' | 'outdated' | 'disabled' | 'tampered';
export type TeamPolicySourceSyncStatus = 'synced' | 'error';

export interface SharedLibrarySummary {
  id: string;
  name: string;
  version: string;
  description?: string;
  sourceId: string;
  sourcePath: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  updatedAt?: string;
  ruleCount: number;
  promptCount: number;
  status: TeamPolicyPackStatus;
  trust: TeamPolicySourceTrust;
}

export interface TeamPolicySourceConfig {
  id: string;
  type: TeamPolicySourceType;
  path?: string;
  url?: string;
  packPath?: string;
  trust?: TeamPolicySourceTrust;
  requestedVersion?: string;
  resolvedVersion?: string;
}

export interface TeamPolicySourceState {
  sourceId: string;
  type: TeamPolicySourceType;
  status: TeamPolicySourceSyncStatus;
  lastSyncedAt?: string;
  lastSyncError?: string;
}

export interface RuleIdentity {
  ruleId: string;
  canonicalKey: string;
  packId?: string;
  packVersion?: string;
}

export interface SharedPromptTemplate {
  id: string;
  name: string;
  description?: string;
  template: string;
  variables?: PromptVariable[];
  category?: string;
  tags?: string[];
  source: 'team-pack';
  packId: string;
  packVersion: string;
  recommendedTargets?: AgentType[];
  readOnly?: boolean;
}

export interface TeamPolicyPack {
  id: string;
  name: string;
  version: string;
  description?: string;
  sourceId: string;
  sourcePath: string;
  requestedVersion?: string;
  resolvedVersion?: string;
  updatedAt?: string;
  rules: RuleIdentity[];
  prompts: SharedPromptTemplate[];
  status: TeamPolicyPackStatus;
  trust: TeamPolicySourceTrust;
}

export interface PolicyBinding {
  packId: string;
  packVersion?: string;
  profileId: string;
  allowPersonalOverrides: boolean;
  pinned: boolean;
}

export interface ResolvedPolicyBinding {
  source: 'runtime' | 'workspace' | 'settings' | 'implicit';
  packId?: string;
  packVersion?: string;
  profileId?: string;
  allowPersonalOverrides: boolean;
  pinned: boolean;
  reasons: string[];
}
