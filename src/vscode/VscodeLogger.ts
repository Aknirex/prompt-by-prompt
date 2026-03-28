import * as vscode from 'vscode';

export class VscodeLogger {
  private readonly channel: vscode.OutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel('Prompt by Prompt');
  }

  log(message: string): void {
    this.channel.appendLine(`[${new Date().toISOString()}] ${message}`);
  }

  error(message: string, err?: unknown): void {
    const detail = err instanceof Error ? err.message : String(err ?? '');
    this.channel.appendLine(`[${new Date().toISOString()}] ERROR: ${message}${detail ? ` — ${detail}` : ''}`);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
