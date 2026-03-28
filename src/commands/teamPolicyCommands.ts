import * as vscode from 'vscode';
import { Services } from '../container';
import { GlobalStateKeys, WorkspaceStateKeys } from '../state/StateKeys';
import { TeamPolicySourceConfig } from '../types/teamPolicy';
import { t } from '../utils/i18n';

export function registerTeamPolicyCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.addTeamPolicySource', () => addSource(svc)),
    vscode.commands.registerCommand('pbp.removeTeamPolicySource', (item: { sourceState?: { sourceId: string } }) => removeSource(svc, item?.sourceState?.sourceId)),
    vscode.commands.registerCommand('pbp.syncTeamPolicySources', () => syncSources(svc)),
    vscode.commands.registerCommand('pbp.retryTeamPolicySourceSync', (item: { sourceState?: { sourceId: string } }) => retrySync(svc, item?.sourceState?.sourceId)),
    vscode.commands.registerCommand('pbp.bindWorkspacePolicy', () => bindWorkspace(svc)),
    vscode.commands.registerCommand('pbp.unbindWorkspacePolicy', () => unbindWorkspace(svc)),
  );
}

async function addSource(svc: Services): Promise<void> {
  const typePick = await vscode.window.showQuickPick(
    [
      { label: t('Git Repository'), value: 'git' as const },
      { label: t('Local Folder'), value: 'local-folder' as const },
    ],
    { placeHolder: t('Select source type') }
  );
  if (!typePick) return;

  const urlOrPath = await vscode.window.showInputBox({
    prompt: typePick.value === 'git' ? t('Git repository URL') : t('Local folder path'),
    placeHolder: typePick.value === 'git' ? 'https://github.com/org/policy-pack.git' : '/path/to/policy-pack',
  });
  if (!urlOrPath) return;

  const id = await vscode.window.showInputBox({
    prompt: t('Unique source ID'),
    value: urlOrPath.split('/').pop()?.replace(/\.git$/, '') ?? 'team-policy',
  });
  if (!id) return;

  const sources = svc.stateStore.getGlobal<TeamPolicySourceConfig[]>(GlobalStateKeys.TEAM_SOURCES) ?? [];
  if (sources.find(s => s.id === id)) {
    vscode.window.showErrorMessage(t('A source with ID "{0}" already exists.', id));
    return;
  }

  sources.push({ id, type: typePick.value, path: urlOrPath });
  await svc.stateStore.setGlobal(GlobalStateKeys.TEAM_SOURCES, sources);
  vscode.window.showInformationMessage(t('Team policy source "{0}" added. Syncing...', id));
  await syncSourceById(svc, id);
}

async function removeSource(svc: Services, sourceId?: string): Promise<void> {
  if (!sourceId) return;
  const answer = await vscode.window.showWarningMessage(
    t('Remove team policy source "{0}"?', sourceId),
    { modal: true },
    t('Remove')
  );
  if (answer !== t('Remove')) return;

  const sources = (svc.stateStore.getGlobal<TeamPolicySourceConfig[]>(GlobalStateKeys.TEAM_SOURCES) ?? []).filter(s => s.id !== sourceId);
  await svc.stateStore.setGlobal(GlobalStateKeys.TEAM_SOURCES, sources);
  vscode.window.showInformationMessage(t('Source "{0}" removed.', sourceId));
}

async function syncSources(svc: Services): Promise<void> {
  const sources = svc.stateStore.getGlobal<TeamPolicySourceConfig[]>(GlobalStateKeys.TEAM_SOURCES) ?? [];
  if (sources.length === 0) {
    vscode.window.showInformationMessage(t('No team policy sources configured.'));
    return;
  }
  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: t('Syncing team policy sources...') },
    async () => {
      for (const src of sources) {
        await syncSourceConfig(svc, src);
      }
    }
  );
  vscode.window.showInformationMessage(t('Team policy sources synced.'));
}

async function retrySync(svc: Services, sourceId?: string): Promise<void> {
  if (!sourceId) return;
  await syncSourceById(svc, sourceId);
}

async function syncSourceById(svc: Services, sourceId: string): Promise<void> {
  const sources = svc.stateStore.getGlobal<TeamPolicySourceConfig[]>(GlobalStateKeys.TEAM_SOURCES) ?? [];
  const src = sources.find(s => s.id === sourceId);
  if (!src) return;
  await syncSourceConfig(svc, src);
}

async function syncSourceConfig(svc: Services, src: TeamPolicySourceConfig): Promise<void> {
  const stateOut: import('../types/teamPolicy').TeamPolicySourceState[] = [];
  try {
    await svc.teamSync.resolveSourcePath(src, stateOut);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await svc.stateStore.setGlobal(GlobalStateKeys.TEAM_SOURCE_ERROR(src.id), msg);
    svc.logger.error(`Team policy sync failed for ${src.id}: ${msg}`);
    vscode.window.showWarningMessage(t('Sync failed for "{0}": {1}', src.id, msg));
  }
}

async function bindWorkspace(svc: Services): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(t('No workspace folder open'));
    return;
  }

  const sources = svc.stateStore.getGlobal<TeamPolicySourceConfig[]>(GlobalStateKeys.TEAM_SOURCES) ?? [];
  if (sources.length === 0) {
    vscode.window.showInformationMessage(t('No team policy sources available. Add one first.'));
    return;
  }

  const pick = await vscode.window.showQuickPick(
    sources.map(s => ({ label: s.id, description: s.path, value: s.id })),
    { placeHolder: t('Select policy pack to bind to this workspace') }
  );
  if (!pick) return;

  await svc.stateStore.setWorkspace(WorkspaceStateKeys.POLICY_BINDING, { packId: pick.value, source: 'workspace' });
  vscode.window.showInformationMessage(t('Workspace bound to policy pack "{0}".', pick.value));
}

async function unbindWorkspace(svc: Services): Promise<void> {
  await svc.stateStore.setWorkspace(WorkspaceStateKeys.POLICY_BINDING, undefined);
  vscode.window.showInformationMessage(t('Workspace policy binding removed.'));
}
