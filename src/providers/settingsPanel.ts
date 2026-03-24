/**
 * Settings Panel - Webview-based settings interface
 */

import * as vscode from 'vscode';
import { AI_PROVIDERS, AIProvider, DEFAULT_GENERATOR_SYSTEM_PROMPT } from '../services/aiService';
import { AgentService, getSupportedExecutionBehaviors } from '../services/agentService';
import { t } from '../utils/i18n';
import { AgentType } from '../types/agent';

/**
 * Settings configuration
 */
export interface SettingsConfig {
  // Agent settings
  defaultAgent: AgentType;
  sendBehavior: 'send' | 'append' | 'overwrite';
  executionSelectionMode: 'last-execution' | 'initial-recommendation' | 'ask-every-time';
  
  // Default save location
  defaultTarget: 'workspace' | 'global';
  
  // AI Provider settings
  defaultModel: AIProvider;
  customProviderUrl: string;
  
  // Provider-specific settings
  ollamaEndpoint: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  groqApiKey: string;
  groqModel: string;
  geminiApiKey: string;
  geminiModel: string;
  openrouterApiKey: string;
  openrouterModel: string;
  deepseekApiKey: string;
  deepseekModel: string;
  mistralApiKey: string;
  mistralModel: string;
  xaiApiKey: string;
  xaiModel: string;
  azureApiKey: string;
  azureEndpoint: string;
  azureModel: string;
  
  // Generator system prompt
  generatorSystemPrompt: string;

  // File output settings
  outputDirectory: string;
  
  // UI settings
  uiLanguage: string;
}

/**
 * Settings Panel using Webview
 */
