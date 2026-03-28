import * as vscode from 'vscode';
import { Services } from '../container';
import { t } from '../utils/i18n';

export function registerExecutionCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.selectAgent', () => selectAgent(svc)),
    vscode.commands.registerCommand('pbp.changeExecutionMode', () => changeExecutionMode(svc)),
  );
}

async function selectAgent(svc: Services): Promise<void> {
  const available = await svc.agentRegistry.getAvailableAgentTypes();
  const all = svc.agentRegistry.getAllAdapters();

  const items = all.map(adapter => ({
    label: adapter.name,
    description: available.includes(adapter.type) ? t('Available') : t('Not installed'),
    value: adapter.type,
  }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select default agent'),
  });
  if (!pick) return;

  await vscode.workspace.getConfiguration('pbp').update('defaultAgent', pick.value, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(t('Default agent set to "{0}".', pick.label));
}

async function changeExecutionMode(svc: Services): Promise<void> {
  const modes = [
    { label: t('Last execution'), description: t('Reuse the last agent/behavior used for this prompt'), value: 'last-execution' as const },
    { label: t('Initial recommendation'), description: t('Always use the recommended agent for this prompt'), value: 'initial-recommendation' as const },
    { label: t('Ask every time'), description: t('Always show the agent picker'), value: 'ask-every-time' as const },
  ];

  const current = svc.config.executionSelectionMode;
  const items = modes.map(m => ({ ...m, picked: m.value === current }));

  const pick = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select execution selection mode'),
  });
  if (!pick) return;

  await vscode.workspace.getConfiguration('pbp').update('executionSelectionMode', pick.value, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(t('Execution mode set to "{0}".', pick.label));
}
