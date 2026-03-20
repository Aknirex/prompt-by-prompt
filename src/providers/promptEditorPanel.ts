/**
 * Prompt Editor Panel - Webview-based editor for creating/editing prompts
 */

import * as vscode from 'vscode';
import { PromptTemplate, PromptVariable } from '../types/prompt';
import { AIService, AIProvider, DEFAULT_GENERATOR_SYSTEM_PROMPT } from '../services/aiService';
import { ContextEngine } from '../services/contextEngine';
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

interface PreviewRequestData {
  template: string;
  variables?: PromptVariable[];
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
  private readonly _contextEngine: ContextEngine;
  private readonly _builtinVariables: string[];
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

    const panel = vscode.window.createWebviewPanel(
      PromptEditorPanel.viewType,
      existingPrompt ? `Edit: ${existingPrompt.name}` : 'New Prompt',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      }
    );

    PromptEditorPanel.currentPanel = new PromptEditorPanel(
      panel,
      extensionUri,
      context,
      existingPrompt,
      defaultTarget,
      onSave
    );
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
    this._contextEngine = new ContextEngine();
    this._builtinVariables = this._contextEngine.getBuiltinVariables();

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

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
          case 'preview':
            await this._handlePreview(message.data);
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
        error: t('Please enter a description for the prompt you want to generate.'),
      });
      return;
    }

    this._panel.webview.postMessage({
      command: 'generateStart',
    });

    const systemPrompt = (this._context.globalState.get('pbp.generatorSystemPrompt') as string) || DEFAULT_GENERATOR_SYSTEM_PROMPT;

    const result = await this._aiService.generatePrompt({
      userDescription: data.description,
      systemPrompt,
      provider: data.provider,
      model: data.model,
    });

    if (result.success && result.prompt) {
      this._panel.webview.postMessage({
        command: 'generateResult',
        prompt: result.prompt,
      });
      await this._handlePreview({
        template: result.prompt,
        variables: this._existingPrompt?.variables,
      });
    } else {
      this._panel.webview.postMessage({
        command: 'generateResult',
        error: result.error || 'Failed to generate prompt',
      });
    }
  }

  private async _handlePreview(data: PreviewRequestData): Promise<void> {
    try {
      const template = data.template || '';
      const variables = data.variables || [];
      const editorContext = await this._contextEngine.extractContext();

      const renderedPreview = await this._contextEngine.renderTemplate(
        {
          id: 'preview',
          name: 'Preview',
          description: '',
          category: '',
          tags: [],
          version: '1.0.0',
          template,
          variables,
        },
        editorContext,
        this._buildPreviewVariables(template, variables)
      );

      this._panel.webview.postMessage({
        command: 'previewResult',
        preview: renderedPreview,
      });
    } catch (error) {
      this._panel.webview.postMessage({
        command: 'previewResult',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private _buildPreviewVariables(template: string, variables: PromptVariable[]): Record<string, string> {
    const previewVariables: Record<string, string> = {};
    const variableMap = new Map(variables.map((variable) => [variable.name, variable]));
    const extractedVariables = this._contextEngine.extractTemplateVariables(template);

    for (const variable of variables) {
      previewVariables[variable.name] = this._getPreviewVariableValue(variable);
    }

    for (const variableName of extractedVariables) {
      if (this._builtinVariables.includes(variableName) || previewVariables[variableName]) {
        continue;
      }

      const schemaVariable = variableMap.get(variableName);
      previewVariables[variableName] = schemaVariable
        ? this._getPreviewVariableValue(schemaVariable)
        : `[${variableName}]`;
    }

    return previewVariables;
  }

  private _getPreviewVariableValue(variable: PromptVariable): string {
    if (variable.default !== undefined && variable.default !== '') {
      return String(variable.default);
    }

    if (variable.type === 'enum' && variable.values && variable.values.length > 0) {
      return variable.values[0];
    }

    if (variable.type === 'boolean') {
      return 'true';
    }

    if (variable.type === 'number') {
      return '1';
    }

    return variable.placeholder || `[${variable.name}]`;
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
    const builtinVariableCards = this._builtinVariables.map((variable) => `
      <div class="builtin-card">
        <code>{{${this._escapeHtml(variable)}}}</code>
      </div>
    `).join('');

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
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent), transparent 28%),
        linear-gradient(180deg, var(--vscode-editor-background), color-mix(in srgb, var(--vscode-editor-background) 85%, black));
      color: var(--vscode-editor-foreground);
      padding: 24px;
      margin: 0;
      font-size: 14px;
    }

    .container {
      max-width: 1180px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
    }

    h1 {
      margin: 0;
      font-size: 1.55em;
      letter-spacing: 0.01em;
    }

    h2 {
      font-size: 1.05em;
      margin: 0 0 12px 0;
    }

    .hero {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      padding-bottom: 14px;
    }

    .hero-copy {
      max-width: 760px;
    }

    .hero-copy p {
      margin: 8px 0 0 0;
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
    }

    .section {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 72%, transparent);
      border: 1px solid var(--vscode-panel-border);
      padding: 16px;
    }

    .grid-two {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
    }

    .form-group { margin-bottom: 14px; }

    label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
    }

    input[type="text"],
    select,
    textarea {
      width: 100%;
      padding: 9px 12px;
      background-color: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border);
      font-family: inherit;
      font-size: inherit;
    }

    textarea {
      min-height: 140px;
      resize: vertical;
      font-family: var(--vscode-editor-font-family);
    }

    textarea.template {
      min-height: 320px;
    }

    .hint {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 4px;
      line-height: 1.45;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border: 1px solid var(--vscode-panel-border);
      background: color-mix(in srgb, var(--vscode-badge-background) 24%, transparent);
      color: var(--vscode-badge-foreground);
      font-size: 0.82em;
      margin-right: 6px;
      margin-bottom: 6px;
    }

    .generator-section {
      border-left: 4px solid var(--vscode-textLink-foreground);
    }

    .provider-row,
    .generator-input-row {
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .provider-row .form-group,
    .generator-input-row .form-group {
      flex: 1;
      margin-bottom: 0;
    }

    .generator-input-row textarea {
      min-height: 74px;
    }

    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(340px, 0.9fr);
      gap: 16px;
      align-items: start;
    }

    .builtin-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .builtin-card {
      padding: 10px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
    }

    .preview-panel {
      position: sticky;
      top: 16px;
      display: grid;
      gap: 12px;
    }

    .preview-box {
      min-height: 320px;
      padding: 14px;
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      white-space: pre-wrap;
      line-height: 1.5;
      font-family: var(--vscode-editor-font-family);
      overflow: auto;
    }

    .variables-toolbar,
    .template-toolbar,
    .preview-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .variables-list {
      display: grid;
      gap: 10px;
    }

    .variable-item {
      border: 1px solid var(--vscode-panel-border);
      background: var(--vscode-editor-background);
      padding: 12px;
    }

    .variable-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px 12px;
    }

    .checkbox-inline {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 28px;
    }

    .checkbox-inline input {
      width: auto;
      margin: 0;
    }

    .checkbox-inline label {
      margin: 0;
      font-weight: 500;
    }

    .remove-variable-btn {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      border-top: 1px solid var(--vscode-panel-border);
      padding-top: 16px;
    }

    .actions-right {
      display: flex;
      gap: 12px;
    }

    .target-select {
      display: flex;
      gap: 16px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .target-select label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 500;
      cursor: pointer;
      margin-bottom: 0;
    }

    .target-select input[type="radio"] { width: auto; }

    button {
      padding: 8px 16px;
      border: none;
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
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .message {
      display: none;
      padding: 10px 12px;
      border: 1px solid transparent;
      line-height: 1.45;
    }

    .message.active { display: block; }

    .message.error {
      background-color: var(--vscode-inputValidation-errorBackground);
      color: var(--vscode-inputValidation-errorForeground);
    }

    .message.info {
      background-color: color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent);
      color: var(--vscode-editor-foreground);
      border-color: var(--vscode-panel-border);
    }

    @media (max-width: 960px) {
      .layout,
      .grid-two,
      .variable-grid {
        grid-template-columns: 1fr;
      }

      .preview-panel {
        position: static;
      }

      .provider-row,
      .generator-input-row,
      .actions {
        flex-direction: column;
        align-items: stretch;
      }

      .actions-right {
        justify-content: stretch;
      }

      .actions-right button {
        width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="hero">
      <div class="hero-copy">
        <h1>${isNew ? t('Create New Prompt') : t('Edit Prompt')}</h1>
        <p>${t('Focus here on the task template itself: prompt text, variable schema, metadata, and a rendered preview before you save.')}</p>
      </div>
      <div>
        <span class="pill">${isNew ? t('New Template') : t('Editing Existing Template')}</span>
        <span class="pill">${t('Schema + Preview')}</span>
      </div>
    </div>

    ${isNew ? `
    <div class="section generator-section">
      <h2>${t('Prompt Generator')}</h2>
      <div class="hint" style="margin-bottom: 12px;">
        ${t('Describe the task in natural language. The generated prompt is only a starting point; keep refining the template and schema below.')}
      </div>
      <div class="provider-row">
        <div class="form-group">
          <label for="genProvider">${t('Provider')}</label>
          <select id="genProvider" onchange="updateModels()">
            ${providers.map((provider) => `<option value="${provider.id}" ${provider.id === defaultProvider ? 'selected' : ''}>${provider.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="genModel">${t('Model')}</label>
          <select id="genModel">
            <option value="${this._escapeHtml(String(defaultModel))}">${this._escapeHtml(String(defaultModel || 'Default'))}</option>
          </select>
        </div>
      </div>
      <div class="generator-input-row">
        <div class="form-group">
          <label for="generateInput">${t('What should this prompt help with?')}</label>
          <textarea id="generateInput" placeholder="${t('e.g. Review a pull request for security issues, explain the risks, and propose concrete fixes.')}"></textarea>
        </div>
        <button type="button" class="primary" id="generateBtn" onclick="generatePrompt()">${t('Generate')}</button>
      </div>
      <div class="loading" id="loadingIndicator">
        <div class="spinner"></div>
        <span>${t('Generating prompt...')}</span>
      </div>
      <div class="message error" id="errorMessage"></div>
    </div>
    ` : ''}
    <div class="section">
      <h2>${t('Prompt Metadata')}</h2>
      <div class="grid-two">
        <div class="form-group">
          <label for="name">${t('Name')} *</label>
          <input type="text" id="name" value="${this._escapeHtml(prompt?.name || '')}" placeholder="e.g. Code Review">
        </div>
        <div class="form-group">
          <label for="category">${t('Category')}</label>
          <input type="text" id="category" value="${this._escapeHtml(prompt?.category || '')}" placeholder="e.g. Development">
        </div>
      </div>
      <div class="grid-two">
        <div class="form-group">
          <label for="description">${t('Description')}</label>
          <input type="text" id="description" value="${this._escapeHtml(prompt?.description || '')}" placeholder="${t('What should teammates know before using this template?')}">
        </div>
        <div class="form-group">
          <label for="tags">${t('Tags')}</label>
          <input type="text" id="tags" value="${this._escapeHtml((prompt?.tags || []).join(', '))}" placeholder="${t('Comma separated tags')}">
        </div>
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
        <div class="hint">${t('This only controls where the prompt is saved. Execution target and behavior stay in the run flow, not in the editor.')}</div>
      </div>
      ` : ''}
    </div>

    <div class="layout">
      <div class="section">
        <div class="template-toolbar">
          <div>
            <h2>${t('Prompt Template')}</h2>
            <div class="hint">${t('Use {{variable_name}} placeholders inside the template. Built-in editor context variables are available without redefining them.')}</div>
          </div>
          <button type="button" class="secondary" onclick="requestPreview()">${t('Refresh Preview')}</button>
        </div>
        <div class="form-group">
          <label for="template">${t('Prompt')} *</label>
          <textarea id="template" class="template" placeholder="${t('Enter your prompt here...')}">${this._escapeHtml(prompt?.template || '')}</textarea>
        </div>
        <div>
          <label>${t('Built-in Context Variables')}</label>
          <div class="builtin-grid">
            ${builtinVariableCards}
          </div>
          <div class="hint">${t('Preview uses the current editor state for built-in variables and schema defaults for custom variables whenever possible.')}</div>
        </div>
      </div>

      <div class="preview-panel">
        <div class="section">
          <div class="preview-toolbar">
            <div>
              <h2>${t('Rendered Preview')}</h2>
              <div class="hint">${t('This shows what the prompt looks like after context variables and schema defaults are applied.')}</div>
            </div>
          </div>
          <div class="message info active" id="previewStatus">${t('Preview will update as you edit.')}</div>
          <div class="message error" id="previewError"></div>
          <pre class="preview-box" id="previewBox"></pre>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="variables-toolbar">
        <div>
          <h2>${t('Variable Schema')}</h2>
          <div class="hint">${t('Define the variables that are user-provided at run time. Schema fields drive future input UI and make the template self-explanatory.')}</div>
        </div>
        <button type="button" class="secondary" onclick="addVariable()">${t('Add Variable')}</button>
      </div>
      <div class="variables-list" id="variables-list">
        ${this._getVariablesHtml(prompt?.variables || [])}
      </div>
    </div>

    <div class="actions">
      <div class="hint">${t('Prompt editor only manages the template. Choose agent, behavior, and dispatch target when you run it.')}</div>
      <div class="actions-right">
        <button type="button" class="secondary" onclick="cancel()">${t('Cancel')}</button>
        <button type="button" class="primary" onclick="savePrompt()">${t('Save Prompt')}</button>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const providers = ${JSON.stringify(providers)};
    let variableCount = ${prompt?.variables?.length || 0};
    let previewTimer = undefined;

    document.addEventListener('DOMContentLoaded', () => {
      updateModels();
      bindPreviewTriggers();
      requestPreview();
    });

    function updateModels() {
      const providerSelect = document.getElementById('genProvider');
      const modelSelect = document.getElementById('genModel');
      if (!providerSelect || !modelSelect) {
        return;
      }

      const providerId = providerSelect.value;
      const provider = providers.find((item) => item.id === providerId);

      modelSelect.innerHTML = '<option value="">Default</option>';
      if (provider && provider.models) {
        provider.models.forEach((model) => {
          const option = document.createElement('option');
          option.value = model;
          option.textContent = model;
          modelSelect.appendChild(option);
        });
      }
    }

    function bindPreviewTriggers() {
      document.getElementById('template').addEventListener('input', schedulePreview);
      ['name', 'category', 'description', 'tags'].forEach((id) => {
        const input = document.getElementById(id);
        if (input) {
          input.addEventListener('input', schedulePreview);
        }
      });
    }

    function schedulePreview() {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(requestPreview, 220);
    }

    function requestPreview() {
      const previewStatus = document.getElementById('previewStatus');
      const previewError = document.getElementById('previewError');
      previewStatus.textContent = '${t('Refreshing preview...')}';
      previewStatus.classList.add('active');
      previewError.classList.remove('active');

      vscode.postMessage({
        command: 'preview',
        data: {
          template: document.getElementById('template').value,
          variables: getVariables()
        }
      });
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      switch (message.command) {
        case 'generateStart':
          document.getElementById('loadingIndicator')?.classList.add('active');
          document.getElementById('errorMessage')?.classList.remove('active');
          document.getElementById('generateBtn').disabled = true;
          break;
        case 'generateResult':
          document.getElementById('loadingIndicator')?.classList.remove('active');
          document.getElementById('generateBtn').disabled = false;
          if (message.prompt) {
            document.getElementById('template').value = message.prompt;
            document.getElementById('errorMessage')?.classList.remove('active');
            requestPreview();
          } else if (message.error) {
            const errorMessage = document.getElementById('errorMessage');
            errorMessage.textContent = message.error;
            errorMessage.classList.add('active');
          }
          break;
        case 'previewResult':
          const previewBox = document.getElementById('previewBox');
          const previewStatus = document.getElementById('previewStatus');
          const previewError = document.getElementById('previewError');
          if (message.error) {
            previewError.textContent = message.error;
            previewError.classList.add('active');
            previewStatus.textContent = '${t('Preview unavailable right now.')}';
            previewBox.textContent = '';
          } else {
            previewError.classList.remove('active');
            previewStatus.textContent = '${t('Preview uses current editor context plus schema defaults.')}';
            previewBox.textContent = message.preview || '';
          }
          break;
      }
    });

    function generatePrompt() {
      const description = document.getElementById('generateInput')?.value.trim() || '';
      const provider = document.getElementById('genProvider')?.value || '';
      const model = document.getElementById('genModel')?.value || '';
      vscode.postMessage({
        command: 'generate',
        data: { description, provider, model }
      });
    }

    function createVariableMarkup(id, variable = {}) {
      const values = Array.isArray(variable.values) ? variable.values.join(', ') : '';
      const selectedType = variable.type || 'string';
      const defaultValue = variable.default === undefined ? '' : String(variable.default);
      return \`
        <div class="variable-item" id="var-\${id}">
          <div class="variable-grid">
            <div class="form-group">
              <label>${t('Variable Name')} *</label>
              <input type="text" class="var-name" value="\${escapeHtml(variable.name || '')}" placeholder="ticket_id">
            </div>
            <div class="form-group">
              <label>${t('Description')}</label>
              <input type="text" class="var-desc" value="\${escapeHtml(variable.description || '')}" placeholder="${t('What should the user provide?')}">
            </div>
            <div class="form-group">
              <label>${t('Type')}</label>
              <select class="var-type" onchange="handleVariableTypeChange('var-\${id}')">
                <option value="string" \${selectedType === 'string' ? 'selected' : ''}>string</option>
                <option value="number" \${selectedType === 'number' ? 'selected' : ''}>number</option>
                <option value="boolean" \${selectedType === 'boolean' ? 'selected' : ''}>boolean</option>
                <option value="enum" \${selectedType === 'enum' ? 'selected' : ''}>enum</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('Default Value')}</label>
              <input type="text" class="var-default" value="\${escapeHtml(defaultValue)}" placeholder="${t('Optional')}">
            </div>
            <div class="form-group">
              <label>${t('Placeholder')}</label>
              <input type="text" class="var-placeholder" value="\${escapeHtml(variable.placeholder || '')}" placeholder="${t('Shown during input collection')}">
            </div>
            <div class="form-group var-values-group" style="display: \${selectedType === 'enum' ? 'block' : 'none'};">
              <label>${t('Enum Values')}</label>
              <input type="text" class="var-values" value="\${escapeHtml(values)}" placeholder="low, medium, high">
            </div>
            <div class="checkbox-inline">
              <input type="checkbox" class="var-required" id="required-\${id}" \${variable.required ? 'checked' : ''} onchange="schedulePreview()">
              <label for="required-\${id}">${t('Required')}</label>
            </div>
            <div class="checkbox-inline">
              <input type="checkbox" class="var-multiline" id="multiline-\${id}" \${variable.multiline ? 'checked' : ''} onchange="schedulePreview()">
              <label for="multiline-\${id}">${t('Multiline')}</label>
            </div>
          </div>
          <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
            <button type="button" class="remove-variable-btn" onclick="removeVariable('var-\${id}')">${t('Remove')}</button>
          </div>
        </div>
      \`;
    }

    function addVariable(variable = {}) {
      variableCount += 1;
      const list = document.getElementById('variables-list');
      const wrapper = document.createElement('div');
      wrapper.innerHTML = createVariableMarkup(variableCount, variable);
      list.appendChild(wrapper.firstElementChild);
      bindVariableInputs(document.getElementById('var-' + variableCount));
      schedulePreview();
    }

    function bindVariableInputs(root) {
      if (!root) {
        return;
      }

      root.querySelectorAll('input, select, textarea').forEach((element) => {
        element.addEventListener('input', schedulePreview);
        element.addEventListener('change', schedulePreview);
      });
    }

    function handleVariableTypeChange(id) {
      const item = document.getElementById(id);
      if (!item) {
        return;
      }
      const type = item.querySelector('.var-type').value;
      const valuesGroup = item.querySelector('.var-values-group');
      valuesGroup.style.display = type === 'enum' ? 'block' : 'none';
      schedulePreview();
    }

    function removeVariable(id) {
      const element = document.getElementById(id);
      if (element) {
        element.remove();
      }
      schedulePreview();
    }

    function getVariables() {
      const items = document.querySelectorAll('.variable-item');
      const variables = [];
      items.forEach((item) => {
        const name = item.querySelector('.var-name')?.value?.trim();
        if (!name) {
          return;
        }

        const type = item.querySelector('.var-type')?.value || 'string';
        const defaultValueRaw = item.querySelector('.var-default')?.value ?? '';
        const values = (item.querySelector('.var-values')?.value || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean);

        let normalizedDefault = defaultValueRaw;
        if (type === 'number' && defaultValueRaw !== '') {
          normalizedDefault = Number(defaultValueRaw);
        }
        if (type === 'boolean' && defaultValueRaw !== '') {
          normalizedDefault = defaultValueRaw === 'true';
        }

        variables.push({
          name,
          description: item.querySelector('.var-desc')?.value?.trim() || name,
          type,
          required: item.querySelector('.var-required')?.checked || false,
          default: defaultValueRaw === '' ? undefined : normalizedDefault,
          placeholder: item.querySelector('.var-placeholder')?.value?.trim() || undefined,
          multiline: item.querySelector('.var-multiline')?.checked || false,
          values: type === 'enum' && values.length > 0 ? values : undefined
        });
      });
      return variables;
    }

    function savePrompt() {
      const name = document.getElementById('name').value.trim();
      const category = document.getElementById('category').value.trim();
      const description = document.getElementById('description').value.trim();
      const tags = document.getElementById('tags').value.split(',').map((tag) => tag.trim()).filter(Boolean);
      const template = document.getElementById('template').value;
      const target = document.querySelector('input[name="target"]:checked')?.value || 'global';
      const variables = getVariables();

      if (!name) {
        alert('${t('Name is required')}');
        return;
      }

      if (!template.trim()) {
        alert('${t('Template is required')}');
        return;
      }

      vscode.postMessage({
        command: 'save',
        data: {
          name,
          description,
          category,
          tags,
          template,
          variables: variables.length > 0 ? variables : undefined,
          target
        }
      });
    }

    function cancel() {
      vscode.postMessage({ command: 'cancel' });
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    document.querySelectorAll('.variable-item').forEach(bindVariableInputs);
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
    if (variables.length === 0) {
      return `<div class="hint">${t('No schema variables defined yet. Add variables here when the prompt needs user input beyond built-in editor context.')}</div>`;
    }

    return variables.map((variable, index) => {
      const enumValues = variable.values?.join(', ') || '';
      const defaultValue = variable.default === undefined ? '' : String(variable.default);
      const type = variable.type || 'string';

      return `
        <div class="variable-item" id="var-${index}">
          <div class="variable-grid">
            <div class="form-group">
              <label>${t('Variable Name')} *</label>
              <input type="text" class="var-name" value="${this._escapeHtml(variable.name)}" placeholder="ticket_id">
            </div>
            <div class="form-group">
              <label>${t('Description')}</label>
              <input type="text" class="var-desc" value="${this._escapeHtml(variable.description || '')}" placeholder="${this._escapeHtml(t('What should the user provide?'))}">
            </div>
            <div class="form-group">
              <label>${t('Type')}</label>
              <select class="var-type" onchange="handleVariableTypeChange('var-${index}')">
                <option value="string" ${type === 'string' ? 'selected' : ''}>string</option>
                <option value="number" ${type === 'number' ? 'selected' : ''}>number</option>
                <option value="boolean" ${type === 'boolean' ? 'selected' : ''}>boolean</option>
                <option value="enum" ${type === 'enum' ? 'selected' : ''}>enum</option>
              </select>
            </div>
            <div class="form-group">
              <label>${t('Default Value')}</label>
              <input type="text" class="var-default" value="${this._escapeHtml(defaultValue)}" placeholder="${this._escapeHtml(t('Optional'))}">
            </div>
            <div class="form-group">
              <label>${t('Placeholder')}</label>
              <input type="text" class="var-placeholder" value="${this._escapeHtml(variable.placeholder || '')}" placeholder="${this._escapeHtml(t('Shown during input collection'))}">
            </div>
            <div class="form-group var-values-group" style="display: ${type === 'enum' ? 'block' : 'none'};">
              <label>${t('Enum Values')}</label>
              <input type="text" class="var-values" value="${this._escapeHtml(enumValues)}" placeholder="low, medium, high">
            </div>
            <div class="checkbox-inline">
              <input type="checkbox" class="var-required" id="required-${index}" ${variable.required ? 'checked' : ''} onchange="schedulePreview()">
              <label for="required-${index}">${t('Required')}</label>
            </div>
            <div class="checkbox-inline">
              <input type="checkbox" class="var-multiline" id="multiline-${index}" ${variable.multiline ? 'checked' : ''} onchange="schedulePreview()">
              <label for="multiline-${index}">${t('Multiline')}</label>
            </div>
          </div>
          <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
            <button type="button" class="remove-variable-btn" onclick="removeVariable('var-${index}')">${t('Remove')}</button>
          </div>
        </div>
      `;
    }).join('');
  }

  public dispose(): void {
    PromptEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
