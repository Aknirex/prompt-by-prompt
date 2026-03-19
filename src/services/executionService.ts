import * as vscode from 'vscode';
import { AgentService } from './agentService';
import { ContextEngine } from './contextEngine';
import { PromptTemplate } from '../types/prompt';
import {
  ExecutionBehavior,
  ExecutionHistoryMap,
  ExecutionHistoryRecord,
  ExecutionTarget,
  ResolvedExecution,
  ResolvedRuleSet,
} from '../types/execution';
import { AgentType } from '../types/agent';
import { RuleManager } from './ruleManager';
import { t } from '../utils/i18n';

const EXECUTION_HISTORY_KEY = 'pbp.executionHistory';

interface ExecutionSelection {
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
}

interface ExecutionServiceOptions {
  forcePicker?: boolean;
  previewOnly?: boolean;
}

export class ExecutionService {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly contextEngine: ContextEngine,
    private readonly agentService: AgentService,
    private readonly ruleManager: RuleManager,
    private readonly log: (message: string) => void
  ) {}

  async runPrompt(
    prompt: PromptTemplate,
    options: ExecutionServiceOptions = {}
  ): Promise<void> {
    const editorContext = await this.contextEngine.extractContext();
    const variables = await this.collectVariables(prompt, editorContext);
    if (!variables) {
      this.log('Prompt execution cancelled while collecting variables');
      return;
    }

    const renderedPrompt = await this.contextEngine.renderTemplate(prompt, editorContext, variables);
    if (!renderedPrompt.trim()) {
      vscode.window.showWarningMessage(
        t('The rendered prompt is empty. Please check your template and variables.')
      );
      return;
    }

    const resolvedRules = this.resolveRules();
    const selection = await this.resolveSelection(prompt.id, options.forcePicker === true);
    if (!selection) {
      this.log('Prompt execution cancelled while selecting target');
      return;
    }

    const resolvedExecution: ResolvedExecution = {
      prompt,
      renderedPrompt,
      resolvedRules,
      target: selection.target,
      behavior: selection.behavior,
      variables,
      sourceContext: editorContext,
      previewText: this.buildPreviewText(renderedPrompt, resolvedRules, editorContext),
    };

    if (options.previewOnly) {
      await this.showPreview(resolvedExecution);
      return;
    }

    if (this.shouldPreviewBeforeSend()) {
      const confirmed = await this.showPreview(resolvedExecution, true);
      if (!confirmed) {
        this.log('Prompt execution cancelled from preview');
        return;
      }
    }

    const result = await this.dispatch(resolvedExecution);
    if (!result.success) {
      vscode.window.showErrorMessage(`${t('Failed to send prompt')}: ${result.message}`);
      return;
    }

    await this.saveHistory(prompt.id, selection);
  }

  async previewPrompt(prompt: PromptTemplate): Promise<void> {
    await this.runPrompt(prompt, { forcePicker: true, previewOnly: true });
  }

  async rerunLastTarget(prompt: PromptTemplate): Promise<void> {
    await this.runPrompt(prompt);
  }

  private async collectVariables(
    prompt: PromptTemplate,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>
  ): Promise<Record<string, string> | undefined> {
    const missingVariables = this.contextEngine.getMissingVariables(prompt, editorContext);
    const customVariables: Record<string, string> = {};

    for (const variable of missingVariables) {
      let value: string | undefined;

      if (variable.type === 'enum' && variable.values) {
        value = await vscode.window.showQuickPick(variable.values, {
          placeHolder: variable.description,
        });
      } else {
        const defaultValue = variable.default?.toString() || '';
        value = await vscode.window.showInputBox({
          prompt: variable.description,
          placeHolder: variable.placeholder || defaultValue,
          value: defaultValue,
          validateInput: () => null,
        });
      }

      if (value === undefined) {
        return undefined;
      }

      customVariables[variable.name] = value || variable.default?.toString() || '';
    }

    return customVariables;
  }

  private resolveRules(): ResolvedRuleSet {
    return {
      globalRule: this.ruleManager.getActiveGlobalRule(),
      workspaceRules: this.ruleManager.getWorkspaceRules(),
    };
  }

  private buildPreviewText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>
  ): string {
    const sections: string[] = [];

    sections.push(`[Task Prompt]\n${renderedPrompt.trim()}`);

    const ruleSections: string[] = [];
    if (resolvedRules.globalRule?.content.trim()) {
      ruleSections.push(`- Global Rule: ${resolvedRules.globalRule.name}\n${resolvedRules.globalRule.content.trim()}`);
    }

    for (const rule of resolvedRules.workspaceRules) {
      if (rule.content.trim()) {
        ruleSections.push(`- Workspace Rule: ${rule.name}\n${rule.content.trim()}`);
      }
    }

    if (ruleSections.length > 0) {
      sections.push(`[Active Rules]\n${ruleSections.join('\n\n')}`);
    }

    const contextLines = [
      `- project: ${editorContext.project_name || '(none)'}`,
      `- file: ${editorContext.filepath || '(none)'}`,
      `- language: ${editorContext.lang || '(none)'}`,
      `- line: ${editorContext.line_number ?? 0}`,
      `- column: ${editorContext.column_number ?? 0}`,
    ];

    if (editorContext.selection.trim()) {
      contextLines.push(`- selection: ${this.truncate(editorContext.selection.trim(), 200)}`);
    }

    sections.push(`[Editor Context]\n${contextLines.join('\n')}`);
    return sections.join('\n\n');
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
  }

  private shouldPreviewBeforeSend(): boolean {
    const config = vscode.workspace.getConfiguration('pbp');
    return config.get<boolean>('previewBeforeSend') ?? true;
  }

  private shouldRememberLastExecution(): boolean {
    const config = vscode.workspace.getConfiguration('pbp');
    return config.get<boolean>('rememberLastExecution') ?? true;
  }

  private getInitialBehavior(): ExecutionBehavior {
    const config = vscode.workspace.getConfiguration('pbp');
    const value = config.get<string>('sendBehavior');
    return value === 'append' || value === 'insert' ? value : 'send';
  }

  private getInitialAgentRecommendation(): AgentType | undefined {
    const config = vscode.workspace.getConfiguration('pbp');
    const value = config.get<string>('defaultAgent');

    if (!value || value === 'ask') {
      return undefined;
    }

    return value as AgentType;
  }

  private async resolveSelection(
    promptId: string,
    forcePicker: boolean
  ): Promise<ExecutionSelection | undefined> {
    if (!forcePicker && this.shouldRememberLastExecution()) {
      const historyRecord = this.getHistory()[promptId];
      if (historyRecord && (await this.isSelectionAvailable(historyRecord))) {
        return {
          target: historyRecord.target,
          behavior: historyRecord.behavior,
        };
      }
    }

    return this.selectTargetAndBehavior();
  }

  private async selectTargetAndBehavior(): Promise<ExecutionSelection | undefined> {
    const target = await this.selectTarget();
    if (!target) {
      return undefined;
    }

    if (target.kind !== 'agent') {
      return { target };
    }

    const behavior = await this.selectBehavior(target.agentType);
    if (behavior === null) {
      return undefined;
    }

    return {
      target,
      behavior: behavior ?? undefined,
    };
  }

  private async selectTarget(): Promise<ExecutionTarget | undefined> {
    const availableAgents = await this.agentService.getAvailableAgents();
    const preferredAgent = this.getInitialAgentRecommendation();

    type TargetQuickPickItem = vscode.QuickPickItem & {
      target: ExecutionTarget;
      sortOrder: number;
    };

    const items: TargetQuickPickItem[] = [
      {
        label: t('Copy to clipboard'),
        description: t('Clipboard target'),
        target: { kind: 'clipboard' },
        sortOrder: preferredAgent === 'clipboard' ? 0 : 100,
      },
      {
        label: t('Save to File'),
        description: t('File target'),
        target: { kind: 'file' },
        sortOrder: preferredAgent === 'file' ? 1 : 101,
      },
    ];

    for (const agentType of availableAgents) {
      if (agentType === 'clipboard' || agentType === 'file') {
        continue;
      }

      const adapter = this.agentService.getAdapter(agentType);
      if (!adapter) {
        continue;
      }

      items.push({
        label: adapter.name,
        description: this.describeAgent(adapter.capabilities),
        target: { kind: 'agent', agentType },
        sortOrder: preferredAgent === agentType ? 2 : 102,
      });
    }

    items.sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select execution target',
      title: 'Prompt by Prompt',
    });

    return selected?.target;
  }

  private describeAgent(capabilities: { canAutoSubmit: boolean; canAppendInput: boolean; canFillInput: boolean }): string {
    if (capabilities.canAutoSubmit && capabilities.canAppendInput) {
      return 'send + append';
    }

    if (capabilities.canAutoSubmit) {
      return 'send';
    }

    if (capabilities.canAppendInput || capabilities.canFillInput) {
      return 'append';
    }

    return 'clipboard fallback';
  }

  private async selectBehavior(agentType: AgentType): Promise<ExecutionBehavior | undefined | null> {
    const adapter = this.agentService.getAdapter(agentType);
    if (!adapter) {
      return null;
    }

    const behaviors = this.getSupportedBehaviors(agentType);
    if (behaviors.length === 0) {
      return undefined;
    }

    if (behaviors.length === 1) {
      return behaviors[0];
    }

    const preferredBehavior = this.getInitialBehavior();
    const sortedBehaviors = [...behaviors].sort((left, right) => {
      if (left === preferredBehavior) {
        return -1;
      }

      if (right === preferredBehavior) {
        return 1;
      }

      return left.localeCompare(right);
    });

    type BehaviorQuickPickItem = vscode.QuickPickItem & {
      behavior: ExecutionBehavior;
    };

    const items: BehaviorQuickPickItem[] = sortedBehaviors.map((behavior) => ({
      label: behavior,
      description: this.describeBehavior(behavior, adapter.name),
      behavior,
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: `Select behavior for ${adapter.name}`,
      title: 'Prompt by Prompt',
    });

    return selected?.behavior ?? null;
  }

  private describeBehavior(behavior: ExecutionBehavior, agentName: string): string {
    switch (behavior) {
      case 'append':
        return `Fill ${agentName} input without auto-submit`;
      case 'insert':
        return `Insert at top of ${agentName} input`;
      default:
        return `Send immediately to ${agentName}`;
    }
  }

  private getSupportedBehaviors(agentType: AgentType): ExecutionBehavior[] {
    const adapter = this.agentService.getAdapter(agentType);
    if (!adapter) {
      return [];
    }

    const behaviors: ExecutionBehavior[] = [];
    if (adapter.capabilities.canAutoSubmit) {
      behaviors.push('send');
    }

    if (adapter.capabilities.canAppendInput || adapter.capabilities.canFillInput) {
      behaviors.push('append');
    }

    if (adapter.capabilities.canInsertInput) {
      behaviors.push('insert');
    }

    return behaviors;
  }

  private async showPreview(
    resolvedExecution: ResolvedExecution,
    requireConfirmation = false
  ): Promise<boolean> {
    const document = await vscode.workspace.openTextDocument({
      content: resolvedExecution.previewText,
      language: 'markdown',
    });

    await vscode.window.showTextDocument(document, {
      preview: false,
      viewColumn: vscode.ViewColumn.Beside,
    });

    if (!requireConfirmation) {
      return true;
    }

    const choice = await vscode.window.showInformationMessage(
      'Preview opened. Continue with this execution?',
      { modal: true },
      'Continue',
      t('Cancel')
    );

    return choice === 'Continue';
  }

  private async dispatch(resolvedExecution: ResolvedExecution) {
    this.log(
      `Dispatching prompt "${resolvedExecution.prompt.name}" to ${this.formatTargetLabel(
        resolvedExecution.target
      )}${resolvedExecution.behavior ? ` (${resolvedExecution.behavior})` : ''}`
    );

    if (resolvedExecution.target.kind === 'agent') {
      return this.agentService.sendToAgent(
        resolvedExecution.previewText,
        resolvedExecution.target.agentType,
        { behavior: resolvedExecution.behavior }
      );
    }

    const fallbackTarget = resolvedExecution.target.kind === 'file' ? 'file' : 'clipboard';
    return this.agentService.sendToAgent(resolvedExecution.previewText, fallbackTarget);
  }

  private formatTargetLabel(target: ExecutionTarget): string {
    if (target.kind === 'agent') {
      return target.agentType;
    }

    return target.kind;
  }

  private getHistory(): ExecutionHistoryMap {
    return this.context.globalState.get<ExecutionHistoryMap>(EXECUTION_HISTORY_KEY, {});
  }

  private async saveHistory(promptId: string, selection: ExecutionSelection): Promise<void> {
    if (!this.shouldRememberLastExecution()) {
      return;
    }

    const history = this.getHistory();
    history[promptId] = {
      promptId,
      target: selection.target,
      behavior: selection.behavior,
      executedAt: new Date().toISOString(),
    };

    await this.context.globalState.update(EXECUTION_HISTORY_KEY, history);
  }

  private async isSelectionAvailable(record: ExecutionHistoryRecord): Promise<boolean> {
    if (record.target.kind !== 'agent') {
      return true;
    }

    const adapter = this.agentService.getAdapter(record.target.agentType);
    if (!adapter) {
      return false;
    }

    if (!(await adapter.isAvailable())) {
      return false;
    }

    if (!record.behavior) {
      return true;
    }

    return this.getSupportedBehaviors(record.target.agentType).includes(record.behavior);
  }
}
