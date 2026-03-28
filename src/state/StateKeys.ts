export const GlobalStateKeys = {
  PROMPTS_LEGACY: 'pbp.prompts',
  EXECUTION_HISTORY: 'pbp.executionHistory',
  ACTIVE_RULE_PROFILE: 'pbp.activeRuleProfile',
  TEAM_SOURCES: 'pbp.teamSources',
  TEAM_SOURCE_COMMIT: (id: string) => `pbp.teamSource.${id}.commit`,
  TEAM_SOURCE_ERROR: (id: string) => `pbp.teamSource.${id}.lastError`,
  GENERATOR_SYSTEM_PROMPT: 'pbp.generatorSystemPrompt',
  BUILTINS_SEEDED: 'pbp.builtinsSeeded',
  AGENT_CONFIGURED: 'pbp.agentConfigured',
} as const;

export const WorkspaceStateKeys = {
  POLICY_BINDING: 'pbp.policyBinding',
  LAST_EXECUTION: 'pbp.lastExecution',
} as const;