export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  public static readonly viewType = 'pbp.settings';
  private static readonly EXECUTION_SELECTION_MODE_STATE_KEY = 'pbp.executionSelectionMode';
  private static readonly REMEMBER_LAST_EXECUTION_STATE_KEY = 'pbp.rememberLastExecution';
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private readonly _agentService: AgentService;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    agentService: AgentService
  ): SettingsPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return SettingsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      'Prompt by Prompt Settings',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, context, agentService);
    return SettingsPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    agentService: AgentService
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._agentService = agentService;

    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this._saveSettings(message.data);
            break;
          case 'cancel':
            this._panel.dispose();
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _saveSettings(data: SettingsConfig): Promise<void> {
    const config = vscode.workspace.getConfiguration('pbp');
    const normalizedBehavior = this._normalizeBehavior(data.defaultAgent, data.sendBehavior);
    const saveWarnings: string[] = [];
    
    try {
      const updateSetting = async (key: string, value: unknown): Promise<void> => {
        try {
          await config.update(key, value, vscode.ConfigurationTarget.Global);
        } catch (error) {
          saveWarnings.push(`${key}: ${error}`);
        }
      };

      // Agent settings
      await updateSetting('defaultAgent', data.defaultAgent);
      await updateSetting('sendBehavior', normalizedBehavior);
      await updateSetting('defaultTarget', data.defaultTarget);

      const rememberLastExecution = data.executionSelectionMode === 'last-execution';
      await this._context.globalState.update(
        SettingsPanel.EXECUTION_SELECTION_MODE_STATE_KEY,
        data.executionSelectionMode
      );
      await this._context.globalState.update(
        SettingsPanel.REMEMBER_LAST_EXECUTION_STATE_KEY,
        rememberLastExecution
      );

      if (this._isRegisteredSetting(config, 'executionSelectionMode')) {
        await updateSetting('executionSelectionMode', data.executionSelectionMode);
      }

      if (this._isRegisteredSetting(config, 'rememberLastExecution')) {
        await updateSetting('rememberLastExecution', rememberLastExecution);
      }
      
      // AI Provider settings
      await updateSetting('defaultModel', data.defaultModel);
      await updateSetting('customProviderUrl', data.customProviderUrl);
      
      // Provider-specific settings
      await updateSetting('ollamaEndpoint', data.ollamaEndpoint);
      await updateSetting('ollamaModel', data.ollamaModel);
      await updateSetting('openaiApiKey', data.openaiApiKey);
      await updateSetting('openaiModel', data.openaiModel);
      await updateSetting('claudeApiKey', data.claudeApiKey);
      await updateSetting('claudeModel', data.claudeModel);
      await updateSetting('groqApiKey', data.groqApiKey);
      await updateSetting('groqModel', data.groqModel);
      await updateSetting('geminiApiKey', data.geminiApiKey);
      await updateSetting('geminiModel', data.geminiModel);
      await updateSetting('openrouterApiKey', data.openrouterApiKey);
      await updateSetting('openrouterModel', data.openrouterModel);
      await updateSetting('deepseekApiKey', data.deepseekApiKey);
      await updateSetting('deepseekModel', data.deepseekModel);
      await updateSetting('mistralApiKey', data.mistralApiKey);
      await updateSetting('mistralModel', data.mistralModel);
      await updateSetting('xaiApiKey', data.xaiApiKey);
      await updateSetting('xaiModel', data.xaiModel);
      await updateSetting('azureApiKey', data.azureApiKey);
      await updateSetting('azureEndpoint', data.azureEndpoint);
      await updateSetting('azureModel', data.azureModel);
      
      // Generator system prompt
      await this._context.globalState.update('pbp.generatorSystemPrompt', data.generatorSystemPrompt);

      // File output settings
      await updateSetting('outputDirectory', data.outputDirectory);
      await updateSetting('uiLanguage', data.uiLanguage);
      
      if (saveWarnings.length > 0) {
        vscode.window.showWarningMessage(t('Settings saved with partial issues: {0}', saveWarnings.join(' | ')));
      } else {
        vscode.window.showInformationMessage(t('Settings saved successfully!'));
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
    }
  }

  private _getSettings(): SettingsConfig {
    const config = vscode.workspace.getConfiguration('pbp');
    const configuredMode = this._getStoredExecutionSelectionMode(config);
    const executionSelectionMode: SettingsConfig['executionSelectionMode'] =
      configuredMode === 'last-execution' ||
      configuredMode === 'initial-recommendation' ||
      configuredMode === 'ask-every-time'
        ? configuredMode
        : (this._getRememberLastExecution(config) ? 'last-execution' : 'ask-every-time');
    
    const defaultAgent = this._getStoredAgent(config.get<string>('defaultAgent'));
    const sendBehavior = this._normalizeBehavior(
      defaultAgent,
      config.get<string>('sendBehavior')
    );

    return {
      defaultAgent,
      sendBehavior,
      executionSelectionMode,
      defaultTarget: config.get('defaultTarget') || 'global',
      defaultModel: (config.get('defaultModel') || 'ollama') as AIProvider,
      customProviderUrl: config.get('customProviderUrl') || '',
      ollamaEndpoint: config.get('ollamaEndpoint') || 'http://localhost:11434',
      ollamaModel: config.get('ollamaModel') || 'llama3.2',
      openaiApiKey: config.get('openaiApiKey') || '',
      openaiModel: config.get('openaiModel') || 'gpt-4o-mini',
      claudeApiKey: config.get('claudeApiKey') || '',
      claudeModel: config.get('claudeModel') || 'claude-3-5-sonnet-20241022',
      groqApiKey: config.get('groqApiKey') || '',
      groqModel: config.get('groqModel') || 'llama-3.3-70b-versatile',
      geminiApiKey: config.get('geminiApiKey') || '',
      geminiModel: config.get('geminiModel') || 'gemini-2.0-flash',
      openrouterApiKey: config.get('openrouterApiKey') || '',
      openrouterModel: config.get('openrouterModel') || 'anthropic/claude-3.5-sonnet',
      deepseekApiKey: config.get('deepseekApiKey') || '',
      deepseekModel: config.get('deepseekModel') || 'deepseek-chat',
      mistralApiKey: config.get('mistralApiKey') || '',
      mistralModel: config.get('mistralModel') || 'mistral-large-latest',
      xaiApiKey: config.get('xaiApiKey') || '',
      xaiModel: config.get('xaiModel') || 'grok-beta',
      azureApiKey: config.get('azureApiKey') || '',
      azureEndpoint: config.get('azureEndpoint') || '',
      azureModel: config.get('azureModel') || 'gpt-4o',
      generatorSystemPrompt: this._context.globalState.get('pbp.generatorSystemPrompt') || DEFAULT_GENERATOR_SYSTEM_PROMPT,
      outputDirectory: config.get('outputDirectory') || '.prompts/output',
      
      // UI settings
      uiLanguage: config.get('uiLanguage') || 'en',
    };
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getStoredAgent(value: string | undefined): AgentType {
    const supported = new Set(this._agentService.getAllAgentTypes());
    return value && supported.has(value as AgentType) ? (value as AgentType) : 'clipboard';
  }

  private _normalizeBehavior(
    agentType: AgentType,
    behavior: string | undefined
  ): SettingsConfig['sendBehavior'] {
    const adapter = this._agentService.getAdapter(agentType);
    if (!adapter) {
      return 'send';
    }

    const behaviors = getSupportedExecutionBehaviors(adapter.capabilities).filter(
      (item): item is SettingsConfig['sendBehavior'] =>
        item === 'send' || item === 'append' || item === 'overwrite'
    );

    if (behaviors.length === 0) {
      return 'send';
    }

    if (behavior === 'append' || behavior === 'overwrite' || behavior === 'send') {
      if (behaviors.includes(behavior)) {
        return behavior;
      }
    }

    return behaviors.includes('send') ? 'send' : behaviors[0];
  }

  private _isRegisteredSetting(
    config: vscode.WorkspaceConfiguration,
    key: string
  ): boolean {
    return config.inspect(key) !== undefined;
  }

  private _getStoredExecutionSelectionMode(
    config: vscode.WorkspaceConfiguration
  ): string | undefined {
    const configuredMode = config.get<string>('executionSelectionMode');
    if (configuredMode) {
      return configuredMode;
    }

    return this._context.globalState.get<string>(SettingsPanel.EXECUTION_SELECTION_MODE_STATE_KEY);
  }

  private _getRememberLastExecution(
    config: vscode.WorkspaceConfiguration
  ): boolean {
    const configuredValue = config.get<boolean>('rememberLastExecution');
    if (typeof configuredValue === 'boolean') {
      return configuredValue;
    }

    return this._context.globalState.get<boolean>(
      SettingsPanel.REMEMBER_LAST_EXECUTION_STATE_KEY,
      true
    );
  }

  private _getAgentOptionData() {
    return this._agentService.getAllAgentTypes().map((agentType) => {
      const adapter = this._agentService.getAdapter(agentType);
      const behaviors = adapter
        ? getSupportedExecutionBehaviors(adapter.capabilities).filter(
            (item) => item === 'send' || item === 'append' || item === 'overwrite'
          )
        : [];

      return {
        type: agentType,
        label: adapter?.name ?? agentType,
        behaviors,
      };
    });
  }

  private _isProviderConfigured(settings: SettingsConfig, providerId: string): boolean {
    switch (providerId) {
      case 'ollama':
        return Boolean(settings.ollamaEndpoint && settings.ollamaModel);
      case 'openai':
        return Boolean(settings.openaiApiKey && settings.openaiModel);
      case 'anthropic':
        return Boolean(settings.claudeApiKey && settings.claudeModel);
      case 'groq':
        return Boolean(settings.groqApiKey && settings.groqModel);
      case 'google':
        return Boolean(settings.geminiApiKey && settings.geminiModel);
      case 'openrouter':
        return Boolean(settings.openrouterApiKey && settings.openrouterModel);
      case 'deepseek':
        return Boolean(settings.deepseekApiKey && settings.deepseekModel);
      case 'mistral':
        return Boolean(settings.mistralApiKey && settings.mistralModel);
      case 'xai':
        return Boolean(settings.xaiApiKey && settings.xaiModel);
      case 'azure':
        return Boolean(settings.azureApiKey && settings.azureEndpoint && settings.azureModel);
      case 'custom':
        return Boolean(settings.customProviderUrl);
      default:
        return false;
    }
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const settings = this._getSettings();
    const agentOptions = this._getAgentOptionData();
    const sendBehaviorOptions = ['send', 'append', 'overwrite'] as const;
    const selectedAgent = agentOptions.find((agent) => agent.type === settings.defaultAgent);
    const selectedProviderConfigured = this._isProviderConfigured(settings, settings.defaultModel);
    
    return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${t('Prompt by Prompt Settings')}</title>
    <style>
      * { box-sizing: border-box; }
      
      body {
        font-family: var(--vscode-font-family);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        padding: 20px;
        margin: 0;
      }
      
      .container { max-width: 900px; margin: 0 auto; }

      .hero {
        display: grid;
        gap: 16px;
        margin-bottom: 20px;
      }

      .hero p {
        margin: 0;
        color: var(--vscode-descriptionForeground);
        line-height: 1.45;
      }
      
      h1 {
        margin-bottom: 20px;
        font-size: 1.5em;
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 10px;
      }
      
      h2 {
        font-size: 1.2em;
        margin-top: 24px;
        margin-bottom: 12px;
        color: var(--vscode-textLink-foreground);
      }
      
      .section {
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        padding: 16px;
        border-radius: 0;
        margin-bottom: 20px;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }

      .overview-card {
        background-color: var(--vscode-editor-background);
        border: 1px solid var(--vscode-panel-border);
        padding: 12px;
      }

      .overview-card strong {
        display: block;
        margin-bottom: 6px;
        font-size: 0.9em;
      }

      .overview-card span {
        font-size: 1.05em;
      }
      
      .form-group { margin-bottom: 14px; }
      
      label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
      }
      
      input[type="text"],
      input[type="password"],
      select,
      textarea {
        width: 100%;
        padding: 8px 12px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 0;
        font-family: inherit;
        font-size: inherit;
      }
      
      textarea {
        min-height: 150px;
        resize: vertical;
        font-family: var(--vscode-editor-font-family);
      }
      
      .hint {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
      }
      
      .checkbox-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      
      .checkbox-group input[type="checkbox"] { width: auto; }
      
      .checkbox-group label {
        margin-bottom: 0;
        font-weight: normal;
      }
      
      .row {
        display: flex;
        gap: 16px;
      }
      
      .row .form-group { flex: 1; }
      
      .buttons {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid var(--vscode-panel-border);
      }
      
      button {
        padding: 8px 20px;
        border: none;
        border-radius: 0;
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
      }
      
      button.primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      
      button.primary:hover {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      button.secondary {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      
      button.secondary:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }
      
      .api-key-input { font-family: monospace; }
      
      .provider-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 12px;
      }
      
      .provider-card {
        background-color: var(--vscode-editor-background);
        padding: 12px;
        border-radius: 0;
        border: 1px solid var(--vscode-panel-border);
      }
      
      .provider-card h3 {
        margin: 0 0 10px 0;
        font-size: 0.95em;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      
      .status-badge {
        font-size: 0.7em;
        padding: 2px 6px;
        border-radius: 0;
      }
      
      .status-badge.configured {
        background-color: #2ea043;
        color: white;
      }
      
      .status-badge.not-configured {
        background-color: #6e7681;
        color: white;
      }
      
      .tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 8px;
        flex-wrap: wrap;
      }
      
      .tab {
        padding: 8px 16px;
        background: none;
        border: none;
        cursor: pointer;
        color: var(--vscode-descriptionForeground);
        border-radius: 0;
      }
      
      .tab.active {
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        color: var(--vscode-editor-foreground);
      }
      
      .tab-content { display: none; }
      
      .tab-content.active { display: block; }
      
      .provider-card .form-group {
        margin-bottom: 8px;
      }
      
      .provider-card .form-group:last-child {
        margin-bottom: 0;
      }

      .inline-note {
        margin-top: 10px;
        padding: 10px 12px;
        border: 1px solid var(--vscode-panel-border);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-descriptionForeground);
        line-height: 1.45;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="hero">
        <div>
          <h1>${t('Prompt by Prompt Settings')}</h1>
          <p>${t('Keep the high-frequency run flow lean here: choose how prompts pick execution targets, where new prompts are stored, and which provider helps draft templates.')}</p>
        </div>
        <div class="overview-grid">
          <div class="overview-card">
            <strong>${t('Run Mode')}</strong>
            <span>${this._escapeHtml(settings.executionSelectionMode)}</span>
          </div>
          <div class="overview-card">
            <strong>${t('Preset Agent')}</strong>
            <span>${this._escapeHtml(selectedAgent?.label ?? settings.defaultAgent)}</span>
          </div>
          <div class="overview-card">
            <strong>${t('Prompt Storage')}</strong>
            <span>${this._escapeHtml(settings.defaultTarget)}</span>
          </div>
          <div class="overview-card">
            <strong>${t('Generator')}</strong>
            <span>${this._escapeHtml(settings.defaultModel)}${selectedProviderConfigured ? '' : ` (${t('needs setup')})`}</span>
          </div>
        </div>
      </div>

      <div class="tabs">
        <button class="tab active" onclick="showTab(event, 'run')">${t('Run Defaults')}</button>
        <button class="tab" onclick="showTab(event, 'storage')">${t('Storage & UI')}</button>
        <button class="tab" onclick="showTab(event, 'generator')">${t('Prompt Generator')}</button>
      </div>

      <div id="tab-run" class="tab-content active">
        <div class="section">
          <h2>${t('Execution Defaults')}</h2>
          <div class="hint" style="margin-bottom: 16px;">${t('These are only recommendations and fallback rules for the run flow. Explicit choices in a run still win.')}</div>

          <div class="form-group">
            <label for="executionSelectionMode">${t('Execution Selection Mode')}</label>
            <select id="executionSelectionMode" onchange="updateAgentVisibility()">
              <option value="last-execution" ${settings.executionSelectionMode === 'last-execution' ? 'selected' : ''}>${t('Reuse last execution per prompt')}</option>
              <option value="initial-recommendation" ${settings.executionSelectionMode === 'initial-recommendation' ? 'selected' : ''}>${t('Preset')}</option>
              <option value="ask-every-time" ${settings.executionSelectionMode === 'ask-every-time' ? 'selected' : ''}>${t('Ask every run')}</option>
            </select>
            <div class="hint">${t('Priority is: explicit choice in the current run > per-prompt last execution > preset.')}</div>
          </div>

          <div class="form-group" id="presetAgentGroup" style="display: ${settings.executionSelectionMode === 'initial-recommendation' ? 'block' : 'none'}">
            <label for="defaultAgent">${t('Preset Agent')}</label>
            <select id="defaultAgent" onchange="updateAgentVisibility()">
              ${agentOptions.map((agent) => `<option value="${agent.type}" ${settings.defaultAgent === agent.type ? 'selected' : ''}>${this._escapeHtml(agent.label)}</option>`).join('')}
            </select>
            <div class="hint">${t('This preset is only used when execution selection mode is set to preset.')}</div>
          </div>

          <div class="form-group" id="sendBehaviorGroup" style="display: ${settings.executionSelectionMode === 'initial-recommendation' && !['clipboard', 'file'].includes(settings.defaultAgent) ? 'block' : 'none'}">
            <label for="sendBehavior">${t('Preset Behavior')}</label>
            <select id="sendBehavior">
              ${sendBehaviorOptions.map((behavior) => `
                <option value="${behavior}" ${settings.sendBehavior === behavior ? 'selected' : ''}>
                  ${behavior === 'send' ? t('ui.settings.send') : behavior === 'append' ? t('ui.settings.append') : t('Overwrite Input Box')}
                </option>
              `).join('')}
            </select>
            <div class="hint" id="sendBehaviorHint"></div>
          </div>

          <div class="form-group" id="outputDirectoryGroup" style="display: ${settings.executionSelectionMode === 'initial-recommendation' && settings.defaultAgent === 'file' ? 'block' : 'none'}">
            <label for="outputDirectory">${t('Output Directory')}</label>
            <input type="text" id="outputDirectory" value="${this._escapeHtml(settings.outputDirectory)}" placeholder=".prompts/">
            <div class="hint">${t('Directory for generated markdown files (relative to workspace or absolute path)')}</div>
          </div>

          <div class="inline-note" id="executionModeSummary"></div>
        </div>
      </div>

      <div id="tab-storage" class="tab-content">
        <div class="section">
          <h2>${t('Prompt Storage')}</h2>
          <div class="hint" style="margin-bottom: 16px;">${t('Keep execution decisions in the run flow. The storage setting below only decides where newly created prompts are saved by default.')}</div>

          <div class="form-group">
            <label for="defaultTarget">${t('Default Save Location')}</label>
            <select id="defaultTarget">
              <option value="global" ${settings.defaultTarget === 'global' ? 'selected' : ''}>${t('Global')}</option>
              <option value="workspace" ${settings.defaultTarget === 'workspace' ? 'selected' : ''}>${t('Workspace')}</option>
            </select>
            <div class="hint">${t('Where to save new prompts by default. Global prompts are available in all projects.')}</div>
          </div>

          <div class="inline-note">${t('This setting only affects prompt creation. It does not change where prompts are sent when you run them.')}</div>
        </div>

        <div class="section">
          <h2>${t('Interface')}</h2>
          <div class="hint" style="margin-bottom: 16px;">${t('Lower-frequency preferences live here so they do not compete with daily run decisions.')}</div>

          <div class="form-group">
            <label for="uiLanguage">${t('UI Language')}</label>
            <select id="uiLanguage">
              <option value="en" ${settings.uiLanguage === 'en' ? 'selected' : ''}>${t('English')}</option>
              <option value="ja" ${settings.uiLanguage === 'ja' ? 'selected' : ''}>${t('Japanese')}</option>
              <option value="es" ${settings.uiLanguage === 'es' ? 'selected' : ''}>${t('Spanish')}</option>
              <option value="ko" ${settings.uiLanguage === 'ko' ? 'selected' : ''}>${t('Korean')}</option>
              <option value="zh-cn" ${settings.uiLanguage === 'zh-cn' ? 'selected' : ''}>${t('Chinese')}</option>
            </select>
          </div>
        </div>
      </div>

      <div id="tab-generator" class="tab-content">
        <div class="section">
          <h2>${t('Generator Provider')}</h2>
          <div class="hint" style="margin-bottom: 16px;">${t('These settings are only used when the built-in prompt generator drafts a template for you. They do not control which agent receives a prompt during execution.')}</div>
          
          <div class="form-group">
            <label for="providerSelector">${t('Default Provider')}</label>
            <select id="providerSelector" onchange="showProviderConfig(this.value)">
              ${AI_PROVIDERS.map(p => `<option value="${p.id}" ${settings.defaultModel === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
              <option value="custom" ${settings.defaultModel === 'custom' ? 'selected' : ''}>${t('Custom Provider')}</option>
            </select>
            <div class="hint">${t('The default provider for AI prompt generation')}</div>
          </div>
          
          <div class="form-group" id="customProviderUrlGroup" style="display: ${settings.defaultModel === 'custom' ? 'block' : 'none'}">
            <label for="customProviderUrl">${t('Provider URL')}</label>
            <input type="text" id="customProviderUrl" value="${this._escapeHtml(settings.customProviderUrl)}" placeholder="https://api.example.com">
          </div>

          <div class="inline-note" id="providerStatusNote">${selectedProviderConfigured ? t('The selected generator provider looks configured.') : t('The selected generator provider still needs setup before it can draft prompts.')}</div>
          
          <div id="provider-configs">
            ${this._getProviderConfigsHtml(settings)}
          </div>
        </div>
        
        <div class="section">
          <h2>${t('Generator System Prompt')}</h2>
          <p>${t('Configure the instruction used when the built-in prompt generator drafts a new template.')}</p>
          
            <div class="form-group">
              <label for="generatorSystemPrompt">${t('System Prompt')}</label>
              <textarea id="generatorSystemPrompt" rows="15">${this._escapeHtml(settings.generatorSystemPrompt)}</textarea>
            </div>

            <button type="button" class="secondary" onclick="resetGeneratorPrompt()">${t('Reset to Default')}</button>
          </div>
      </div>

      <div class="buttons">
        <button type="button" class="primary" onclick="saveSettings()">${t('Save Settings')}</button>
        <button type="button" class="secondary" onclick="cancel()">${t('Cancel')}</button>
      </div>
  </div>

  <script>
    const agentBehaviorMap = ${JSON.stringify(
      agentOptions.reduce<Record<string, string[]>>((accumulator, agent) => {
        accumulator[agent.type] = agent.behaviors;
        return accumulator;
      }, {})
    )};
    const providerConfiguredMap = ${JSON.stringify({
      anthropic: this._isProviderConfigured(settings, 'anthropic'),
      azure: this._isProviderConfigured(settings, 'azure'),
      custom: this._isProviderConfigured(settings, 'custom'),
      deepseek: this._isProviderConfigured(settings, 'deepseek'),
      google: this._isProviderConfigured(settings, 'google'),
      groq: this._isProviderConfigured(settings, 'groq'),
      mistral: this._isProviderConfigured(settings, 'mistral'),
      ollama: this._isProviderConfigured(settings, 'ollama'),
      openai: this._isProviderConfigured(settings, 'openai'),
      openrouter: this._isProviderConfigured(settings, 'openrouter'),
      xai: this._isProviderConfigured(settings, 'xai')
    })};

    function showTab(event, tabName) {
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');
    }
    
    function showProviderConfig(providerId) {
      document.querySelectorAll('.provider-config').forEach(el => el.style.display = 'none');
      document.getElementById('config-' + providerId).style.display = 'block';
      document.getElementById('customProviderUrlGroup').style.display = providerId === 'custom' ? 'block' : 'none';
      const configured = providerConfiguredMap[providerId];
      document.getElementById('providerStatusNote').textContent = configured
        ? '${t('The selected generator provider looks configured.')}'
        : '${t('The selected generator provider still needs setup before it can draft prompts.')}';
    }
    
    function resetGeneratorPrompt() {
      document.getElementById('generatorSystemPrompt').value = \`${DEFAULT_GENERATOR_SYSTEM_PROMPT.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`;
    }
    
    function saveSettings() {
      const data = {
        defaultAgent: document.getElementById('defaultAgent').value,
        sendBehavior: document.getElementById('sendBehavior').value,
        executionSelectionMode: document.getElementById('executionSelectionMode').value,
        defaultTarget: document.getElementById('defaultTarget').value,
        outputDirectory: document.getElementById('outputDirectory').value,
        defaultModel: document.getElementById('providerSelector').value,
        ollamaEndpoint: document.getElementById('ollamaEndpoint')?.value || '',
        ollamaModel: document.getElementById('ollamaModel')?.value || '',
        openaiApiKey: document.getElementById('openaiApiKey')?.value || '',
        openaiModel: document.getElementById('openaiModel')?.value || '',
        claudeApiKey: document.getElementById('claudeApiKey')?.value || '',
        claudeModel: document.getElementById('claudeModel')?.value || '',
        groqApiKey: document.getElementById('groqApiKey')?.value || '',
        groqModel: document.getElementById('groqModel')?.value || '',
        geminiApiKey: document.getElementById('geminiApiKey')?.value || '',
        geminiModel: document.getElementById('geminiModel')?.value || '',
        openrouterApiKey: document.getElementById('openrouterApiKey')?.value || '',
        openrouterModel: document.getElementById('openrouterModel')?.value || '',
        deepseekApiKey: document.getElementById('deepseekApiKey')?.value || '',
        deepseekModel: document.getElementById('deepseekModel')?.value || '',
        mistralApiKey: document.getElementById('mistralApiKey')?.value || '',
        mistralModel: document.getElementById('mistralModel')?.value || '',
        xaiApiKey: document.getElementById('xaiApiKey')?.value || '',
        xaiModel: document.getElementById('xaiModel')?.value || '',
        azureApiKey: document.getElementById('azureApiKey')?.value || '',
        azureEndpoint: document.getElementById('azureEndpoint')?.value || '',
        azureModel: document.getElementById('azureModel')?.value || '',
        generatorSystemPrompt: document.getElementById('generatorSystemPrompt').value,
        uiLanguage: document.getElementById('uiLanguage').value
      };
      
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'save', data: data });
    }
    
    function cancel() {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'cancel' });
    }

    function updateAgentVisibility() {
      const defaultAgent = document.getElementById('defaultAgent').value;
      const sendBehaviorSelect = document.getElementById('sendBehavior');
      const sendBehaviorHint = document.getElementById('sendBehaviorHint');
      const supportedBehaviors = agentBehaviorMap[defaultAgent] || [];

      const mode = document.getElementById('executionSelectionMode').value;
      const presetVisible = mode === 'initial-recommendation';

      document.getElementById('presetAgentGroup').style.display = presetVisible ? 'block' : 'none';
      document.getElementById('outputDirectoryGroup').style.display = presetVisible && defaultAgent === 'file' ? 'block' : 'none';
      document.getElementById('sendBehaviorGroup').style.display = presetVisible && !['clipboard', 'file'].includes(defaultAgent) ? 'block' : 'none';

      Array.from(sendBehaviorSelect.options).forEach((option) => {
        option.hidden = !supportedBehaviors.includes(option.value);
      });

      const firstVisibleOption = Array.from(sendBehaviorSelect.options).find((option) => !option.hidden);
      if (firstVisibleOption && !supportedBehaviors.includes(sendBehaviorSelect.value)) {
        sendBehaviorSelect.value = firstVisibleOption.value;
      }

      sendBehaviorHint.textContent = supportedBehaviors.length > 0
        ? '${t('Supported by this agent: {0}')}'.replace('{0}', supportedBehaviors.join(', '))
        : '${t('This target uses its own delivery flow.')}';

      updateExecutionSummary();
    }

    function updateExecutionSummary() {
      const mode = document.getElementById('executionSelectionMode').value;
      const agent = document.getElementById('defaultAgent');
      const agentLabel = agent.options[agent.selectedIndex]?.text || agent.value;
      const summary = document.getElementById('executionModeSummary');

      if (mode === 'last-execution') {
        summary.textContent = '${t('Per prompt, PbP will try to reuse the last working target and behavior before falling back to new selection.')}';
        return;
      }

      if (mode === 'initial-recommendation') {
        summary.textContent = '${t('Each run will start from the preset agent {0} and its supported preset behavior.')}'.replace('{0}', agentLabel);
        return;
      }

      summary.textContent = '${t('Each run will ask for a target again, so these defaults only help with ordering and fallback.')}';
    }

    document.addEventListener('DOMContentLoaded', () => {
      updateAgentVisibility();
      showProviderConfig(document.getElementById('providerSelector').value);
    });
  </script>
