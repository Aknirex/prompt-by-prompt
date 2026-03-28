import * as vscode from 'vscode';
import { Services } from '../container';
import { PromptTemplate } from '../types/prompt';
import { ExecutionTarget } from '../types/execution';
import { ResolvedPolicyBinding } from '../types/teamPolicy';
import { PromptEditorPanel } from '../webview/promptEditor/PromptEditorPanel';
import { t } from '../utils/i18n';

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

const IMPLICIT_BINDING: ResolvedPolicyBinding = {
  source: 'implicit',
  allowPersonalOverrides: true,
  pinned: false,
  reasons: [],
};

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
  if (prompt.filePath) {
    await svc.promptRepo.delete(prompt.filePath);
  }
  vscode.window.showInformationMessage(t('Prompt "{0}" deleted.', prompt.name));
}

async function runPrompt(svc: Services, prompt: PromptTemplate): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const editorCtx = await svc.contextExtractor.extractContext();
  const allRules = [
    ...(workspaceRoot ? await svc.ruleScanner.scanWorkspace(workspaceRoot) : []),
    ...(await svc.ruleScanner.scanGlobalDir(svc.stateStore.globalStoragePath)),
  ];
  const profile = svc.ruleResolver.buildDefaultProfile(allRules);
  const { activeEntries, conflicts } = svc.ruleResolver.resolveActiveRules(allRules, profile);
  const effectivePolicy = svc.ruleResolver.buildEffectivePolicy(activeEntries, conflicts, IMPLICIT_BINDING);

  const variables: Record<string, string> = {};
  const renderedPrompt = svc.contextExtractor.renderPrompt(prompt, editorCtx, variables);
  const resolvedRuleSet = buildResolvedRuleSet(allRules, activeEntries, profile, conflicts);
  const envelope = svc.envelopeBuilder.build(prompt, renderedPrompt, variables, effectivePolicy, editorCtx, resolvedRuleSet);

  const target: ExecutionTarget = { kind: 'clipboard' };
  const dispatchText = svc.dispatchRouter.buildDispatchText(envelope, target);
  const result = await svc.dispatchRouter.dispatch(dispatchText, target);
  if (!result.success) {
    vscode.window.showErrorMessage(t('Dispatch failed: {0}', result.message));
  }
}

async function previewPrompt(svc: Services, prompt: PromptTemplate): Promise<void> {
  const editorCtx = await svc.contextExtractor.extractContext();
  const variables: Record<string, string> = {};
  const renderedPrompt = svc.contextExtractor.renderPrompt(prompt, editorCtx, variables);
  const { activeEntries, conflicts } = svc.ruleResolver.resolveActiveRules([], svc.ruleResolver.buildDefaultProfile([]));
  const effectivePolicy = svc.ruleResolver.buildEffectivePolicy(activeEntries, conflicts, IMPLICIT_BINDING);
  const resolvedRuleSet = buildResolvedRuleSet([], activeEntries, svc.ruleResolver.buildDefaultProfile([]), conflicts);
  const envelope = svc.envelopeBuilder.build(prompt, renderedPrompt, variables, effectivePolicy, editorCtx, resolvedRuleSet);
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
  await svc.promptRepo.save({ ...copy, source: target });
  vscode.window.showInformationMessage(t('Prompt duplicated as "{0}".', copy.name));
  PromptEditorPanel.createOrShow(ctx, svc, copy, target);
}

function buildResolvedRuleSet(
  allRules: import('../types/rule').RuleFile[],
  activeEntries: import('../types/rule').ResolvedRuleEntry[],
  profile: import('../types/rule').RuleProfile,
  conflicts: import('../types/rule').ResolvedRuleConflict[]
): import('../types/rule').ResolvedRuleSet {
  return {
    profile,
    workspaceRules: allRules.filter(r => r.scope === 'workspace'),
    globalRules: allRules.filter(r => r.scope === 'global'),
    teamRules: allRules.filter(r => r.scope === 'team-pack'),
    activeRules: activeEntries.map(e => e.rule),
    activeEntries,
    injectionMode: 'text-fallback' as import('../types/rule').RuleInjectionMode,
    notes: [],
    conflicts,
  };
}
