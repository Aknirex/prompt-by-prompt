import * as vscode from 'vscode';
import { Services } from '../container';
import { t } from '../utils/i18n';

export function registerExecutionCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.selectAgent', () => selectAgent(svc)),
  );
}

async function selectAgent(svc: Services): Promise<void> {
  const available = await svc.agentRegistry.getAvailableAgentTypes();
  const all = svc.agentRegistry.getAllAdapters();

  const items = all.map(adapter => ({
    label: adapter.name,
    description: available.includes(adapter.type)
      ? t('Available')
      : t('Not installed'),
    value: adapter.type,
    alwaysShow: true,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select default agent'),
  });
  if (!pick) return;

  await vscode.workspace.getConfiguration('pbp').update(
    'defaultAgent', pick.value, vscode.ConfigurationTarget.Global
  );
  // Mark as configured so the auto-picker doesn't show again
  await svc.stateStore.setGlobal('pbp.agentConfigured', true);
  vscode.window.showInformationMessage(t('Default agent set to "{0}".', pick.label));
}
