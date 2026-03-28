import { AgentType } from '../../types/agent';
import {
  EffectivePolicy,
  EffectiveRule,
  ExecutionPreference,
  Guardrail,
  ResolvedRuleConflict,
  ResolvedRuleEntry,
  ResolvedRuleSet,
  RuleFile,
  RuleProfile,
} from '../../types/rule';
import { ResolvedPolicyBinding } from '../../types/teamPolicy';

export class RuleResolver {
  resolveActiveRules(
    allRules: RuleFile[],
    profile: RuleProfile,
    agentType?: AgentType
  ): { activeEntries: ResolvedRuleEntry[]; inactiveEntries: ResolvedRuleEntry[]; conflicts: ResolvedRuleConflict[] } {
    const conflicts: ResolvedRuleConflict[] = [];
    const seen = new Map<string, RuleFile>();
    const activeEntries: ResolvedRuleEntry[] = [];
    const inactiveEntries: ResolvedRuleEntry[] = [];

    const enabledIds = new Set(profile.enabledRuleIds);
    const sorted = [...allRules].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    for (const rule of sorted) {
      const isEnabled = enabledIds.has(rule.id) || enabledIds.size === 0;

      // Agent mismatch
      if (agentType && rule.appliesTo && !rule.appliesTo.includes(agentType)) {
        inactiveEntries.push({ rule, reason: 'agent-mismatch', status: 'inactive' });
        continue;
      }

      if (!isEnabled) {
        inactiveEntries.push({ rule, reason: 'not in profile', status: 'inactive' });
        continue;
      }

      const key = rule.canonicalKey ?? rule.id;
      if (seen.has(key)) {
        const existing = seen.get(key)!;
        conflicts.push({
          type: 'priority-shadowed',
          message: `Rule "${rule.name}" is shadowed by "${existing.name}" (same canonicalKey: ${key})`,
          ruleIds: [rule.id, existing.id],
        });
        inactiveEntries.push({ rule, reason: 'shadowed by higher-priority rule', status: 'shadowed', shadowedByRuleId: existing.id });
        continue;
      }

      seen.set(key, rule);
      activeEntries.push({ rule, reason: 'active via profile', status: 'active', required: rule.required });
    }

    // Check required rules
    for (const reqId of profile.requiredRuleIds ?? []) {
      if (!activeEntries.find(e => e.rule.id === reqId)) {
        conflicts.push({
          type: 'required-rule-disabled',
          message: `Required rule ${reqId} is not active`,
          ruleIds: [reqId],
        });
      }
    }

    return { activeEntries, inactiveEntries, conflicts };
  }

  buildEffectivePolicy(
    activeEntries: ResolvedRuleEntry[],
    conflicts: ResolvedRuleConflict[],
    binding: ResolvedPolicyBinding
  ): EffectivePolicy {
    const rules: EffectiveRule[] = [];
    const preferences: ExecutionPreference[] = [];
    const guardrails: Guardrail[] = [];
    const notes: string[] = [];

    for (const entry of activeEntries) {
      const rule = entry.rule;

      if (rule.kind === 'preference' && rule.preferenceKey) {
        preferences.push({
          key: rule.preferenceKey,
          value: rule.preferenceValue as string | boolean | number,
          sourceRuleId: rule.id,
        });
      } else if (rule.kind === 'guardrail') {
        guardrails.push({
          id: rule.id,
          text: rule.content.trim(),
          severity: 'hard',
          sourceRuleId: rule.id,
        });
      } else {
        rules.push({
          id: rule.id,
          canonicalKey: rule.canonicalKey ?? rule.id,
          title: rule.title ?? rule.name,
          body: rule.content,
          source: rule.scope === 'team-pack' ? 'team-pack' : rule.scope === 'global' ? 'global' : 'workspace',
          priority: rule.priority ?? 0,
          required: rule.required ?? false,
          category: rule.category,
          kind: rule.kind,
          appliesTo: rule.appliesTo,
          reason: entry.reason,
        });
      }
    }

    return {
      packId: binding.packId,
      profileId: binding.profileId,
      bindingSource: binding.source,
      rules,
      preferences,
      guardrails,
      notes,
      conflicts,
    };
  }

  buildDefaultProfile(rules: RuleFile[]): RuleProfile {
    return {
      id: 'default',
      name: 'Default',
      enabledRuleIds: rules.map(r => r.id),
      priority: 0,
      origin: 'built-in',
    };
  }
}
