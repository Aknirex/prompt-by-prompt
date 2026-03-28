import * as vscode from 'vscode';
import { Services } from '../../container';
import { HostToWebview, WebviewToHost, SettingsState } from './protocol';
import { AI_PROVIDERS } from '../../core/ai/AIProviderRegistry';
import { AIProvider } from '../../core/ai/AIProviderRegistry';
import { GlobalStateKeys } from '../../state/StateKeys';
import { t } from '../../utils/i18n';

export class SettingsPanel {
  public static currentPanel: SettingsPanel | undefined;
  public static readonly viewType = 'pbp.settings';

  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(_ctx: vscode.ExtensionContext, svc: Services): SettingsPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return SettingsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      t('Prompt by Prompt Settings'),
      column,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const instance = new SettingsPanel(panel, svc);
    SettingsPanel.currentPanel = instance;
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly svc: Services
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this._handleMessage(msg), null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _getHtml(): string {
    const nonce = getNonce();
    const providers = AI_PROVIDERS.map(p => ({
      id: p.id, name: p.name, models: p.models, requiresApiKey: p.requiresApiKey
    }));
    const providersJson = JSON.stringify(providers);
    const escapedProvidersJson = providersJson.replace(/<\/script>/gi, '<\\/script>');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings</title>
  <style>
    :root { --bg: var(--vscode-editor-background); --fg: var(--vscode-editor-foreground); --input-bg: var(--vscode-input-background); --input-fg: var(--vscode-input-foreground); --input-border: var(--vscode-input-border); --btn-bg: var(--vscode-button-background); --btn-fg: var(--vscode-button-foreground); --btn-hover: var(--vscode-button-hoverBackground); --panel-bg: var(--vscode-sideBar-background); --border: var(--vscode-panel-border); --focus: var(--vscode-focusBorder); --tab-active: var(--vscode-tab-activeBackground); }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: var(--bg); color: var(--fg); font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); }
    .tabs { display: flex; border-bottom: 1px solid var(--border, #444); background: var(--panel-bg); }
    .tab { padding: 8px 16px; cursor: pointer; border: none; background: transparent; color: var(--fg); font-family: inherit; font-size: inherit; opacity: 0.7; border-bottom: 2px solid transparent; margin-bottom: -1px; }
    .tab.active { opacity: 1; border-bottom-color: var(--focus, #007acc); }
    .tab:hover { opacity: 1; }
    .tab-content { display: none; padding: 20px; }
    .tab-content.active { display: block; }
    .form-group { margin-bottom: 14px; }
    label { display: block; margin-bottom: 4px; font-size: 11px; text-transform: uppercase; opacity: 0.7; }
    input, textarea, select { width: 100%; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border, #444); border-radius: 2px; padding: 6px 8px; font-family: inherit; font-size: inherit; outline: none; }
    input:focus, textarea:focus, select:focus { border-color: var(--focus); }
    textarea { resize: vertical; min-height: 80px; }
    button { background: var(--btn-bg); color: var(--btn-fg); border: none; padding: 6px 14px; border-radius: 2px; cursor: pointer; font-size: 13px; }
    button:hover { background: var(--btn-hover); }
    button.secondary { background: transparent; border: 1px solid var(--border, #444); color: var(--fg); }
    button.secondary:hover { background: rgba(255,255,255,0.05); }
    button.danger { background: var(--vscode-errorForeground, #f44); color: #fff; }
    .row { display: flex; gap: 12px; align-items: flex-end; }
    .row .form-group { flex: 1; }
    .row button { margin-bottom: 0; flex-shrink: 0; }
    .provider-card { border: 1px solid var(--border, #444); border-radius: 3px; padding: 12px; margin-bottom: 10px; }
    .provider-card h4 { margin-bottom: 8px; font-size: 13px; }
    #status { padding: 8px 20px; font-size: 12px; opacity: 0.8; min-height: 28px; }
    h2 { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .hint { font-size: 11px; opacity: 0.6; margin-top: 3px; }
    select option { background: var(--input-bg); }
  </style>
</head>
<body>
  <div class="tabs">
    <button type="button" class="tab active" data-tab="general">General</button>
    <button type="button" class="tab" data-tab="ai">AI Generator</button>
    <button type="button" class="tab" data-tab="api-keys">API Keys</button>
  </div>

  <!-- GENERAL TAB -->
  <div class="tab-content active" id="tab-general">
    <h2>Execution Settings</h2>
    <div class="form-group">
      <label for="defaultAgent">Default Agent</label>
      <select id="defaultAgent">
        <option value="clipboard">Clipboard</option>
        <option value="file">File</option>
        <option value="cline">Cline</option>
        <option value="roo-code">Roo Code</option>
        <option value="copilot">GitHub Copilot</option>
        <option value="continue">Continue</option>
        <option value="cursor">Cursor</option>
        <option value="gemini">Gemini CLI</option>
        <option value="codex">OpenAI Codex</option>
      </select>
      <div class="hint">Behavior (append / fill / send / clipboard) is chosen automatically based on what the agent supports.</div>
    </div>
    <button id="btn-save-general" type="button">Save</button>
  </div>

  <!-- AI GENERATOR TAB -->
  <div class="tab-content" id="tab-ai">
    <h2>AI Draft Generator</h2>
    <div class="row">
      <div class="form-group">
        <label for="generatorProvider">Provider</label>
        <select id="generatorProvider"></select>
      </div>
      <div class="form-group">
        <label for="generatorModel">Model</label>
        <select id="generatorModel"></select>
      </div>
    </div>
    <div class="form-group">
      <label for="ollamaEndpoint">Ollama Endpoint</label>
      <input id="ollamaEndpoint" type="text" placeholder="http://localhost:11434" />
    </div>
    <div class="form-group">
      <label for="customProviderUrl">Custom Provider URL</label>
      <input id="customProviderUrl" type="text" placeholder="https://api.example.com/v1" />
    </div>
    <div class="form-group">
      <label for="generatorSystemPrompt">System Prompt</label>
      <textarea id="generatorSystemPrompt" placeholder="Optional system prompt for AI generation..."></textarea>
    </div>
    <button id="btn-save-ai" type="button">Save</button>
  </div>

  <!-- API KEYS TAB -->
  <div class="tab-content" id="tab-api-keys">
    <h2>API Keys</h2>
    <div id="api-keys-container"></div>
  </div>

  <div id="status"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const PROVIDERS = ${escapedProvidersJson};
    let state = {};

    function setStatus(msg) {
      document.getElementById('status').textContent = msg;
      if (msg) setTimeout(() => { document.getElementById('status').textContent = ''; }, 3000);
    }

    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
      });
    });

    // Populate provider dropdown
    const providerSelect = document.getElementById('generatorProvider');
    PROVIDERS.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      providerSelect.appendChild(opt);
    });

    function updateModelList(providerId) {
      const p = PROVIDERS.find(x => x.id === providerId);
      const modelSelect = document.getElementById('generatorModel');
      modelSelect.innerHTML = '';
      (p ? p.models : []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m; opt.textContent = m;
        modelSelect.appendChild(opt);
      });
    }

    providerSelect.addEventListener('change', () => updateModelList(providerSelect.value));

    // Build API key cards
    function buildApiKeyCards() {
      const container = document.getElementById('api-keys-container');
      container.innerHTML = '';
      PROVIDERS.filter(p => p.requiresApiKey).forEach(p => {
        const card = document.createElement('div');
        card.className = 'provider-card';
        card.innerHTML = '<h4>' + p.name + '</h4>' +
          '<div class="row">' +
            '<div class="form-group"><input type="password" id="key-' + p.id + '" placeholder="Enter API key" /></div>' +
            '<button onclick="saveKey(\'' + p.id + '\')" >Save</button>' +
            '<button class="secondary" onclick="clearKey(\'' + p.id + '\')" >Clear</button>' +
          '</div>';
        container.appendChild(card);
      });
    }

    function saveKey(provider) {
      const key = document.getElementById('key-' + provider).value.trim();
      if (!key) { setStatus('Key is empty.'); return; }
      vscode.postMessage({ type: 'saveApiKey', provider, key });
    }

    function clearKey(provider) {
      document.getElementById('key-' + provider).value = '';
      vscode.postMessage({ type: 'clearApiKey', provider });
      setStatus('Key cleared for ' + provider);
    }

    document.getElementById('btn-save-general').addEventListener('click', () => {
      vscode.postMessage({ type: 'saveSetting', key: 'defaultAgent', value: document.getElementById('defaultAgent').value });
      setStatus('Saved.');
    });

    document.getElementById('btn-save-ai').addEventListener('click', () => {
      vscode.postMessage({ type: 'saveSetting', key: 'generatorProvider', value: document.getElementById('generatorProvider').value });
      vscode.postMessage({ type: 'saveSetting', key: 'generatorModel', value: document.getElementById('generatorModel').value });
      vscode.postMessage({ type: 'saveSetting', key: 'ollamaEndpoint', value: document.getElementById('ollamaEndpoint').value });
      vscode.postMessage({ type: 'saveSetting', key: 'customProviderUrl', value: document.getElementById('customProviderUrl').value });
      vscode.postMessage({ type: 'saveSetting', key: 'generatorSystemPrompt', value: document.getElementById('generatorSystemPrompt').value });
      setStatus('Saved.');
    });

    window.addEventListener('message', e => {
      const msg = e.data;
      if (msg.type === 'load') {
        state = msg.state;
        document.getElementById('defaultAgent').value = state.defaultAgent || 'clipboard';
        document.getElementById('generatorProvider').value = state.generatorProvider || 'ollama';
        updateModelList(state.generatorProvider || 'ollama');
        document.getElementById('generatorModel').value = state.generatorModel || '';
        document.getElementById('ollamaEndpoint').value = state.ollamaEndpoint || '';
        document.getElementById('customProviderUrl').value = state.customProviderUrl || '';
        document.getElementById('generatorSystemPrompt').value = state.generatorSystemPrompt || '';
        buildApiKeyCards();
      } else if (msg.type === 'saved') {
        setStatus('Saved.');
      } else if (msg.type === 'error') {
        setStatus('Error: ' + msg.message);
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
  }

  private async _sendLoad(): Promise<void> {
    const cfg = this.svc.config;
    const available = await this.svc.agentRegistry.getAvailableAgentTypes();
    const state: SettingsState = {
      defaultAgent: cfg.defaultAgent as import('../../types/agent').AgentType,
      defaultBehavior: 'send' as import('../../types/execution').ExecutionBehavior,
      executionSelectionMode: 'last-execution',
      defaultTarget: 'global',
      generatorProvider: cfg.generatorProvider as AIProvider,
      generatorModel: cfg.generatorModel,
      generatorSystemPrompt: this.svc.stateStore.getGlobal<string>(GlobalStateKeys.GENERATOR_SYSTEM_PROMPT) ?? '',
      ollamaEndpoint: (vscode.workspace.getConfiguration('pbp').get<string>('ollamaEndpoint')) ?? 'http://localhost:11434',
      customProviderUrl: (vscode.workspace.getConfiguration('pbp').get<string>('customProviderUrl')) ?? '',
      uiLanguage: (vscode.workspace.getConfiguration('pbp').get<string>('uiLanguage')) ?? 'en',
      availableAgents: available,
    };
    const msg: HostToWebview = {
      type: 'load',
      state,
      providers: AI_PROVIDERS,
    };
    this._panel.webview.postMessage(msg);
  }

  private async _handleMessage(msg: WebviewToHost): Promise<void> {
    switch (msg.type) {
      case 'ready':
        await this._sendLoad();
        break;

      case 'saveApiKey':
        await this.svc.stateStore.setSecret(`pbp.apiKey.${msg.provider}`, msg.key);
        this._panel.webview.postMessage({ type: 'saved' } satisfies HostToWebview);
        break;

      case 'clearApiKey':
        await this.svc.stateStore.deleteSecret(`pbp.apiKey.${msg.provider}`);
        break;

      case 'saveSetting': {
        const key = msg.key;
        const value = msg.value;
        if (key === 'generatorSystemPrompt') {
          await this.svc.stateStore.setGlobal(GlobalStateKeys.GENERATOR_SYSTEM_PROMPT, value as string);
        } else {
          await vscode.workspace.getConfiguration('pbp').update(key, value, vscode.ConfigurationTarget.Global);
        }
        this._panel.webview.postMessage({ type: 'saved' } satisfies HostToWebview);
        break;
      }
    }
  }

  public dispose(): void {
    SettingsPanel.currentPanel = undefined;
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
