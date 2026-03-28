import * as vscode from 'vscode';
import { Services } from '../container';
import { SettingsPanel } from '../webview/settings/SettingsPanel';

export function registerSettingsCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.openSettings', () => SettingsPanel.createOrShow(ctx, svc)),
  );
}
