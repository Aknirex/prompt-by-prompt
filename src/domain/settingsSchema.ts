export type PbpSettingArea =
  | 'execution'
  | 'storage'
  | 'generator'
  | 'libraries'
  | 'policy'
  | 'ui'
  | 'compatibility';

export type PbpSettingValueType =
  | 'string'
  | 'boolean'
  | 'number'
  | 'array';

export interface PbpSettingDefinition {
  key: `pbp.${string}`;
  area: PbpSettingArea;
  valueType: PbpSettingValueType;
  secret?: boolean;
  advanced?: boolean;
  legacy?: boolean;
}

export const PBP_SETTINGS_SCHEMA = [
  { key: 'pbp.defaultModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.ollamaEndpoint', area: 'generator', valueType: 'string' },
  { key: 'pbp.ollamaModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.openaiApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.openaiModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.claudeApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.claudeModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.groqApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.groqModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.geminiApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.geminiModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.openrouterApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.openrouterModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.deepseekApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.deepseekModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.mistralApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.mistralModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.xaiApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.xaiModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.azureApiKey', area: 'generator', valueType: 'string', secret: true },
  { key: 'pbp.azureEndpoint', area: 'generator', valueType: 'string' },
  { key: 'pbp.azureModel', area: 'generator', valueType: 'string' },
  { key: 'pbp.promptsDir', area: 'storage', valueType: 'string' },
  { key: 'pbp.defaultAgent', area: 'execution', valueType: 'string' },
  { key: 'pbp.outputDirectory', area: 'execution', valueType: 'string' },
  { key: 'pbp.sendBehavior', area: 'execution', valueType: 'string' },
  { key: 'pbp.executionSelectionMode', area: 'execution', valueType: 'string' },
  { key: 'pbp.rememberLastExecution', area: 'compatibility', valueType: 'boolean', legacy: true },
  { key: 'pbp.defaultTarget', area: 'storage', valueType: 'string' },
  { key: 'pbp.defaultRuleFile', area: 'policy', valueType: 'string' },
  { key: 'pbp.uiLanguage', area: 'ui', valueType: 'string' },
  { key: 'pbp.customProviderUrl', area: 'generator', valueType: 'string', advanced: true },
  { key: 'pbp.teamPolicySources', area: 'libraries', valueType: 'array', advanced: true },
  { key: 'pbp.autoSyncTeamPolicies', area: 'libraries', valueType: 'boolean', advanced: true },
  { key: 'pbp.teamPolicySyncIntervalMinutes', area: 'libraries', valueType: 'number', advanced: true },
  { key: 'pbp.passiveRuleProjection.enabled', area: 'policy', valueType: 'boolean', advanced: true },
  { key: 'pbp.passiveRuleProjection.scope', area: 'policy', valueType: 'string', advanced: true },
  { key: 'pbp.passiveRuleProjection.outputPath', area: 'policy', valueType: 'string', advanced: true },
  { key: 'pbp.passiveRuleProjection.format', area: 'policy', valueType: 'string', advanced: true },
  { key: 'pbp.passiveRuleProjection.writeMode', area: 'policy', valueType: 'string', advanced: true },
  { key: 'pbp.passiveRuleProjection.includeEditorContext', area: 'policy', valueType: 'boolean', advanced: true },
  { key: 'pbp.passiveRuleProjection.includePreferences', area: 'policy', valueType: 'boolean', advanced: true },
  { key: 'pbp.passiveRuleProjection.includeTeamMetadata', area: 'policy', valueType: 'boolean', advanced: true },
  { key: 'pbp.passiveRuleProjection.autoRefresh', area: 'policy', valueType: 'boolean', advanced: true },
] as const satisfies readonly PbpSettingDefinition[];

export type PbpSettingKey = typeof PBP_SETTINGS_SCHEMA[number]['key'];

export function getPbpSettingDefinition(key: string): PbpSettingDefinition | undefined {
  return PBP_SETTINGS_SCHEMA.find((setting) => setting.key === key);
}

export function getPbpSettingsByArea(area: PbpSettingArea): PbpSettingDefinition[] {
  return PBP_SETTINGS_SCHEMA.filter((setting) => setting.area === area);
}

export function getSecretSettingKeys(): PbpSettingKey[] {
  return PBP_SETTINGS_SCHEMA
    .filter(isSecretSetting)
    .map((setting) => setting.key);
}

function isSecretSetting(
  setting: PbpSettingDefinition
): setting is PbpSettingDefinition & { secret: true } {
  return setting.secret === true;
}
