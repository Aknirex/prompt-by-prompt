/**
 * Settings Panel - Webview-based settings interface
 */

import * as vscode from 'vscode';
import { AI_PROVIDERS, AIProvider } from '../services/aiService';

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
  
  // Generator system prompt
  generatorSystemPrompt: string;
  
  // File output settings
  outputDirectory: string;
}

/**
 * Default generator system prompt
 */
export const DEFAULT_GENERATOR_SYSTEM_PROMPT = `You are a prompt engineering assistant. Your task is to help users create effective prompts for AI assistants.

When generating prompts:
1. Be clear and specific about the task
2. Include relevant context variables like {{selection}}, {{filepath}}, {{lang}}
3. Structure the prompt logically with clear sections
4. Consider the target AI's capabilities and limitations

Available context variables:
- {{selection}}: Currently selected text in the editor
- {{filepath}}: Path of the current file
- {{file_content}}: Full content of the current file
- {{lang}}: Programming language of the current file
- {{project_name}}: Name of the current project
- {{line_number}}: Current line number
- {{column_number}}: Current column number

Respond with ONLY the generated prompt, no explanations or markdown formatting.`;

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
          case 'reset':
            this._update();
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
      
      // Generator system prompt
      await this._context.globalState.update('pbp.generatorSystemPrompt', data.generatorSystemPrompt);
      
      // File output settings
      await config.update('outputDirectory', data.outputDirectory, vscode.ConfigurationTarget.Global);
      
      vscode.window.showInformationMessage('Settings saved successfully!');
      this._panel.dispose();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to save settings: ${error}`);
    }
  }

  private _getSettings(): SettingsConfig {
    const config = vscode.workspace.getConfiguration('pbp');
    
    return {
      defaultAgent: config.get('defaultAgent') || 'clipboard',
      rememberLastAgent: config.get('rememberLastAgent') ?? true,
      defaultTarget: config.get('defaultTarget') || 'global',
      defaultModel: (config.get('defaultModel') || 'ollama') as AIProvider,
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
      generatorSystemPrompt: this._context.globalState.get('pbp.generatorSystemPrompt') || DEFAULT_GENERATOR_SYSTEM_PROMPT,
      outputDirectory: config.get('outputDirectory') || '.prompts/output',
    };
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const settings = this._getSettings();
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt by Prompt Settings</title>
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
      border-radius: 8px;
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
      border-radius: 4px;
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
      border-radius: 4px;
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
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    
    .provider-card {
      background-color: var(--vscode-editor-background);
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    .provider-card h3 {
      margin: 0 0 10px 0;
      font-size: 1em;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .provider-card.configured h3::before {
      content: "";
    }
    
    .provider-card.not-configured h3::before {
      content: "";
    }
    
    .status-badge {
      font-size: 0.75em;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: auto;
    }
    
    .status-badge.configured {
      background-color: var(--vscode-testing-iconPassed);
      color: white;
    }
    
    .status-badge.not-configured {
      background-color: var(--vscode-testing-iconQueued);
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
      border-radius: 4px 4px 0 0;
    }
    
    .tab.active {
      background-color: var(--vscode-editor-inactiveSelectionBackground);
      color: var(--vscode-editor-foreground);
    }
    
    .tab-content { display: none; }
    
    .tab-content.active { display: block; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Prompt by Prompt Settings</h1>
    
    <div class="tabs">
      <button class="tab active" onclick="showTab('general')">General</button>
      <button class="tab" onclick="showTab('providers')">AI Providers</button>
      <button class="tab" onclick="showTab('generator')">Generator</button>
    </div>
    
    <!-- General Tab -->
    <div id="tab-general" class="tab-content active">
      <div class="section">
        <h2>Agent Settings</h2>
        
        <div class="form-group">
          <label for="defaultAgent">Default Agent</label>
          <select id="defaultAgent">
            <option value="clipboard" ${settings.defaultAgent === 'clipboard' ? 'selected' : ''}>Copy to Clipboard</option>
            <option value="cline" ${settings.defaultAgent === 'cline' ? 'selected' : ''}>Cline</option>
            <option value="roo-code" ${settings.defaultAgent === 'roo-code' ? 'selected' : ''}>Roo Code</option>
            <option value="copilot" ${settings.defaultAgent === 'copilot' ? 'selected' : ''}>GitHub Copilot</option>
            <option value="continue" ${settings.defaultAgent === 'continue' ? 'selected' : ''}>Continue</option>
          </select>
          <div class="hint">The default agent to send prompts to when executing</div>
        </div>
        
        <div class="form-group checkbox-group">
          <input type="checkbox" id="rememberLastAgent" ${settings.rememberLastAgent ? 'checked' : ''}>
          <label for="rememberLastAgent">Remember last used agent</label>
        </div>
      </div>
      
      <div class="section">
        <h2>Storage Settings</h2>
        
        <div class="form-group">
          <label for="defaultTarget">Default Save Location</label>
          <select id="defaultTarget">
            <option value="global" ${settings.defaultTarget === 'global' ? 'selected' : ''}>Global (VS Code Settings)</option>
            <option value="workspace" ${settings.defaultTarget === 'workspace' ? 'selected' : ''}>Workspace (.prompts folder)</option>
          </select>
          <div class="hint">Where to save new prompts by default. Global prompts are available in all projects.</div>
        </div>
        
        <div class="form-group">
          <label for="outputDirectory">Output Directory</label>
          <input type="text" id="outputDirectory" value="${this._escapeHtml(settings.outputDirectory)}" placeholder=".prompts/output">
          <div class="hint">Directory for generated markdown files (relative to workspace or absolute path)</div>
        </div>
      </div>
    </div>
    
    <!-- AI Providers Tab -->
    <div id="tab-providers" class="tab-content">
      <div class="section">
        <h2>AI Provider Configuration</h2>
        <div class="hint" style="margin-bottom: 16px;">Configure your AI providers for prompt generation. Each provider requires an API key except Ollama (local).</div>
        
        <div class="form-group">
          <label for="defaultModel">Default Provider</label>
          <select id="defaultModel">
            ${AI_PROVIDERS.map(p => `<option value="${p.id}" ${settings.defaultModel === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
          <div class="hint">The default provider for AI prompt generation</div>
        </div>
        
        <div class="provider-grid">
          ${this._getProviderCardsHtml(settings)}
        </div>
      </div>
    </div>
    
    <!-- Generator Tab -->
    <div id="tab-generator" class="tab-content">
      <div class="section">
        <h2>Prompt Generator System Prompt</h2>
        <div class="hint" style="margin-bottom: 12px;">Customize the system prompt used when generating new prompts with AI assistance</div>
        
        <div class="form-group">
          <label for="generatorSystemPrompt">System Prompt</label>
          <textarea id="generatorSystemPrompt" rows="15">${this._escapeHtml(settings.generatorSystemPrompt)}</textarea>
        </div>
        
        <button type="button" class="secondary" onclick="resetGeneratorPrompt()">Reset to Default</button>
      </div>
    </div>
    
    <div class="buttons">
      <button type="button" class="primary" onclick="save()">Save Settings</button>
      <button type="button" class="secondary" onclick="cancel()">Cancel</button>
    </div>
  </div>
  
  <script>
    function showTab(tabName) {
      document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
      event.target.classList.add('active');
    }
    
    function resetGeneratorPrompt() {
      document.getElementById('generatorSystemPrompt').value = \`${DEFAULT_GENERATOR_SYSTEM_PROMPT.replace(/`/g, '\\`').replace(/\n/g, '\\n')}\`;
    }
    
    function save() {
      const data = {
        defaultAgent: document.getElementById('defaultAgent').value,
        rememberLastAgent: document.getElementById('rememberLastAgent').checked,
        defaultTarget: document.getElementById('defaultTarget').value,
        defaultModel: document.getElementById('defaultModel').value,
        ollamaEndpoint: document.getElementById('ollamaEndpoint').value,
        ollamaModel: document.getElementById('ollamaModel').value,
        openaiApiKey: document.getElementById('openaiApiKey').value,
        openaiModel: document.getElementById('openaiModel').value,
        claudeApiKey: document.getElementById('claudeApiKey').value,
        claudeModel: document.getElementById('claudeModel').value,
        groqApiKey: document.getElementById('groqApiKey').value,
        groqModel: document.getElementById('groqModel').value,
        geminiApiKey: document.getElementById('geminiApiKey').value,
        geminiModel: document.getElementById('geminiModel').value,
        openrouterApiKey: document.getElementById('openrouterApiKey').value,
        openrouterModel: document.getElementById('openrouterModel').value,
        generatorSystemPrompt: document.getElementById('generatorSystemPrompt').value,
        outputDirectory: document.getElementById('outputDirectory').value
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

  private _getProviderCardsHtml(settings: SettingsConfig): string {
    const providers = [
      { id: 'ollama', name: 'Ollama (Local)', endpoint: true, apiKey: false, model: settings.ollamaModel, modelId: 'ollamaModel', endpointValue: settings.ollamaEndpoint },
      { id: 'openai', name: 'OpenAI', endpoint: false, apiKey: true, model: settings.openaiModel, modelId: 'openaiModel', apiKeyValue: settings.openaiApiKey },
      { id: 'claude', name: 'Anthropic Claude', endpoint: false, apiKey: true, model: settings.claudeModel, modelId: 'claudeModel', apiKeyValue: settings.claudeApiKey },
      { id: 'groq', name: 'Groq', endpoint: false, apiKey: true, model: settings.groqModel, modelId: 'groqModel', apiKeyValue: settings.groqApiKey },
      { id: 'gemini', name: 'Google Gemini', endpoint: false, apiKey: true, model: settings.geminiModel, modelId: 'geminiModel', apiKeyValue: settings.geminiApiKey },
      { id: 'openrouter', name: 'OpenRouter', endpoint: false, apiKey: true, model: settings.openrouterModel, modelId: 'openrouterModel', apiKeyValue: settings.openrouterApiKey }
    ];
    
    return providers.map(p => {
      const isConfigured = p.id === 'ollama' || !!p.apiKeyValue;
      const statusClass = isConfigured ? 'configured' : 'not-configured';
      const statusText = isConfigured ? 'Configured' : 'Not Configured';
      
      return `
        <div class="provider-card ${statusClass}">
          <h3>
            ${p.name}
            <span class="status-badge ${statusClass}">${statusText}</span>
          </h3>
          ${p.endpoint ? `
            <div class="form-group">
              <label for="ollamaEndpoint">Endpoint</label>
              <input type="text" id="ollamaEndpoint" value="${this._escapeHtml(p.endpointValue || '')}" placeholder="http://localhost:11434">
            </div>
          ` : ''}
          ${p.apiKey ? `
            <div class="form-group">
              <label for="${p.id}ApiKey">API Key</label>
              <input type="password" id="${p.id}ApiKey" class="api-key-input" value="${this._escapeHtml(p.apiKeyValue || '')}" placeholder="Enter API key">
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
