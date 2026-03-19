/**
 * Prompt Editor Panel - Webview-based editor for creating/editing prompts
 */

import * as vscode from 'vscode';
import { PromptTemplate, PromptVariable } from '../types/prompt';
import { AIService, AIProvider, DEFAULT_GENERATOR_SYSTEM_PROMPT } from '../services/aiService';
import { t } from '../utils/i18n';

/**
 * Result from the prompt editor
 */
export interface PromptEditorResult {
  name: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables?: PromptVariable[];
  target: 'workspace' | 'global';
}

/**
 * Prompt Editor Panel using Webview
 */
export class PromptEditorPanel {
  public static currentPanel: PromptEditorPanel | undefined;
  public static readonly viewType = 'pbp.promptEditor';
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _context: vscode.ExtensionContext;
  private readonly _aiService: AIService;
  private _disposables: vscode.Disposable[] = [];
  private _onSave: ((result: PromptEditorResult) => void) | undefined;
  private _existingPrompt: PromptTemplate | undefined;

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    existingPrompt?: PromptTemplate,
    defaultTarget: 'workspace' | 'global' = 'global',
    onSave?: (result: PromptEditorResult) => void
  ): PromptEditorPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (PromptEditorPanel.currentPanel) {
      PromptEditorPanel.currentPanel._panel.reveal(column);
      if (existingPrompt) {
        PromptEditorPanel.currentPanel._existingPrompt = existingPrompt;
        PromptEditorPanel.currentPanel._update();
      }
      if (onSave) {
        PromptEditorPanel.currentPanel._onSave = onSave;
      }
      return PromptEditorPanel.currentPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      PromptEditorPanel.viewType,
      existingPrompt ? `Edit: ${existingPrompt.name}` : 'New Prompt',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    PromptEditorPanel.currentPanel = new PromptEditorPanel(panel, extensionUri, context, existingPrompt, defaultTarget, onSave);
    return PromptEditorPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    existingPrompt?: PromptTemplate,
    private readonly _defaultTarget: 'workspace' | 'global' = 'global',
    onSave?: (result: PromptEditorResult) => void
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._context = context;
    this._existingPrompt = existingPrompt;
    this._onSave = onSave;
    this._aiService = new AIService(context);

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'save':
            if (this._onSave) {
              this._onSave(message.data);
            }
            this._panel.dispose();
            break;
          case 'cancel':
            this._panel.dispose();
            break;
          case 'generate':
            await this._handleGenerate(message.data);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  private async _handleGenerate(data: { description: string; provider: AIProvider; model: string }): Promise<void> {
    if (!data.description || !data.description.trim()) {
      this._panel.webview.postMessage({
        command: 'generateResult',
        error: t('Please enter a description for the prompt you want to generate.')
      });
      return;
    }

    this._panel.webview.postMessage({
      command: 'generateStart'
    });

    const systemPrompt = (this._context.globalState.get('pbp.generatorSystemPrompt') as string) || DEFAULT_GENERATOR_SYSTEM_PROMPT;

    const result = await this._aiService.generatePrompt({
      userDescription: data.description,
      systemPrompt: systemPrompt,
      provider: data.provider,
      model: data.model
    });

    if (result.success && result.prompt) {
      this._panel.webview.postMessage({
        command: 'generateResult',
        prompt: result.prompt
      });
    } else {
      this._panel.webview.postMessage({
        command: 'generateResult',
        error: result.error || 'Failed to generate prompt'
      });
    }
  }

  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getHtmlForWebview(_webview: vscode.Webview): string {
      const prompt = this._existingPrompt;
      const isNew = !prompt;
      const providers = this._aiService.getAvailableProviders();
      const config = vscode.workspace.getConfiguration('pbp');
      const defaultProvider = config.get('defaultModel') || 'ollama';
      const defaultModel = config.get(`${defaultProvider}Model`) || '';

      return `<!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${isNew ? t('Create New Prompt') : t('Edit Prompt')}</title>
    <style>
      * { box-sizing: border-box; }
      
      body {
        font-family: var(--vscode-font-family);
        background-color: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        padding: 20px;
        margin: 0;
        font-size: 14px;
      }
      
      .container { max-width: 900px; margin: 0 auto; }
      
      h1 {
        margin-bottom: 20px;
        font-size: 1.5em;
        border-bottom: 1px solid var(--vscode-panel-border);
        padding-bottom: 10px;
      }
      
      h2 {
        font-size: 1.1em;
        margin: 0 0 12px 0;
      }
      
      .form-group { margin-bottom: 16px; }
      
      label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
      }
      
      input[type="text"],
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
        min-height: 200px;
        resize: vertical;
        font-family: var(--vscode-editor-font-family);
      }
      
      textarea.template { min-height: 300px; }
      
      .hint {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
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
        border-radius: 0;
        cursor: pointer;
        font-family: inherit;
        font-size: inherit;
      }
      
      button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      
      button.primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      
      button.primary:hover:not(:disabled) {
        background-color: var(--vscode-button-hoverBackground);
      }
      
      button.secondary {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
      }
      
      button.secondary:hover:not(:disabled) {
        background-color: var(--vscode-button-secondaryHoverBackground);
      }
      
      .variables-section {
        margin-top: 20px;
        padding: 16px;
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        border-radius: 0;
      }
      
      .variable-item {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 8px;
        margin-bottom: 8px;
        align-items: center;
      }
      
      .variable-item input { padding: 6px 10px; }
      
      .remove-variable-btn {
        padding: 4px 8px;
        background-color: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
      }
      
      .row {
        display: flex;
        gap: 16px;
      }
      
      .row .form-group { flex: 1; }
      
      .target-select {
        display: flex;
        gap: 16px;
        margin-top: 8px;
      }
      
      .target-select label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-weight: normal;
        cursor: pointer;
      }
      
      .target-select input[type="radio"] { width: auto; }
      
      .generator-section {
        margin-bottom: 24px;
        padding: 16px;
        background-color: var(--vscode-editor-inactiveSelectionBackground);
        border-radius: 0;
        border-left: 4px solid var(--vscode-textLink-foreground);
      }
      
      .generator-input-row {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      
      .generator-input-row textarea,
      #systemPrompt {
        flex: 1;
        min-height: 60px;
        resize: vertical;
        font-family: var(--vscode-editor-font-family);
      }
      
      .generator-input-row button { white-space: nowrap; }
      
      .provider-row {
        display: flex;
        gap: 12px;
        margin-bottom: 12px;
      }
      
      .provider-row .form-group { flex: 1; margin-bottom: 0; }
      
      .loading {
        display: none;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        color: var(--vscode-descriptionForeground);
      }
      
      .loading.active { display: flex; }
      
      .spinner {
        width: 16px;
        height: 16px;
        border: 2px solid var(--vscode-progressBar-background);
        border-top-color: transparent;
        border-radius: 0;
        animation: spin 1s linear infinite;
      }
      
      @keyframes spin { to { transform: rotate(360deg); } }
      
      .error-message {
        display: none;
        margin-top: 12px;
        padding: 8px 12px;
        background-color: var(--vscode-inputValidation-errorBackground);
        color: var(--vscode-inputValidation-errorForeground);
        border-radius: 0;
        font-size: 0.9em;
      }
      
      .error-message.active { display: block; }
    </style>
  </head>
  <body>
    <div class="container">
      <h1>${isNew ? t('Create New Prompt') : t('Edit Prompt')}</h1>

      ${isNew ? `
      <div class="generator-section">
        <h2>${t('Prompt Generator')}</h2>
        <div class="hint" style="margin-bottom: 12px;">
          ${t('Describe what you want the prompt to do in natural language. The AI will generate a prompt for you.')}
        </div>
        <div class="provider-row" style="display: flex; gap: 8px; margin-bottom: 8px;">
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <select id="genProvider" onchange="updateModels()" style="padding: 4px 8px; width: 100%;">
              ${providers.map(p => `<option value="${p.id}" ${p.id === defaultProvider ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex: 1; margin-bottom: 0;">
            <select id="genModel" style="padding: 4px 8px; width: 100%;">
              <option value="${defaultModel}">${defaultModel || 'Default'}</option>
            </select>
          </div>
        </div>
        <div class="generator-input-row" style="display: flex; gap: 8px;">
          <textarea id="generateInput" placeholder="${t('e.g., Create a prompt that reviews code for security vulnerabilities, focusing on SQL injection and XSS attacks...')}" style="flex: 1; min-height: 40px;"></textarea>
          <button type="button" class="primary" id="generateBtn" onclick="generatePrompt()" style="padding: 4px 12px;">${t('Generate')}</button>
        </div>
        <div class="loading" id="loadingIndicator">
          <div class="spinner"></div>
          <span>${t('Generating prompt...')}</span>
        </div>
        <div class="error-message" id="errorMessage"></div>
      </div>
      ` : ''}
      
      <div class="form-group">
        <label for="name">${t('Name')} *</label>
        <input type="text" id="name" value="${this._escapeHtml(prompt?.name || '')}" placeholder="e.g. Code Review" required>
      </div>
      
      <div class="form-group">
        <label for="category">${t('Category')}</label>
        <input type="text" id="category" value="${this._escapeHtml(prompt?.category || '')}" placeholder="e.g. Development">
      </div>
      
      <div class="row">
        <div class="form-group">
          <label for="description">${t('Description')}</label>
          <input type="text" id="description" value="${this._escapeHtml(prompt?.description || '')}" placeholder="${t('What does this prompt do?')}">
        </div>
        <div class="form-group">
          <label for="tags">${t('Tags')}</label>
          <input type="text" id="tags" value="${this._escapeHtml((prompt?.tags || []).join(', '))}" placeholder="${t('Comma separated tags')}">
        </div>
      </div>

      <div class="form-group">
        <label for="template">${t('Prompt')} *</label>
        <div class="hint" style="margin-bottom: 8px;">${t('Use {{variable_name}} to define variables that will be filled when running the prompt. Included context: {{selection}}, {{filepath}}, {{file_content}}, {{lang}}, {{project_name}}, {{git_commit_diff}}, {{line_number}}, {{column_number}}')}</div>
        <textarea id="template" class="template" required placeholder="${t('Enter your prompt here...')}">${this._escapeHtml(prompt?.template || '')}</textarea>
      </div>

      <div class="variables-section" id="variablesSection">
        <h3>${t('Variables')}</h3>
        <div class="hint" style="margin-bottom: 12px;">Variables explicitly defined here can have descriptions and default values. Extracted variables from the template are automatically handled.</div>
        <div id="variables-list">
          ${this._getVariablesHtml(prompt?.variables || [])}
        </div>
        <button type="button" class="secondary" onclick="addVariable()">+ ${t('Add Variable')}</button>
      </div>
      
      ${isNew ? `
        <div class="form-group">
          <label>${t('Target')}</label>
          <div class="target-select">
            <label>
              <input type="radio" name="target" value="global" ${this._defaultTarget === 'global' ? 'checked' : ''}>
              ${t('Global')} (${t('All Projects')})
            </label>
            <label>
              <input type="radio" name="target" value="workspace" ${this._defaultTarget === 'workspace' ? 'checked' : ''}>
              ${t('Workspace')} (${t('Current Project')})
            </label>
          </div>
          <div class="hint">${t('Global prompts are available in all projects. Workspace prompts are stored in the project folder.')}</div>
        </div>
      ` : ''}

        <div class="buttons">
          <button type="button" class="primary" onclick="savePrompt()">${t('Save Prompt')}</button>
          <button type="button" class="secondary" onclick="cancel()">${t('Cancel')}</button>
        </div>
      </form>
    </div>
    
    <script>
      const vscode = acquireVsCodeApi();
      const providers = ${JSON.stringify(providers)};
      let variableCount = ${prompt?.variables?.length || 0};
      
      // Initialize models on load
      document.addEventListener('DOMContentLoaded', updateModels);
      
      function updateModels() {
        const providerId = document.getElementById('genProvider').value;
        const modelSelect = document.getElementById('genModel');
        const provider = providers.find(p => p.id === providerId);
        
        modelSelect.innerHTML = '<option value="">Default</option>';
        if (provider && provider.models) {
          provider.models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            modelSelect.appendChild(opt);
          });
        }
      }
      
      // Handle messages from extension
      window.addEventListener('message', event => {
        const message = event.data;
        switch (message.command) {
          case 'generateStart':
            document.getElementById('loadingIndicator').classList.add('active');
            document.getElementById('errorMessage').classList.remove('active');
            document.getElementById('generateBtn').disabled = true;
            break;
          case 'generateResult':
            document.getElementById('loadingIndicator').classList.remove('active');
            document.getElementById('generateBtn').disabled = false;
            if (message.prompt) {
              document.getElementById('template').value = message.prompt;
              document.getElementById('errorMessage').classList.remove('active');
            } else if (message.error) {
              document.getElementById('errorMessage').textContent = message.error;
              document.getElementById('errorMessage').classList.add('active');
            }
            break;
        }
      });
      
      function generatePrompt() {
        const description = document.getElementById('generateInput').value.trim();
        const provider = document.getElementById('genProvider').value;
        const model = document.getElementById('genModel').value;
        vscode.postMessage({
          command: 'generate',
          data: { description, provider, model }
        });
      }
      
      function addVariable() {
        variableCount++;
        const list = document.getElementById('variables-list');
        const div = document.createElement('div');
        div.className = 'variable-item';
        div.id = 'var-' + variableCount;
        div.innerHTML = \`
          <input type="text" placeholder="Variable name" class="var-name">
          <input type="text" placeholder="Description" class="var-desc">
          <button type="button" class="remove-variable-btn" onclick="removeVariable('var-\${variableCount}')">X</button>
        \`;
        list.appendChild(div);
      }
      
      function removeVariable(id) {
        const element = document.getElementById(id);
        if (element) { element.remove(); }
      }
      
      function getVariables() {
        const items = document.querySelectorAll('.variable-item');
        const variables = [];
        items.forEach(item => {
          const name = item.querySelector('.var-name')?.value?.trim();
          const desc = item.querySelector('.var-desc')?.value?.trim();
          if (name) {
            variables.push({
              name: name,
              description: desc || name,
              type: 'string',
              required: false
            });
          }
        });
        return variables;
      }
      
      function savePrompt() {
        const name = document.getElementById('name').value.trim();
        const category = document.getElementById('category').value.trim();
        const description = document.getElementById('description').value.trim();
        const tags = document.getElementById('tags').value.split(',').map(t => t.trim()).filter(t => t);
        const template = document.getElementById('template').value;
        const target = document.querySelector('input[name="target"]:checked')?.value || 'global';

        if (!name) { alert('${t('Name is required')}'); return; }
        if (!template) { alert('${t('Template is required')}'); return; }

        vscode.postMessage({
          command: 'save',
          data: { name, description, category, tags, template, variables: getVariables().length > 0 ? getVariables() : undefined, target }
        });
      }
      
      function cancel() {
        vscode.postMessage({ command: 'cancel' });
      }
    </script>
  </body>
  </html>`;
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private _getVariablesHtml(variables: PromptVariable[]): string {
    if (variables.length === 0) { return ''; }
    return variables.map((v, i) => `
      <div class="variable-item" id="var-${i}">
        <input type="text" class="var-name" value="${this._escapeHtml(v.name)}" placeholder="Variable name">
        <input type="text" class="var-desc" value="${this._escapeHtml(v.description)}" placeholder="Description">
        <button type="button" class="remove-variable-btn" onclick="removeVariable('var-${i}')">X</button>
      </div>
    `).join('');
  }

  public dispose(): void {
    PromptEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) { x.dispose(); }
    }
  }
}
