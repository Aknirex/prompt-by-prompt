/**
 * Settings Panel - Webview-based settings interface
 */

import * as vscode from 'vscode';
import { AI_PROVIDERS, AIProvider, DEFAULT_GENERATOR_SYSTEM_PROMPT } from '../services/aiService';
import { t } from '../utils/i18n';

/**
 * Settings configuration
 */
export interface SettingsConfig {
  // Agent settings
  defaultAgent: string;
  rememberLastAgent: boolean;
  
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
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
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

    SettingsPanel.currentPanel = new SettingsPanel(panel, extensionUri, context);
    return SettingsPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;

    this._update();
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            await this._saveSettings(message.data);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _saveSettings(data: SettingsConfig): Promise<void> {
    const config = vscode.workspace.getConfiguration('pbp');
    
    try {
      // Agent settings
      await config.update('defaultAgent', data.defaultAgent, vscode.ConfigurationTarget.Global);
      await config.update('rememberLastAgent', data.rememberLastAgent, vscode.ConfigurationTarget.Global);
      await config.update('defaultTarget', data.defaultTarget, vscode.ConfigurationTarget.Global);
      
      // AI Provider settings
      await config.update('defaultModel', data.defaultModel, vscode.ConfigurationTarget.Global);
      await config.update('customProviderUrl', data.customProviderUrl, vscode.ConfigurationTarget.Global);
      
      // Provider-specific settings
      await config.update('ollamaEndpoint', data.ollamaEndpoint, vscode.ConfigurationTarget.Global);
      await config.update('ollamaModel', data.ollamaModel, vscode.ConfigurationTarget.Global);
      await config.update('openaiApiKey', data.openaiApiKey, vscode.ConfigurationTarget.Global);
      await config.update('openaiModel', data.openaiModel, vscode.ConfigurationTarget.Global);
      await config.update('claudeApiKey', data.claudeApiKey, vscode.ConfigurationTarget.Global);
      await config.update('claudeModel', data.claudeModel, vscode.ConfigurationTarget.Global);
      await config.update('groqApiKey', data.groqApiKey, vscode.ConfigurationTarget.Global);
      await config.update('groqModel', data.groqModel, vscode.ConfigurationTarget.Global);
      await config.update('geminiApiKey', data.geminiApiKey, vscode.ConfigurationTarget.Global);
      await config.update('geminiModel', data.geminiModel, vscode.ConfigurationTarget.Global);
      await config.update('openrouterApiKey', data.openrouterApiKey, vscode.ConfigurationTarget.Global);
      await config.update('openrouterModel', data.openrouterModel, vscode.ConfigurationTarget.Global);
      await config.update('deepseekApiKey', data.deepseekApiKey, vscode.ConfigurationTarget.Global);
      await config.update('deepseekModel', data.deepseekModel, vscode.ConfigurationTarget.Global);
      await config.update('mistralApiKey', data.mistralApiKey, vscode.ConfigurationTarget.Global);
      await config.update('mistralModel', data.mistralModel, vscode.ConfigurationTarget.Global);
      await config.update('xaiApiKey', data.xaiApiKey, vscode.ConfigurationTarget.Global);
      await config.update('xaiModel', data.xaiModel, vscode.ConfigurationTarget.Global);
      await config.update('azureApiKey', data.azureApiKey, vscode.ConfigurationTarget.Global);
      await config.update('azureEndpoint', data.azureEndpoint, vscode.ConfigurationTarget.Global);
      await config.update('azureModel', data.azureModel, vscode.ConfigurationTarget.Global);
      
      // Generator system prompt
      await this._context.globalState.update('pbp.generatorSystemPrompt', data.generatorSystemPrompt);

      // File output settings
      await config.update('outputDirectory', data.outputDirectory, vscode.ConfigurationTarget.Global);
      await config.update('uiLanguage', data.uiLanguage, vscode.ConfigurationTarget.Global);
      
      vscode.window.showInformationMessage(t('Settings saved successfully!'));
      this._panel.dispose();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
    }
  }

