import * as vscode from 'vscode';
import { Services } from '../../container';
import { PromptTemplate } from '../../types/prompt';
import { HostToWebview, WebviewToHost, SavePayload } from './protocol';
import { AIProvider } from '../../core/ai/AIProviderRegistry';
import { t } from '../../utils/i18n';

export class PromptEditorPanel {
  public static currentPanel: PromptEditorPanel | undefined;
  public static readonly viewType = 'pbp.promptEditor';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _prompt: PromptTemplate | undefined;
  private _target: 'workspace' | 'global';

  public static createOrShow(
    ctx: vscode.ExtensionContext,
    svc: Services,
    existingPrompt?: PromptTemplate,
    defaultTarget: 'workspace' | 'global' = 'global'
  ): PromptEditorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (PromptEditorPanel.currentPanel) {
      PromptEditorPanel.currentPanel._panel.reveal(column);
      if (existingPrompt) {
        PromptEditorPanel.currentPanel._prompt = existingPrompt;
        PromptEditorPanel.currentPanel._target = existingPrompt.source === 'workspace' ? 'workspace' : 'global';
        PromptEditorPanel.currentPanel._sendLoad();
      }
      return PromptEditorPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PromptEditorPanel.viewType,
      existingPrompt ? t('Edit Prompt') : t('New Prompt'),
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new PromptEditorPanel(panel, ctx, svc, existingPrompt, defaultTarget);
    PromptEditorPanel.currentPanel = instance;
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly ctx: vscode.ExtensionContext,
    private readonly svc: Services,
    prompt: PromptTemplate | undefined,
    target: 'workspace' | 'global'
  ) {
    this._panel = panel;
    this._prompt = prompt;
    this._target = target;

    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this._handleMessage(msg), null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _getHtml(): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt Editor</title>
  <style>
    :root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --input-bg: var(--vscode-input-background); --input-fg: var(--vscode-input-foreground); --input-border: var(--vscode-input-border); --btn-bg: var(--vscode-button-background); --btn-fg: var(--vscode-button-foreground); --btn-hover: var(--vscode-button-hoverBackground); --panel-bg: var(--vscode-sideBar-background); --border: var(--vscode-panel-border); --focus: var(--vscode-focusBorder); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); padding: 16px; }
    .form-group { margin-bottom: 12px; }
    label { display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
    input, textarea, select { width: 100%; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border, #444); border-radius: 2px; padding: 6px 8px; font-family: inherit; font-size: inherit; outline: none; }
    input:focus, textarea:focus, select:focus { border-color: var(--focus); }
    textarea { resize: vertical; min-height: 80px; }
    #template { min-height: 200px; font-family: var(--vscode-editor-font-family, monospace); font-size: var(--vscode-editor-font-size, 13px); }
    .row { display: flex; gap: 12px; }
    .row .form-group { flex: 1; }
    .actions { display: flex; gap: 8px; margin-top: 16px; flex-wrap: wrap; }
    button { background: var(--btn-bg); color: var(--btn-fg); border: none; padding: 6px 14px; border-radius: 2px; cursor: pointer; font-size: 13px; }
    button:hover { background: var(--btn-hover); }
    button.secondary { background: transparent; border: 1px solid var(--border, #444); color: var(--fg); }
    button.secondary:hover { background: rgba(255,255,255,0.05); }
    #ai-section { margin-top: 16px; padding: 12px; background: var(--panel-bg); border: 1px solid var(--border, #444); border-radius: 3px; }
    #ai-section h3 { font-size: 12px; text-transform: uppercase; opacity: 0.7; margin-bottom: 8px; }
    #status { margin-top: 8px; font-size: 12px; opacity: 0.8; min-height: 18px; }
    .tag-input { display: flex; flex-wrap: wrap; gap: 4px; background: var(--input-bg); border: 1px solid var(--input-border, #444); border-radius: 2px; padding: 4px; cursor: text; }
    .tag { background: var(--btn-bg); color: var(--btn-fg); padding: 2px 6px; border-radius: 2px; font-size: 12px; display: flex; align-items: center; gap: 4px; }
    .tag button { background: none; color: inherit; border: none; padding: 0; cursor: pointer; font-size: 14px; line-height: 1; }
    .tag-input input { flex: 1; min-width: 80px; background: transparent; border: none; padding: 2px 4px; }
    .tag-input input:focus { border: none; outline: none; }
    select option { background: var(--input-bg); }
    h2 { font-size: 16px; margin-bottom: 16px; font-weight: 600; }
  </style>
</head>
<body>
  <h2 id="panel-title">New Prompt</h2>
  <div class="row">
    <div class="form-group">
      <label for="name">Name</label>
      <input id="name" type="text" placeholder="My Prompt" />
    </div>
    <div class="form-group">
      <label for="category">Category</label>
      <input id="category" type="text" placeholder="General" />
    </div>
    <div class="form-group" style="max-width:160px">
      <label for="target">Save to</label>
      <select id="target">
        <option value="global">Global</option>
        <option value="workspace">Workspace</option>
      </select>
    </div>
  </div>
  <div class="form-group">
    <label for="description">Description</label>
    <input id="description" type="text" placeholder="What does this prompt do?" />
  </div>
  <div class="form-group">
    <label>Tags</label>
    <div class="tag-input" id="tag-container">
      <input id="tag-input" type="text" placeholder="Add tag, press Enter" />
    </div>
  </div>
  <div class="form-group">
    <label for="template">Template</label>
    <textarea id="template" placeholder="Write your prompt template here. Use {{variable}} for variables."></textarea>
  </div>
  <div class="actions">
    <button id="btn-save">Save</button>
    <button class="secondary" id="btn-run">Run</button>
    <button class="secondary" id="btn-preview">Preview</button>
  </div>
  <div id="ai-section">
    <h3>AI Draft Generation</h3>
    <div class="form-group">
      <label for="ai-desc">Describe the prompt you want to create</label>
      <textarea id="ai-desc" style="min-height:60px" placeholder="e.g. A prompt that reviews code for security vulnerabilities"></textarea>
    </div>
    <div class="actions">
      <button id="btn-ai-generate">Generate with AI</button>
    </div>
  </div>
  <div id="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let tags = [];

    function setStatus(msg) {
      document.getElementById('status').textContent = msg;
    }

    function renderTags() {
      const container = document.getElementById('tag-container');
      const input = document.getElementById('tag-input');
      Array.from(container.querySelectorAll('.tag')).forEach(el => el.remove());
      tags.forEach((tag, i) => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.innerHTML = tag + '<button type="button" data-i="' + i + '">&times;</button>';
        container.insertBefore(span, input);
      });
      container.querySelectorAll('.tag button').forEach(btn => {
        btn.onclick = () => { tags.splice(+btn.dataset.i, 1); renderTags(); };
      });
    }

    document.getElementById('tag-input').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !tags.includes(val)) { tags.push(val); renderTags(); }
        e.target.value = '';
      }
    });

    document.getElementById('btn-save').addEventListener('click', () => {
      const name = document.getElementById('name').value.trim();
      if (!name) { setStatus('Name is required.'); return; }
      vscode.postMessage({
        type: 'save',
        name,
        description: document.getElementById('description').value.trim(),
        category: document.getElementById('category').value.trim() || 'General',
        tags,
        template: document.getElementById('template').value,
        target: document.getElementById('target').value,
      });
      setStatus('Saving...');
    });

    document.getElementById('btn-run').addEventListener('click', () => {
      vscode.postMessage({ type: 'run', promptId: '' });
    });

    document.getElementById('btn-preview').addEventListener('click', () => {
      vscode.postMessage({ type: 'requestPreview', template: document.getElementById('template').value });
    });

    document.getElementById('btn-ai-generate').addEventListener('click', () => {
      const desc = document.getElementById('ai-desc').value.trim();
      if (!desc) { setStatus('Please enter a description for AI generation.'); return; }
      setStatus('Generating...');
      vscode.postMessage({ type: 'requestAiDraft', description: desc });
    });

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'load') {
        const p = msg.prompt;
        document.getElementById('panel-title').textContent = p.id ? 'Edit Prompt' : 'New Prompt';
        document.getElementById('name').value = p.name || '';
        document.getElementById('description').value = p.description || '';
        document.getElementById('category').value = p.category || '';
        document.getElementById('template').value = p.template || '';
        document.getElementById('target').value = msg.target || 'global';
        tags = Array.isArray(p.tags) ? [...p.tags] : [];
        renderTags();
        setStatus('');
      } else if (msg.type === 'aiDraftReady') {
        const d = msg.draft;
        if (d.name) document.getElementById('name').value = d.name;
        if (d.description) document.getElementById('description').value = d.description;
        if (d.category) document.getElementById('category').value = d.category;
        if (d.template) document.getElementById('template').value = d.template;
        if (d.tags) { tags = d.tags; renderTags(); }
        setStatus('AI draft applied.');
      } else if (msg.type === 'previewReady') {
        setStatus('Preview opened.');
      } else if (msg.type === 'error') {
        setStatus('Error: ' + msg.message);
      } else if (msg.type === 'saved') {
        setStatus('Saved.');
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  private _sendLoad(): void {
    const builtinVariables = ['selection', 'filepath', 'file_content', 'lang', 'project_name', 'line_number', 'column_number', 'git_diff'];
    const msg: HostToWebview = {
      type: 'load',
      prompt: this._prompt ?? this._emptyPrompt(),
      builtinVariables,
      target: this._target,
    };
    this._panel.webview.postMessage(msg);
  }

  private _emptyPrompt(): PromptTemplate {
    return {
      id: '',
      name: '',
      description: '',
      category: 'General',
      tags: [],
      version: '1.0.0',
      template: '',
    };
  }

  private async _handleMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this._sendLoad();
        break;

      case 'save':
        await this._handleSave(msg as unknown as { type: 'save' } & SavePayload);
        this._panel.webview.postMessage({ type: 'saved' } satisfies HostToWebview);
        break;

      case 'requestAiDraft': {
        const result = await this.svc.aiGenerator.generate(
          msg.description,
          msg.provider as AIProvider | undefined,
          msg.model
        );
        if (result.success && result.draft) {
          const reply: HostToWebview = { type: 'aiDraftReady', draft: result.draft };
          this._panel.webview.postMessage(reply);
        } else {
          const reply: HostToWebview = { type: 'error', message: result.error ?? 'AI generation failed' };
          this._panel.webview.postMessage(reply);
        }
        break;
      }

      case 'requestPreview': {
        const ctx = await this.svc.contextExtractor.extractContext();
        const vars: Record<string, string> = {};
        const tempPrompt: PromptTemplate = { id: '', name: '', description: '', category: '', tags: [], version: '1.0.0', template: msg.template, variables: msg.variables };
        const rendered = this.svc.contextExtractor.renderPrompt(tempPrompt, ctx, vars);
        const reply: HostToWebview = { type: 'previewReady', text: rendered };
        this._panel.webview.postMessage(reply);
        const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: rendered });
        await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
        break;
      }

      case 'run': {
        const prompt = this._prompt;
        if (prompt) {
          await vscode.commands.executeCommand('pbp.runPrompt', prompt);
        }
        break;
      }
    }
  }

  private async _handleSave(msg: { type: 'save' } & SavePayload): Promise<void> {
    const isNew = !this._prompt?.id;
    const id = this._prompt?.id || `prompt-${Date.now()}`;
    const prompt: PromptTemplate = {
      id,
      name: msg.name,
      description: msg.description,
      category: msg.category,
      tags: msg.tags,
      template: msg.template,
      variables: msg.variables,
      version: this._prompt?.version ?? '1.0.0',
      source: msg.target,
    };
    await this.svc.promptRepo.save({ ...prompt, source: msg.target });
    this._prompt = prompt;
    this._target = msg.target;
    vscode.window.showInformationMessage(
      isNew ? t('Prompt "{0}" created.', prompt.name) : t('Prompt "{0}" saved.', prompt.name)
    );
  }

  public dispose(): void {
    PromptEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
