import * as vscode from 'vscode';
import * as path from 'path';
import { Services } from '../container';
import { GlobalStateKeys } from '../state/StateKeys';
import { t } from '../utils/i18n';

export function registerProjectionCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.rebuildProjection', () => rebuildProjection(svc)),
    vscode.commands.registerCommand('pbp.openProjectedFile', () => openProjectedFile(svc)),
  );
}

async function rebuildProjection(svc: Services): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(t('No workspace folder open'));
    return;
  }

  const workspaceRules = await svc.ruleScanner.scanWorkspace(workspaceRoot);
  const globalRules = await svc.ruleScanner.scanGlobalDir();
  const allRules = [...workspaceRules, ...globalRules];
  const profile = svc.ruleResolver.buildDefaultProfile(allRules);
  const resolved = svc.ruleResolver.resolveActiveRules(allRules, profile);
  const effectivePolicy = svc.ruleResolver.buildEffectivePolicy(resolved);

  const outputPath = path.join(workspaceRoot, '.pbp', 'compiled', 'AGENTS.md');
  await svc.ruleProjector.writeProjectedFile(outputPath, effectivePolicy, {
    format: 'agents-md',
    writeMode: 'safe-overwrite',
    includePreferences: true,
    includeTeamMetadata: true,
  });

  vscode.window.showInformationMessage(t('Rule projection rebuilt at {0}', '.pbp/compiled/AGENTS.md'));
}

async function openProjectedFile(svc: Services): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage(t('No workspace folder open'));
    return;
  }
  const outputPath = path.join(workspaceRoot, '.pbp', 'compiled', 'AGENTS.md');
  try {
    const doc = await vscode.workspace.openTextDocument(outputPath);
    await vscode.window.showTextDocument(doc);
  } catch {
    vscode.window.showErrorMessage(t('No projected file found. Run Rebuild Projection first.'));
  }
}
