/**
 * Settings Panel - Webview-based settings interface
 */

import * as vscode from 'vscode';

/**
 * Settings configuration
 */
export interface SettingsConfig {
  // Default agent settings
  defaultAgent: string;
  rememberLastAgent: boolean;
  
  // Execution behavior
  executionMode: 'ask' | 'direct' | 'preview';
  defaultTarget: 'workspace' | 'global';
  
  // AI Provider settings (BYOK)
  defaultModel: string;
  ollamaEndpoint: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  groqApiKey: string;
  groqModel: string;
  
  // Generator system prompt
  generatorSystemPrompt: string;
  
  // File output settings
  outputDirectory: string;
  outputAction: 'copy' | 'send' | 'append' | 'create-file';
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
- {{column_number}}: Current column number`;

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

    // If we already have a panel, show it
    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return SettingsPanel.currentPanel;
    }

    // Create a new panel
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

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
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
      
      // Execution settings
      await config.update('executionMode', data.executionMode, vscode.ConfigurationTarget.Global);
      await config.update('defaultTarget', data.defaultTarget, vscode.ConfigurationTarget.Global);
      
      // AI Provider settings
      await config.update('defaultModel', data.defaultModel, vscode.ConfigurationTarget.Global);
      await config.update('ollamaEndpoint', data.ollamaEndpoint, vscode.ConfigurationTarget.Global);
      await config.update('ollamaModel', data.ollamaModel, vscode.ConfigurationTarget.Global);
      await config.update('openaiApiKey', data.openaiApiKey, vscode.ConfigurationTarget.Global);
      await config.update('openaiModel', data.openaiModel, vscode.ConfigurationTarget.Global);
      await config.update('claudeApiKey', data.claudeApiKey, vscode.ConfigurationTarget.Global);
      await config.update('claudeModel', data.claudeModel, vscode.ConfigurationTarget.Global);
      await config.update('groqApiKey', data.groqApiKey, vscode.ConfigurationTarget.Global);
      await config.update('groqModel', data.groqModel, vscode.ConfigurationTarget.Global);
      
      // Generator system prompt (stored in global state for longer content)
      await this._context.globalState.update('pbp.generatorSystemPrompt', data.generatorSystemPrompt);
      
      // File output settings
      await config.update('outputDirectory', data.outputDirectory, vscode.ConfigurationTarget.Global);
      await config.update('outputAction', data.outputAction, vscode.ConfigurationTarget.Global);
      
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
      executionMode: config.get('executionMode') || 'ask',
      defaultTarget: config.get('defaultTarget') || 'global',
      defaultModel: config.get('defaultModel') || 'ollama',
      ollamaEndpoint: config.get('ollamaEndpoint') || 'http://localhost:11434',
      ollamaModel: config.get('ollamaModel') || 'llama3.2',
      openaiApiKey: config.get('openaiApiKey') || '',
      openaiModel: config.get('openaiModel') || 'gpt-4o-mini',
      claudeApiKey: config.get('claudeApiKey') || '',
      claudeModel: config.get('claudeModel') || 'claude-3-5-sonnet-20241022',
      groqApiKey: config.get('groqApiKey') || '',
      groqModel: config.get('groqModel') || 'llama-3.3-70b-versatile',
      generatorSystemPrompt: this._context.globalState.get('pbp.generatorSystemPrompt') || DEFAULT_GENERATOR_SYSTEM_PROMPT,
      outputDirectory: config.get('outputDirectory') || '.prompts/output',
      outputAction: config.get('outputAction') || 'copy',
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
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      padding: 20px;
      margin: 0;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
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
      border-radius: 8px;
      margin-bottom: 20px;
    }
    
    .form-group {
      margin-bottom: 14px;
    }
    
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
    
    .checkbox-group input[type="checkbox"] {
      width: auto;
    }
    
    .checkbox-group label {
      margin-bottom: 0;
      font-weight: normal;
    }
    
    .row {
      display: flex;
      gap: 16px;
    }
    
    .row .form-group {
      flex: 1;
    }
    
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
    
    .api-key-input {
      font-family: monospace;
    }
    
    .provider-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }
    
    .provider-card {
      background-color: var(--vscode-editor-background);
      padding: 12px;
      border-radius: 6px;
      border: 1px solid var(--vscode-panel-border);
    }
    
    .provider-card h3 {
      margin-top: 0;
      margin-bottom: 10px;
      font-size: 1em;
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
    
    .tab-content {
      display: none;
    }
    
    .tab-content.active {
      display: block;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚙️ Prompt by Prompt Settings</h1>
    
    <div class="tabs">
      <button class="tab active" onclick="showTab('general')">General</button>
      <button class="tab" onclick="showTab('providers')">AI Providers</button>
      <button class="tab" onclick="showTab('generator')">Generator</button>
      <button class="tab" onclick="showTab('output')">Output</button>
    </div>
    
    <!-- General Tab -->
    <div id="tab-general" class="tab-content active">
      <div class="section">
        <h2>🤖 Agent Settings</h2>
        
        <div class="form-group">
          <label for="defaultAgent">Default Agent</label>
          <select id="defaultAgent">
            <option value="clipboard" ${settings.defaultAgent === 'clipboard' ? 'selected' : ''}>Copy to Clipboard</option>
            <option value="cline" ${settings.defaultAgent === 'cline' ? 'selected' : ''}>Cline</option>
            <option value="roo-code" ${settings.defaultAgent === 'roo-code' ? 'selected' : ''}>Roo Code</option>
            <option value="copilot" ${settings.defaultAgent === 'copilot' ? 'selected' : ''}>GitHub Copilot</option>
            <option value="continue" ${settings.defaultAgent === 'continue' ? 'selected' : ''}>Continue</option>
          </select>
          <div class="hint">The default agent to send prompts to</div>
        </div>
        
        <div class="form-group checkbox-group">
          <input type="checkbox" id="rememberLastAgent" ${settings.rememberLastAgent ? 'checked' : ''}>
          <label for="rememberLastAgent">Remember last used agent</label>
        </div>
      </div>
      
      <div class="section">
        <h2>⚡ Execution Behavior</h2>
        
        <div class="form-group">
          <label for="executionMode">Default Execution Mode</label>
          <select id="executionMode">
            <option value="ask" ${settings.executionMode === 'ask' ? 'selected' : ''}>Ask every time</option>
            <option value="direct" ${settings.executionMode === 'direct' ? 'selected' : ''}>Send directly</option>
            <option value="preview" ${settings.executionMode === 'preview' ? 'selected' : ''}>Always preview first</option>
          </select>
          <div class="hint">How to handle prompt execution</div>
        </div>
        
        <div class="form-group">
          <label for="defaultTarget">Default Save Location</label>
          <select id="defaultTarget">
            <option value="workspace" ${settings.defaultTarget === 'workspace' ? 'selected' : ''}>Workspace (.prompts folder)</option>
            <option value="global" ${settings.defaultTarget === 'global' ? 'selected' : ''}>Global (VS Code Settings)</option>
          </select>
          <div class="hint">Where to save new prompts by default</div>
        </div>
      </div>
    </div>
    
    <!-- AI Providers Tab -->
    <div id="tab-providers" class="tab-content">
      <div class="section">
        <h2>🔑 AI Provider Configuration (BYOK)</h2>
        <div class="hint" style="margin-bottom: 16px;">Bring Your Own Key - Configure your API keys for various AI providers</div>
        
        <div class="form-group">
          <label for="defaultModel">Default AI Provider</label>
          <select id="defaultModel">
            <option value="ollama" ${settings.defaultModel === 'ollama' ? 'selected' : ''}>Ollama (Local)</option>
            <option value="openai" ${settings.defaultModel === 'openai' ? 'selected' : ''}>OpenAI</option>
            <option value="claude" ${settings.defaultModel === 'claude' ? 'selected' : ''}>Anthropic Claude</option>
            <option value="groq" ${settings.defaultModel === 'groq' ? 'selected' : ''}>Groq</option>
          </select>
        </div>
        
        <div class="provider-grid">
          <div class="provider-card">
            <h3>🦙 Ollama (Local)</h3>
            <div class="form-group">
              <label for="ollamaEndpoint">Endpoint</label>
              <input type="text" id="ollamaEndpoint" value="${this._escapeHtml(settings.ollamaEndpoint)}" placeholder="http://localhost:11434">
            </div>
            <div class="form-group">
              <label for="ollamaModel">Model</label>
              <input type="text" id="ollamaModel" value="${this._escapeHtml(settings.ollamaModel)}" placeholder="llama3.2">
            </div>
          </div>
          
          <div class="provider-card">
            <h3>🤖 OpenAI</h3>
            <div class="form-group">
              <label for="openaiApiKey">API Key</label>
              <input type="password" id="openaiApiKey" class="api-key-input" value="${this._escapeHtml(settings.openaiApiKey)}" placeholder="sk-...">
            </div>
            <div class="form-group">
              <label for="openaiModel">Model</label>
              <input type="text" id="openaiModel" value="${this._escapeHtml(settings.openaiModel)}" placeholder="gpt-4o-mini">
            </div>
          </div>
          
          <div class="provider-card">
            <h3>🧠 Anthropic Claude</h3>
            <div class="form-group">
              <label for="claudeApiKey">API Key</label>
              <input type="password" id="claudeApiKey" class="api-key-input" value="${this._escapeHtml(settings.claudeApiKey)}" placeholder="sk-ant-...">
            </div>
            <div class="form-group">
              <label for="claudeModel">Model</label>
              <input type="text" id="claudeModel" value="${this._escapeHtml(settings.claudeModel)}" placeholder="claude-3-5-sonnet-20241022">
            </div>
          </div>
          
          <div class="provider-card">
            <h3>⚡ Groq</h3>
            <div class="form-group">
              <label for="groqApiKey">API Key</label>
              <input type="password" id="groqApiKey" class="api-key-input" value="${this._escapeHtml(settings.groqApiKey)}" placeholder="gsk_...">
            </div>
            <div class="form-group">
              <label for="groqModel">Model</label>
              <input type="text" id="groqModel" value="${this._escapeHtml(settings.groqModel)}" placeholder="llama-3.3-70b-versatile">
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- Generator Tab -->
    <div id="tab-generator" class="tab-content">
      <div class="section">
        <h2>📝 Prompt Generator System Prompt</h2>
        <div class="hint" style="margin-bottom: 12px;">Customize the system prompt used when generating new prompts with AI assistance</div>
        
        <div class="form-group">
          <label for="generatorSystemPrompt">System Prompt</label>
          <textarea id="generatorSystemPrompt" rows="15">${this._escapeHtml(settings.generatorSystemPrompt)}</textarea>
        </div>
        
        <button type="button" class="secondary" onclick="resetGeneratorPrompt()">Reset to Default</button>
      </div>
    </div>
    
    <!-- Output Tab -->
    <div id="tab-output" class="tab-content">
      <div class="section">
        <h2>📁 Output Settings</h2>
        
        <div class="form-group">
          <label for="outputAction">Default Output Action</label>
          <select id="outputAction">
            <option value="copy" ${settings.outputAction === 'copy' ? 'selected' : ''}>Copy to clipboard</option>
            <option value="send" ${settings.outputAction === 'send' ? 'selected' : ''}>Send to agent</option>
            <option value="append" ${settings.outputAction === 'append' ? 'selected' : ''}>Append to agent input</option>
            <option value="create-file" ${settings.outputAction === 'create-file' ? 'selected' : ''}>Create markdown file and reference</option>
          </select>
          <div class="hint">What to do with the generated prompt by default</div>
        </div>
        
        <div class="form-group">
          <label for="outputDirectory">Output Directory</label>
          <input type="text" id="outputDirectory" value="${this._escapeHtml(settings.outputDirectory)}" placeholder=".prompts/output">
          <div class="hint">Directory for generated markdown files (relative to workspace or absolute path)</div>
        </div>
      </div>
    </div>
    
    <div class="buttons">
      <button type="button" class="primary" onclick="save()">💾 Save Settings</button>
      <button type="button" class="secondary" onclick="cancel()">Cancel</button>
    </div>
  </div>
  
  <script>
    function showTab(tabName) {
      // Hide all tabs
      document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
      });
      
      // Show selected tab
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
        executionMode: document.getElementById('executionMode').value,
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
        generatorSystemPrompt: document.getElementById('generatorSystemPrompt').value,
        outputDirectory: document.getElementById('outputDirectory').value,
        outputAction: document.getElementById('outputAction').value
      };
      
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'save',
        data: data
      });
    }
    
    function cancel() {
      const vscode = acquireVsCodeApi();
      vscode.postMessage({
        command: 'cancel'
      });
    }
  </script>
</body>
</html>`;
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
      if (x) {
        x.dispose();
      }
    }
  }
}