</body>
</html>`;
  }

  private _getProviderConfigsHtml(settings: SettingsConfig): string {
    const providers = [
      { id: 'anthropic', name: 'Anthropic', apiKey: settings.claudeApiKey, model: settings.claudeModel, modelId: 'claudeModel', apiKeyId: 'claudeApiKey' },
      { id: 'azure', name: 'Azure OpenAI', apiKey: settings.azureApiKey, model: settings.azureModel, modelId: 'azureModel', apiKeyId: 'azureApiKey', hasEndpoint: true, endpoint: settings.azureEndpoint },
      { id: 'deepseek', name: 'DeepSeek', apiKey: settings.deepseekApiKey, model: settings.deepseekModel, modelId: 'deepseekModel', apiKeyId: 'deepseekApiKey' },
      { id: 'google', name: 'Google AI', apiKey: settings.geminiApiKey, model: settings.geminiModel, modelId: 'geminiModel', apiKeyId: 'geminiApiKey' },
      { id: 'groq', name: 'Groq', apiKey: settings.groqApiKey, model: settings.groqModel, modelId: 'groqModel', apiKeyId: 'groqApiKey' },
      { id: 'mistral', name: 'Mistral AI', apiKey: settings.mistralApiKey, model: settings.mistralModel, modelId: 'mistralModel', apiKeyId: 'mistralApiKey' },
      { id: 'ollama', name: 'Ollama (Local)', apiKey: '', model: settings.ollamaModel, modelId: 'ollamaModel', apiKeyId: '', hasEndpoint: true, endpoint: settings.ollamaEndpoint, isLocal: true },
      { id: 'openai', name: 'OpenAI', apiKey: settings.openaiApiKey, model: settings.openaiModel, modelId: 'openaiModel', apiKeyId: 'openaiApiKey' },
      { id: 'openrouter', name: 'OpenRouter', apiKey: settings.openrouterApiKey, model: settings.openrouterModel, modelId: 'openrouterModel', apiKeyId: 'openrouterApiKey' },
      { id: 'xai', name: 'xAI (Grok)', apiKey: settings.xaiApiKey, model: settings.xaiModel, modelId: 'xaiModel', apiKeyId: 'xaiApiKey' }
    ];
    
    return providers.map(p => {
      const isSelected = settings.defaultModel === p.id;
      
      return `
        <div id="config-${p.id}" class="provider-config" style="display: ${isSelected ? 'block' : 'none'}">
          ${p.hasEndpoint ? `
            <div class="form-group">
              <label for="${p.isLocal ? 'ollamaEndpoint' : 'azureEndpoint'}">${t('Endpoint')}</label>
              <input type="text" id="${p.isLocal ? 'ollamaEndpoint' : 'azureEndpoint'}" value="${this._escapeHtml(p.endpoint || '')}" placeholder="${p.isLocal ? 'http://localhost:11434' : 'https://your-resource.openai.azure.com'}">
            </div>
          ` : ''}
          ${!p.isLocal ? `
            <div class="form-group">
              <label for="${p.apiKeyId}">${t('API Key')}</label>
              <input type="password" id="${p.apiKeyId}" class="api-key-input" value="${this._escapeHtml(p.apiKey || '')}" placeholder="${t('Enter API key')}">
            </div>
          ` : ''}
          <div class="form-group">
            <label for="${p.modelId}">${t('Model')}</label>
            <input type="text" id="${p.modelId}" value="${this._escapeHtml(p.model || '')}" placeholder="${t('Default model')}">
          </div>
        </div>
      `;
    }).join('');
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  public dispose(): void {
    SettingsPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) { x.dispose(); }
    }
  }
}
