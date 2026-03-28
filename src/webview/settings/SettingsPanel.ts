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

  public static createOrShow(ctx: vscode.ExtensionContext, svc: Services): SettingsPanel {
    const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

    if (SettingsPanel.currentPanel) {
      SettingsPanel.currentPanel._panel.reveal(column);
      return SettingsPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      SettingsPanel.viewType,
      t('Prompt by Prompt Settings'),
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview')],
      }
    );

    const instance = new SettingsPanel(panel, ctx, svc);
    SettingsPanel.currentPanel = instance;
    return instance;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly ctx: vscode.ExtensionContext,
    private readonly svc: Services
  ) {
    this._panel = panel;
    this._panel.webview.html = this._getHtml();
    this._panel.webview.onDidReceiveMessage((msg: WebviewToHost) => this._handleMessage(msg), null, this._disposables);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  private _getHtml(): string {
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview', 'settings.js')
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Settings')}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async _sendLoad(): Promise<void> {
    const cfg = this.svc.config;
    const availableAgents = await this.svc.agentRegistry.getAvailableAgentTypes();
    const state: SettingsState = {
      defaultAgent: cfg.defaultAgent as import('../../types/agent').AgentType,
      defaultBehavior: cfg.defaultBehavior as import('../../types/execution').ExecutionBehavior,
      executionSelectionMode: cfg.executionSelectionMode as 'last-execution' | 'initial-recommendation' | 'ask-every-time',
      defaultTarget: cfg.defaultTarget as 'workspace' | 'global',
      generatorProvider: cfg.generatorProvider as AIProvider,
      generatorModel: cfg.generatorModel,
      generatorSystemPrompt: this.svc.stateStore.getGlobal<string>(GlobalStateKeys.GENERATOR_SYSTEM_PROMPT) ?? '',
      ollamaEndpoint: cfg.ollamaEndpoint,
      customProviderUrl: cfg.customProviderUrl,
      uiLanguage: cfg.uiLanguage,
      availableAgents,
    };
    const msg: HostToWebview = { type: 'load', state, providers: AI_PROVIDERS };
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
