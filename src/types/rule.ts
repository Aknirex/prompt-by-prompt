import { AgentType } from './agent';
import { ResolvedPolicyBinding } from './teamPolicy';

export type RuleScope = 'workspace' | 'global' | 'team-pack';
export type RuleFormat = 'markdown' | 'plain';
export type RuleInjectionMode = 'text-fallback' | 'structured-context' | 'inactive';
export type RuleCategory = 'style' | 'safety' | 'workflow' | 'tooling' | 'output';
export type RuleKind = 'instruction' | 'preference' | 'guardrail';

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
  title?: string;
  category?: RuleCategory;
  kind?: RuleKind;
  preferenceKey?: string;
  preferenceValue?: string | boolean | number;
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

export interface ExecutionPreference {
  key: string;
  value: string | boolean | number;
  sourceRuleId?: string;
}

export interface Guardrail {
  id: string;
  text: string;
  severity: 'hard' | 'soft';
  sourceRuleId?: string;
}

export interface EffectiveRule {
  id: string;
  canonicalKey: string;
  title: string;
  body: string;
  source: 'workspace' | 'global' | 'team-pack' | 'builtin' | 'user-local';
  priority: number;
  required: boolean;
  category?: RuleCategory;
  kind?: RuleKind;
  appliesTo?: AgentType[];
  reason: string;
}

export interface EffectivePolicy {
  packId?: string;
  profileId?: string;
  declaredVersion?: string;
  resolvedVersion?: string;
  bindingSource?: 'runtime' | 'workspace' | 'settings' | 'implicit';
  rules: EffectiveRule[];
  preferences: ExecutionPreference[];
  guardrails: Guardrail[];
  notes: string[];
  conflicts: ResolvedRuleConflict[];
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
