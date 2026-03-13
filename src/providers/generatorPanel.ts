/**
 * Generator Panel - Webview for displaying LLM responses
 */

import * as vscode from 'vscode';
import { LLMResponse } from '../types/prompt';

export class GeneratorPanel {
  public static readonly viewType = 'pbp.generatorPanel';
  
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(extensionUri: vscode.Uri): GeneratorPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    const existingPanel = GeneratorPanel.currentPanel;
    if (existingPanel) {
      existingPanel._panel.reveal(column);
      return existingPanel;
    }

    // Create a new panel
    const panel = vscode.window.createWebviewPanel(
      GeneratorPanel.viewType,
      'Prompt by Prompt - Generator',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    GeneratorPanel.currentPanel = new GeneratorPanel(panel, extensionUri);
    return GeneratorPanel.currentPanel;
  }

  private static currentPanel: GeneratorPanel | undefined;

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'copy':
            vscode.env.clipboard.writeText(message.text);
            vscode.window.showInformationMessage('Copied to clipboard');
            break;
          case 'apply':
            this._applyToEditor(message.text);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  /**
   * Start streaming response
   */
  public startStreaming(promptName: string): void {
    this._panel.webview.postMessage({
      command: 'start',
      promptName
    });
  }

  /**
   * Append chunk to the response
   */
  public appendChunk(chunk: string): void {
    this._panel.webview.postMessage({
      command: 'chunk',
      chunk
    });
  }

  /**
   * Complete the response
   */
  public complete(response: LLMResponse): void {
    this._panel.webview.postMessage({
      command: 'complete',
      response
    });
  }

  /**
   * Show error
   */
  public showError(error: string): void {
    this._panel.webview.postMessage({
      command: 'error',
      error
    });
  }

  /**
   * Apply text to active editor
   */
  private async _applyToEditor(text: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('No active editor');
      return;
    }

    await editor.edit(editBuilder => {
      if (!editor.selection.isEmpty) {
        editBuilder.replace(editor.selection, text);
      } else {
        editBuilder.insert(editor.selection.active, text);
      }
    });
  }

  /**
   * Update the webview content
   */
  private _update(): void {
    this._panel.webview.html = this._getHtmlForWebview();
  }

  /**
   * Generate HTML for the webview
   */
  private _getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Prompt by Prompt - Generator</title>
  <style>
    :root {
      --vscode-font-family: var(--vscode-editor-font-family);
      --vscode-font-size: var(--vscode-editor-font-size);
    }
    
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      padding: 16px;
      margin: 0;
      color: var(--vscode-foreground);
      background-color: var(--vscode-editor-background);
    }
    
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    
    .prompt-name {
      font-weight: 600;
      font-size: 1.1em;
    }
    
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.9em;
      color: var(--vscode-descriptionForeground);
    }
    
    .status.loading {
      color: var(--vscode-progressBar-background);
    }
    
    .status.error {
      color: var(--vscode-errorForeground);
    }
    
    .status.success {
      color: var(--vscode-testing-iconPassed);
    }
    
    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid var(--vscode-progressBar-background);
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    .content {
      white-space: pre-wrap;
      word-wrap: break-word;
      line-height: 1.6;
    }
    
    .content code {
      font-family: var(--vscode-editor-font-family);
      background-color: var(--vscode-textCodeBlock-background);
      padding: 2px 6px;
      border-radius: 4px;
    }
    
    .content pre {
      background-color: var(--vscode-textCodeBlock-background);
      padding: 12px;
      border-radius: 6px;
      overflow-x: auto;
    }
    
    .content pre code {
      background: none;
      padding: 0;
    }
    
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--vscode-panel-border);
    }
    
    button {
      background-color: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
    }
    
    button:hover {
      background-color: var(--vscode-button-hoverBackground);
    }
    
    button.secondary {
      background-color: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }
    
    button.secondary:hover {
      background-color: var(--vscode-button-secondaryHoverBackground);
    }
    
    .metadata {
      font-size: 0.85em;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
    }
    
    .empty-state {
      text-align: center;
      padding: 48px;
      color: var(--vscode-descriptionForeground);
    }
    
    .empty-state h2 {
      margin-bottom: 8px;
      font-weight: 500;
    }
    
    .empty-state p {
      margin: 0;
    }
  </style>
</head>
<body>
  <div id="app">
    <div class="empty-state">
      <h2>No Active Generation</h2>
      <p>Run a prompt from the sidebar to see results here</p>
    </div>
  </div>
  
  <script>
    const vscode = acquireVsCodeApi();
    let currentContent = '';
    let currentPromptName = '';
    
    function render() {
      const app = document.getElementById('app');
      
      if (!currentContent && !currentPromptName) {
        app.innerHTML = \`
          <div class="empty-state">
            <h2>No Active Generation</h2>
            <p>Run a prompt from the sidebar to see results here</p>
          </div>
        \`;
        return;
      }
      
      app.innerHTML = \`
        <div class="header">
          <span class="prompt-name">\${currentPromptName}</span>
          <span class="status" id="status">Ready</span>
        </div>
        <div class="content" id="content"></div>
        <div class="actions" id="actions" style="display: none;">
          <button onclick="copyToClipboard()">Copy to Clipboard</button>
          <button class="secondary" onclick="applyToEditor()">Apply to Editor</button>
        </div>
        <div class="metadata" id="metadata"></div>
      \`;
    }
    
    function updateContent(text) {
      const contentEl = document.getElementById('content');
      if (contentEl) {
        // Simple markdown-like rendering
        let html = text
          .replace(/\`\`\`(\\w*)\\n([\\s\\S]*?)\`\`\`/g, '<pre><code class="language-$1">$2</code></pre>')
          .replace(/\`([^\`]+)\`/g, '<code>$1</code>')
          .replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>')
          .replace(/\\*([^*]+)\\*/g, '<em>$1</em>')
          .replace(/\\n/g, '<br>');
        contentEl.innerHTML = html;
      }
    }
    
    function updateStatus(status, text) {
      const statusEl = document.getElementById('status');
      if (statusEl) {
        statusEl.className = 'status ' + status;
        if (status === 'loading') {
          statusEl.innerHTML = '<div class="spinner"></div> Generating...';
        } else {
          statusEl.textContent = text;
        }
      }
    }
    
    function copyToClipboard() {
      vscode.postMessage({
        command: 'copy',
        text: currentContent
      });
    }
    
    function applyToEditor() {
      vscode.postMessage({
        command: 'apply',
        text: currentContent
      });
    }
    
    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      
      switch (message.command) {
        case 'start':
          currentPromptName = message.promptName;
          currentContent = '';
          render();
          updateStatus('loading');
          break;
          
        case 'chunk':
          currentContent += message.chunk;
          updateContent(currentContent);
          break;
          
        case 'complete':
          updateStatus('success', 'Completed in ' + message.response.metadata.latencyMs + 'ms');
          document.getElementById('actions').style.display = 'flex';
          
          const metadata = document.getElementById('metadata');
          if (metadata && message.response.metadata) {
            metadata.innerHTML = \`
              Model: \${message.response.metadata.modelName} | 
              Provider: \${message.response.metadata.provider}
            \`;
          }
          break;
          
        case 'error':
          updateStatus('error', 'Error: ' + message.error);
          break;
      }
    });
    
    // Initial render
    render();
  </script>
</body>
</html>`;
  }

  /**
   * Dispose the panel
   */
  public dispose(): void {
    GeneratorPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}
