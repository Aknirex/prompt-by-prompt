import * as vscode from 'vscode';
import { Services } from '../container';
import { PromptTemplate } from '../types/prompt';
import { ExecutionTarget } from '../types/execution';
import { PromptEditorPanel } from '../webview/promptEditor/PromptEditorPanel';
import { t } from '../utils/i18n';
import { GlobalStateKeys } from '../state/StateKeys';

export function registerPromptCommands(ctx: vscode.ExtensionContext, svc: Services): void {
  ctx.subscriptions.push(
    vscode.commands.registerCommand('pbp.createPrompt', () => createPrompt(ctx, svc)),
    vscode.commands.registerCommand('pbp.editPrompt', (item: { prompt?: PromptTemplate }) => editPrompt(ctx, svc, item?.prompt)),
    vscode.commands.registerCommand('pbp.deletePrompt', (item: { prompt?: PromptTemplate }) => deletePrompt(svc, item?.prompt)),
    vscode.commands.registerCommand('pbp.runPrompt', (item: PromptTemplate | { prompt?: PromptTemplate }) => {
      const prompt = item && 'id' in item ? item as PromptTemplate : (item as { prompt?: PromptTemplate })?.prompt;
      if (prompt) runPrompt(svc, prompt);
    }),
    vscode.commands.registerCommand('pbp.duplicatePrompt', (item: { prompt?: PromptTemplate }) => duplicatePrompt(ctx, svc, item?.prompt)),
    vscode.commands.registerCommand('pbp.previewPrompt', (item: PromptTemplate | { prompt?: PromptTemplate }) => {
      const prompt = item && 'id' in item ? item as PromptTemplate : (item as { prompt?: PromptTemplate })?.prompt;
      if (prompt) previewPrompt(svc, prompt);
    }),
  );
}

async function pickSaveTarget(): Promise<'workspace' | 'global' | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: t('Workspace'), description: t('Stored in .prompts/ in workspace'), value: 'workspace' as const },
      { label: t('Global'), description: t('Stored in global prompts directory'), value: 'global' as const },
    ],
    { placeHolder: t('Where to save this prompt?') }
  );
  return pick?.value;
}

async function createPrompt(ctx: vscode.ExtensionContext, svc: Services): Promise<void> {
  const target = await pickSaveTarget();
  if (!target) return;
  PromptEditorPanel.createOrShow(ctx, svc, undefined, target);
}

async function editPrompt(ctx: vscode.ExtensionContext, svc: Services, prompt?: PromptTemplate): Promise<void> {
  if (!prompt) {
    const all = await svc.promptRepo.loadAll();
    const picked = await vscode.window.showQuickPick(
      all.map(p => ({ label: p.name, description: p.category, prompt: p })),
      { placeHolder: t('Select a prompt to edit') }
    );
    if (!picked) return;
    prompt = picked.prompt;
  }
  PromptEditorPanel.createOrShow(ctx, svc, prompt, prompt.source === 'workspace' ? 'workspace' : 'global');
}

async function deletePrompt(svc: Services, prompt?: PromptTemplate): Promise<void> {
  if (!prompt) return;
  const answer = await vscode.window.showWarningMessage(
    t('Are you sure you want to delete "{0}"?', prompt.name),
    { modal: true },
    t('Delete')
  );
  if (answer !== t('Delete')) return;
  await svc.promptRepo.delete(prompt.id, prompt.source === 'workspace' ? 'workspace' : 'global');
  vscode.window.showInformationMessage(t('Prompt "{0}" deleted.', prompt.name));
}

async function runPrompt(svc: Services, prompt: PromptTemplate): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const editorCtx = await svc.contextExtractor.extractContext();
  const allRules = [
    ...(workspaceRoot ? await svc.ruleScanner.scanWorkspace(workspaceRoot) : []),
    ...(await svc.ruleScanner.scanGlobalDir()),
  ];
  const profile = svc.ruleResolver.buildDefaultProfile(allRules);
  const resolved = svc.ruleResolver.resolveActiveRules(allRules, profile);
  const effectivePolicy = svc.ruleResolver.buildEffectivePolicy(resolved);

  const variables: Record<string, string> = {};
  const renderedPrompt = svc.contextExtractor.renderPrompt(prompt, editorCtx, variables);
  const envelope = svc.envelopeBuilder.build(prompt, renderedPrompt, variables, effectivePolicy, editorCtx, resolved);

  const dispatchText = svc.dispatchRouter.buildDispatchText(envelope, { kind: 'clipboard' });
  const target: ExecutionTarget = { kind: 'clipboard' };
  const result = await svc.dispatchRouter.dispatch(dispatchText, target);
  if (!result.success) {
    vscode.window.showErrorMessage(t('Dispatch failed: {0}', result.message));
  }
}

async function previewPrompt(svc: Services, prompt: PromptTemplate): Promise<void> {
  const editorCtx = await svc.contextExtractor.extractContext();
  const variables: Record<string, string> = {};
  const renderedPrompt = svc.contextExtractor.renderPrompt(prompt, editorCtx, variables);
  const resolved = svc.ruleResolver.resolveActiveRules([], svc.ruleResolver.buildDefaultProfile([]));
  const effectivePolicy = svc.ruleResolver.buildEffectivePolicy(resolved);
  const envelope = svc.envelopeBuilder.build(prompt, renderedPrompt, variables, effectivePolicy, editorCtx, resolved);
  const target: ExecutionTarget = { kind: 'clipboard' };
  const previewText = svc.dispatchRouter.buildPreviewText(envelope, target);
  const doc = await vscode.workspace.openTextDocument({ language: 'markdown', content: previewText });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function duplicatePrompt(ctx: vscode.ExtensionContext, svc: Services, prompt?: PromptTemplate): Promise<void> {
  if (!prompt) return;
  const target = await pickSaveTarget();
  if (!target) return;
  const copy: PromptTemplate = {
    ...prompt,
    id: `${prompt.id}-copy-${Date.now()}`,
    name: `${prompt.name} (Copy)`,
    source: target,
    filePath: undefined,
    readOnly: false,
  };
  await svc.promptRepo.save(copy, target);
  vscode.window.showInformationMessage(t('Prompt duplicated as "{0}".', copy.name));
  PromptEditorPanel.createOrShow(ctx, svc, copy, target);
}
