import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { Services } from '../container';
import { GlobalStateKeys } from '../state/StateKeys';
import { t } from '../utils/i18n';

export function registerRuleCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.createRule', () => createRule(svc)),
    vscode.commands.registerCommand('pbp.deleteRule', (item: { rule?: { path?: string } }) => deleteRule(item?.rule?.path)),
    vscode.commands.registerCommand('pbp.openRuleFile', (item: { rule?: { path?: string } }) => openRuleFile(item?.rule?.path)),
    vscode.commands.registerCommand('pbp.setActiveProfile', (item: { profile?: { id: string; name: string } }) => setActiveProfile(svc, item?.profile)),
  );
}

async function createRule(svc: Services): Promise<void> {
  const scopePick = await vscode.window.showQuickPick(
    [
      { label: t('Workspace'), description: t('Stored in .pbp/rules/'), value: 'workspace' as const },
      { label: t('Global'), description: t('Stored in global rules directory'), value: 'global' as const },
    ],
    { placeHolder: t('Where to create this rule?') }
  );
  if (!scopePick) return;

  const name = await vscode.window.showInputBox({
    prompt: t('Rule name (e.g. no-console)'),
    validateInput: v => v.trim() ? undefined : t('Name is required'),
  });
  if (!name) return;

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  let ruleDir: string;

  if (scopePick.value === 'workspace') {
    if (!workspaceRoot) {
      vscode.window.showErrorMessage(t('No workspace folder open'));
      return;
    }
    ruleDir = path.join(workspaceRoot, '.pbp', 'rules');
  } else {
    ruleDir = path.join(svc.stateStore.globalStoragePath, 'rules');
  }

  await fs.mkdir(ruleDir, { recursive: true });
  const slug = name.toLowerCase().replace(/\s+/g, '-');
  const filePath = path.join(ruleDir, `${slug}.md`);

  const content = `---\nruleId: ${slug}\ndescription: ${name}\nkind: rule\npriority: 50\nrequired: false\nprofiles:\n  - default\n---\n\n# ${name}\n\n<!-- Write your rule content here -->\n`;
  await fs.writeFile(filePath, content, 'utf-8');
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
}

async function deleteRule(rulePath?: string): Promise<void> {
  if (!rulePath) return;
  const answer = await vscode.window.showWarningMessage(
    t('Delete rule file "{0}"?', path.basename(rulePath)),
    { modal: true },
    t('Delete')
  );
  if (answer !== t('Delete')) return;
  await fs.rm(rulePath, { force: true });
  vscode.window.showInformationMessage(t('Rule deleted.'));
}

async function openRuleFile(rulePath?: string): Promise<void> {
  if (!rulePath) return;
  const doc = await vscode.workspace.openTextDocument(rulePath);
  await vscode.window.showTextDocument(doc);
}

async function setActiveProfile(svc: Services, profile?: { id: string; name: string }): Promise<void> {
  if (!profile) return;
  await svc.stateStore.setGlobal(GlobalStateKeys.ACTIVE_RULE_PROFILE, profile.id);
  vscode.window.showInformationMessage(t('Active profile set to "{0}".', profile.name));
}
