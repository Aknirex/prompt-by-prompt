import * as vscode from 'vscode';
import * as path from 'path';
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
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(ctx.extensionUri, 'dist', 'webview')],
      }
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
    const scriptUri = this._panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.ctx.extensionUri, 'dist', 'webview', 'promptEditor.js')
    );
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${t('Prompt Editor')}</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
