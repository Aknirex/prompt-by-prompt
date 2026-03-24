import { AgentType } from './agent';
import { ResolvedPolicyBinding } from './teamPolicy';

export type RuleScope = 'workspace' | 'global' | 'team-pack';
export type RuleFormat = 'markdown' | 'plain';
export type RuleInjectionMode = 'text-fallback' | 'structured-context' | 'inactive';

export interface RuleFile {
  id: string;
  name: string;
  path: string;
  scope: RuleScope;
  origin?: 'workspace' | 'global' | 'team-pack' | 'user-local';
  format: RuleFormat;
  content: string;
  appliesTo?: AgentType[];
  updatedAt?: string;
  canonicalKey?: string;
  priority?: number;
  required?: boolean;
  packId?: string;
  packVersion?: string;
}

export interface RuleProfile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  priority: number;
  appliesTo?: AgentType[];
  isActive?: boolean;
  origin?: 'built-in' | 'global' | 'team-pack' | 'user-local';
  packId?: string;
  locked?: boolean;
  allowExtension?: boolean;
  requiredRuleIds?: string[];
}

export interface ResolvedRuleConflict {
  type:
    | 'duplicate-name'
    | 'priority-shadowed'
    | 'required-rule-disabled'
    | 'agent-mismatch'
    | 'version-mismatch'
    | 'binding-mismatch'
    | 'untrusted-source';
  message: string;
  ruleIds: string[];
}

export interface ResolvedRuleEntry {
  rule: RuleFile;
  reason: string;
  status?: 'active' | 'shadowed' | 'inactive';
  shadowedByRuleId?: string;
  required?: boolean;
}

export interface ResolvedRuleSet {
  profile: RuleProfile;
  workspaceRules: RuleFile[];
  globalRules: RuleFile[];
  teamRules?: RuleFile[];
  activeRules: RuleFile[];
  activeEntries: ResolvedRuleEntry[];
  inactiveEntries?: ResolvedRuleEntry[];
  injectionMode: RuleInjectionMode;
  notes: string[];
  conflicts: ResolvedRuleConflict[];
  binding?: ResolvedPolicyBinding;
  policyVersion?: {
    packId: string;
    declaredVersion: string;
    resolvedVersion?: string;
  };
}
