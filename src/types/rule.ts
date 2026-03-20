import { AgentType } from './agent';

export type RuleScope = 'workspace' | 'global';
export type RuleFormat = 'markdown' | 'plain';
export type RuleInjectionMode = 'text-fallback' | 'structured-context' | 'inactive';

export interface RuleFile {
  id: string;
  name: string;
  path: string;
  scope: RuleScope;
  format: RuleFormat;
  content: string;
  appliesTo?: AgentType[];
  updatedAt?: string;
}

export interface RuleProfile {
  id: string;
  name: string;
  enabledRuleIds: string[];
  priority: number;
  appliesTo?: AgentType[];
  isActive?: boolean;
}

export interface ResolvedRuleConflict {
  type: 'duplicate-name';
  message: string;
  ruleIds: string[];
}

export interface ResolvedRuleEntry {
  rule: RuleFile;
  reason: string;
}

export interface ResolvedRuleSet {
  profile: RuleProfile;
  workspaceRules: RuleFile[];
  globalRules: RuleFile[];
  activeRules: RuleFile[];
  activeEntries: ResolvedRuleEntry[];
  injectionMode: RuleInjectionMode;
  notes: string[];
  conflicts: ResolvedRuleConflict[];
}
