import * as vscode from 'vscode';

export class VscodeConfigReader {
  private get cfg(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration('pbp');
  }

  get<T>(key: string, defaultValue: T): T {
    return this.cfg.get<T>(key, defaultValue);
  }

  // Execution
  get defaultAgent(): string { return this.get('defaultAgent', 'clipboard'); }
  get defaultBehavior(): string { return this.get('defaultBehavior', 'send'); }
  get executionSelectionMode(): string { return this.get('executionSelectionMode', 'last-execution'); }
  get rememberLastExecution(): boolean { return this.get('rememberLastExecution', true); }

  // Prompt storage
  get defaultSaveLocation(): string { return this.get('defaultSaveLocation', 'workspace'); }
  get defaultTarget(): string { return this.get('defaultSaveLocation', 'workspace'); }

  // UI
  get uiLanguage(): string { return this.get('uiLanguage', 'en'); }
  get ollamaEndpoint(): string { return this.get('ollamaEndpoint', 'http://localhost:11434'); }
  get customProviderUrl(): string { return this.get('customProviderUrl', ''); }

  // Team policy
  get autoSyncTeamPolicies(): boolean { return this.get('autoSyncTeamPolicies', false); }
  get teamPolicySyncIntervalMinutes(): number { return this.get('teamPolicySyncIntervalMinutes', 30); }
  get allowPersonalPolicyOverrides(): boolean { return this.get('allowPersonalPolicyOverrides', true); }

  // Passive rule projection
  get passiveProjectionEnabled(): boolean { return this.get('passiveRuleProjection.enabled', false); }
  get passiveProjectionOutputPath(): string { return this.get('passiveRuleProjection.outputPath', '.pbp/compiled/AGENTS.md'); }
  get passiveProjectionFormat(): string { return this.get('passiveRuleProjection.format', 'agents-md'); }
  get passiveProjectionWriteMode(): string { return this.get('passiveRuleProjection.writeMode', 'safe-overwrite'); }
  get passiveProjectionAutoRefresh(): boolean { return this.get('passiveRuleProjection.autoRefresh', true); }
  get passiveProjectionIncludePreferences(): boolean { return this.get('passiveRuleProjection.includePreferences', true); }
  get passiveProjectionIncludeTeamMetadata(): boolean { return this.get('passiveRuleProjection.includeTeamMetadata', true); }

  // AI generator
  get generatorProvider(): string { return this.get('generatorProvider', 'claude'); }
  get generatorModel(): string { return this.get('generatorModel', ''); }
}