  private _getSettings(): SettingsConfig {
    const config = vscode.workspace.getConfiguration('pbp');
    
    return {
      defaultAgent: config.get('defaultAgent') || 'ask',
      rememberLastAgent: config.get('rememberLastAgent') ?? true,
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

  private _getHtmlForWebview(_webview: vscode.Webview): string {
    const settings = this._getSettings();
    
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
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${t('Prompt by Prompt Settings')}</h1>

      <div class="tabs">
        <button class="tab active" onclick="showTab('general')">${t('General Settings')}</button>
        <button class="tab" onclick="showTab('providers')">${t('AI Provider Configuration')}</button>
      </div>

      <!-- General Tab -->
      <div id="tab-general" class="tab-content active">
        <div class="section">
          <h2>${t('General Settings')}</h2>
          
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

          <h2>${t('Agent Settings')}</h2>
          
          <div class="form-group">
            <label for="defaultAgent">${t('Default Agent')}</label>
            <select id="defaultAgent">
              <option value="ask" ${settings.defaultAgent === 'ask' ? 'selected' : ''}>${t('Ask Every Time')}</option>
              <option value="clipboard" ${settings.defaultAgent === 'clipboard' ? 'selected' : ''}>${t('Copy to Clipboard')}</option>
              <option value="cline" ${settings.defaultAgent === 'cline' ? 'selected' : ''}>Cline</option>
              <option value="roo-code" ${settings.defaultAgent === 'roo-code' ? 'selected' : ''}>Roo Code</option>
              <option value="copilot" ${settings.defaultAgent === 'copilot' ? 'selected' : ''}>GitHub Copilot</option>
              <option value="continue" ${settings.defaultAgent === 'continue' ? 'selected' : ''}>Continue</option>
            </select>
            <div class="hint">${t('The default agent to send prompts to when executing')}</div>
          </div>
          
          <div class="form-group checkbox-group">
            <input type="checkbox" id="rememberLastAgent" ${settings.rememberLastAgent ? 'checked' : ''}>
            <label for="rememberLastAgent">${t('Remember last used agent')}</label>
          </div>
        </div>
        
        <div class="section">
          <h2>${t('Storage Settings')}</h2>

          <div class="form-group">
            <label for="defaultTarget">${t('Target')}</label>
            <select id="defaultTarget">
              <option value="global" ${settings.defaultTarget === 'global' ? 'selected' : ''}>${t('Global')}</option>
              <option value="workspace" ${settings.defaultTarget === 'workspace' ? 'selected' : ''}>${t('Workspace')}</option>
            </select>
            <div class="hint">${t('Where to save new prompts by default. Global prompts are available in all projects.')}</div>
          </div>

          <div class="form-group">
            <label for="outputDirectory">${t('Output Directory')}</label>
            <input type="text" id="outputDirectory" value="${this._escapeHtml(settings.outputDirectory)}" placeholder=".prompts/output">
            <div class="hint">${t('Directory for generated markdown files (relative to workspace or absolute path)')}</div>
          </div>
        </div>
      </div>
      
      <!-- AI Providers Tab -->
      <div id="tab-providers" class="tab-content">
        <div class="section">
          <h2>${t('AI Provider Configuration')}</h2>
          <div class="hint" style="margin-bottom: 16px;">${t('Configure your AI providers for prompt generation. Each provider requires an API key except Ollama (local).')}</div>
          
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
          
          <div id="provider-configs">
            ${this._getProviderConfigsHtml(settings)}
          </div>
        </div>
        
        <div class="section">
          <h2>${t('Prompt Generator')}</h2>
          <p>${t('Configure the system prompt used by the AI when generating new prompt templates.')}</p>
          
            <div class="form-group">
              <label for="generatorSystemPrompt">${t('System Prompt')}</label>
              <textarea id="generatorSystemPrompt" rows="15">${this._escapeHtml(settings.generatorSystemPrompt)}</textarea>
            </div>

            <button type="button" class="secondary" onclick="resetGeneratorPrompt()">${t('Reset to Default')}</button>
          </div>
      </div>

      <div class="buttons">
        <button type="button" class="primary" onclick="saveSettings()">${t('Save Settings')}</button>
        <button type="button" class="secondary" onclick="resetGeneratorPrompt()">${t('Reset to Default')}</button>
      </div>
  </div>

  <script>
    function showTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');
    }
    
    function showProviderConfig(providerId) {
      document.querySelectorAll('.provider-config').forEach(el => el.style.display = 'none');
      document.getElementById('config-' + providerId).style.display = 'block';
    }
    
    function resetGeneratorPrompt() {
      document.getElementById('generatorSystemPrompt').value = \`${DEFAULT_GENERATOR_SYSTEM_PROMPT.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`;
    }
    
    function saveSettings() {
      const data = {
        defaultAgent: document.getElementById('defaultAgent').value,
        rememberLastAgent: document.getElementById('rememberLastAgent').checked,
        defaultTarget: document.getElementById('defaultTarget').value,
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
        outputDirectory: document.getElementById('outputDirectory').value,
        uiLanguage: document.getElementById('uiLanguage').value
      };
      
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'save', data: data });
    }
    
    function cancel() {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({ command: 'cancel' });
    }
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
              <label for="${p.isLocal ? 'ollamaEndpoint' : 'azureEndpoint'}">Endpoint</label>
              <input type="text" id="${p.isLocal ? 'ollamaEndpoint' : 'azureEndpoint'}" value="${this._escapeHtml(p.endpoint || '')}" placeholder="${p.isLocal ? 'http://localhost:11434' : 'https://your-resource.openai.azure.com'}">
            </div>
          ` : ''}
          ${!p.isLocal ? `
            <div class="form-group">
              <label for="${p.apiKeyId}">API Key</label>
              <input type="password" id="${p.apiKeyId}" class="api-key-input" value="${this._escapeHtml(p.apiKey || '')}" placeholder="Enter API key">
            </div>
          ` : ''}
          <div class="form-group">
            <label for="${p.modelId}">Model</label>
            <input type="text" id="${p.modelId}" value="${this._escapeHtml(p.model || '')}" placeholder="Default model">
          </div>
        </div>
      `;
    }).join('');
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
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
