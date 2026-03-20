import * as vscode from 'vscode';
import { AgentService, getSupportedExecutionBehaviors } from './agentService';
import { ContextEngine } from './contextEngine';
import { PromptTemplate } from '../types/prompt';
import {
  ExecutionBehavior,
  ExecutionHistoryMap,
  ExecutionHistoryRecord,
  ExecutionTarget,
  ResolvedExecution,
} from '../types/execution';
import { AgentType } from '../types/agent';
import { ResolvedRuleSet } from '../types/rule';
import { RuleManager } from './ruleManager';
import { t } from '../utils/i18n';

const EXECUTION_HISTORY_KEY = 'pbp.executionHistory';

interface ExecutionSelection {
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
}

interface ExecutionServiceOptions {
  forcePicker?: boolean;
}

type ExecutionSelectionMode =
  | 'last-execution'
  | 'initial-recommendation'
  | 'ask-every-time';

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

    const selection = await this.resolveSelection(prompt.id, options.forcePicker === true);
    if (!selection) {
      this.log('Prompt execution cancelled while selecting target');
      return;
    }
    const resolvedRules = this.resolveRules(selection.target);

    const resolvedExecution: ResolvedExecution = {
      prompt,
      renderedPrompt,
      resolvedRules,
      target: selection.target,
      behavior: selection.behavior,
      variables,
      sourceContext: editorContext,
      dispatchText: this.buildDispatchText(renderedPrompt, resolvedRules, editorContext, selection.target),
      previewText: '',
    };
    resolvedExecution.previewText = this.buildPreviewText(resolvedExecution);

    const result = await this.dispatch(resolvedExecution);
    if (!result.success) {
      vscode.window.showErrorMessage(`${t('Failed to send prompt')}: ${result.message}`);
      return;
    }

    await this.saveHistory(prompt.id, selection);
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

  private resolveRules(target: ExecutionTarget): ResolvedRuleSet {
    if (target.kind !== 'agent') {
      return this.ruleManager.resolveRuleSet();
    }

    const adapter = this.agentService.getAdapter(target.agentType);
    return this.ruleManager.resolveRuleSet({
      agentType: target.agentType,
      supportsStructuredContext: adapter?.capabilities.canUseStructuredContext ?? false,
    });
  }

  private buildDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>,
    target: ExecutionTarget
  ): string {
    if (target.kind === 'agent') {
      return this.buildAgentDispatchText(renderedPrompt, resolvedRules, editorContext, target.agentType);
    }

    return this.buildGenericDispatchText(
      renderedPrompt,
      resolvedRules,
      editorContext,
      'Standard preview bundle'
    );
  }

  private buildPreviewText(resolvedExecution: ResolvedExecution): string {
    return [
      '[Dispatch Target]',
      `- target: ${this.formatTargetLabel(resolvedExecution.target)}`,
      `- behavior: ${resolvedExecution.behavior ?? 'default'}`,
      `- injection: ${resolvedExecution.resolvedRules.injectionMode}`,
      '',
      '[Actual Payload]',
      resolvedExecution.dispatchText,
    ].join('\n');
  }

  private buildGenericDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>,
    strategyName: string
  ): string {
    const sections: string[] = [];

    sections.push(`[Dispatch Strategy]\n${strategyName}`);
    sections.push(`[Task Prompt]\n${renderedPrompt.trim()}`);

    const ruleSections: string[] = [];
    for (const entry of resolvedRules.activeEntries) {
      if (entry.rule.content.trim()) {
        ruleSections.push(
          `- ${entry.rule.scope === 'global' ? 'Global' : 'Workspace'} Rule: ${entry.rule.name}\n`
          + `  Reason: ${entry.reason}\n${entry.rule.content.trim()}`
        );
      }
    }

    if (ruleSections.length > 0) {
      sections.push(`[Active Rules]\n${ruleSections.join('\n\n')}`);
    }

    if (resolvedRules.notes.length > 0) {
      sections.push(`[Rule Notes]\n${resolvedRules.notes.map((note: string) => `- ${note}`).join('\n')}`);
    }

    if (resolvedRules.conflicts.length > 0) {
      sections.push(`[Rule Conflicts]\n${resolvedRules.conflicts.map((conflict) => `- ${conflict.message}`).join('\n')}`);
    }

    sections.push(`[Editor Context]\n${this.buildContextLines(editorContext).join('\n')}`);
    return sections.join('\n\n');
  }

  private buildAgentDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>,
    agentType: AgentType
  ): string {
    switch (agentType) {
      case 'copilot':
        return this.buildCopilotDispatchText(renderedPrompt, resolvedRules, editorContext);
      case 'cline':
      case 'roo-code':
      case 'codex':
        return this.buildTaskOrientedDispatchText(renderedPrompt, resolvedRules, editorContext, agentType);
      case 'continue':
      case 'cursor':
      case 'kilo-code':
      case 'gemini':
      case 'tongyi':
        return this.buildChatDispatchText(renderedPrompt, resolvedRules, editorContext, agentType);
      default:
        return this.buildGenericDispatchText(
          renderedPrompt,
          resolvedRules,
          editorContext,
          `Generic agent bundle for ${agentType}`
        );
    }
  }

  private buildTaskOrientedDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>,
    agentType: AgentType
  ): string {
    const sections: string[] = [
      `[Dispatch Strategy]\nTask-oriented bundle for ${agentType}`,
      `[Task]\n${renderedPrompt.trim()}`,
    ];

    if (resolvedRules.activeEntries.length > 0) {
      sections.push(
        `[Rules]\n${resolvedRules.activeEntries.map((entry) =>
          `- ${entry.rule.name} (${entry.rule.scope})\n  Why active: ${entry.reason}\n${this.indentBlock(entry.rule.content.trim(), 2)}`
        ).join('\n\n')}`
      );
    }

    sections.push(`[Context]\n${this.buildContextLines(editorContext).join('\n')}`);

    if (resolvedRules.conflicts.length > 0) {
      sections.push(`[Conflicts]\n${resolvedRules.conflicts.map((conflict) => `- ${conflict.message}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private buildCopilotDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>
  ): string {
    const parts: string[] = [`Task:\n${renderedPrompt.trim()}`];

    if (resolvedRules.activeEntries.length > 0) {
      parts.push(
        `Rules:\n${resolvedRules.activeEntries.map((entry) => `- ${entry.rule.name}: ${entry.reason}`).join('\n')}`
      );
    }

    parts.push(`Context:\n${this.buildContextLines(editorContext).join('\n')}`);
    return parts.join('\n\n');
  }

  private buildChatDispatchText(
    renderedPrompt: string,
    resolvedRules: ResolvedRuleSet,
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>,
    agentType: AgentType
  ): string {
    const sections: string[] = [
      `[Dispatch Strategy]\nChat bundle for ${agentType}`,
      `[Task Prompt]\n${renderedPrompt.trim()}`,
    ];

    if (resolvedRules.activeEntries.length > 0) {
      sections.push(
        `[Active Rules]\n${resolvedRules.activeEntries.map((entry) =>
          `- ${entry.rule.name}\n  Why active: ${entry.reason}`
        ).join('\n')}`
      );
    }

    sections.push(`[Editor Context]\n${this.buildContextLines(editorContext).join('\n')}`);
    return sections.join('\n\n');
  }

  private buildContextLines(
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>
  ): string[] {
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

    return contextLines;
  }

  private indentBlock(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces);
    return value.split('\n').map((line) => `${prefix}${line}`).join('\n');
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
  }

  private getInitialBehavior(): ExecutionBehavior {
    const config = vscode.workspace.getConfiguration('pbp');
    const value = config.get<string>('sendBehavior');
    return value === 'append' || value === 'overwrite' || value === 'insert' ? value : 'send';
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
    if (forcePicker) {
      return this.selectTargetAndBehavior();
    }

    const mode = this.getExecutionSelectionMode();

    if (mode === 'ask-every-time') {
      return this.selectTargetAndBehavior();
    }

    if (mode === 'initial-recommendation') {
      const initialSelection = await this.resolveInitialSelection();
      if (initialSelection) {
        return initialSelection;
      }

      return this.selectTargetAndBehavior();
    }

    const historyRecord = this.getHistory()[promptId];
    if (historyRecord && (await this.isSelectionAvailable(historyRecord))) {
      return {
        target: historyRecord.target,
        behavior: historyRecord.behavior,
      };
    }

    return this.selectTargetAndBehavior();
  }

  private getExecutionSelectionMode(): ExecutionSelectionMode {
    const config = vscode.workspace.getConfiguration('pbp');
    const configured = config.get<string>('executionSelectionMode');
    if (
      configured === 'last-execution' ||
      configured === 'initial-recommendation' ||
      configured === 'ask-every-time'
    ) {
      return configured;
    }

    const rememberLastExecution = config.get<boolean>('rememberLastExecution');
    return rememberLastExecution === false ? 'ask-every-time' : 'last-execution';
  }

  private async resolveInitialSelection(): Promise<ExecutionSelection | undefined> {
    const target = await this.getInitialTargetRecommendation();
    if (!target) {
      return undefined;
    }

    if (target.kind !== 'agent') {
      return { target };
    }

    const behaviors = this.getSupportedBehaviors(target.agentType);
    if (behaviors.length === 0) {
      return { target };
    }

    const preferredBehavior = this.getInitialBehavior();
    const behavior = behaviors.includes(preferredBehavior)
      ? preferredBehavior
      : (behaviors.includes('send') ? 'send' : behaviors[0]);

    return {
      target,
      behavior,
    };
  }

  private async getInitialTargetRecommendation(): Promise<ExecutionTarget | undefined> {
    const preferredAgent = this.getInitialAgentRecommendation();
    if (!preferredAgent) {
      return undefined;
    }

    if (preferredAgent === 'clipboard') {
      return { kind: 'clipboard' };
    }

    if (preferredAgent === 'file') {
      return { kind: 'file' };
    }

    const adapter = this.agentService.getAdapter(preferredAgent);
    if (!adapter || !(await adapter.isAvailable())) {
      return undefined;
    }

    return {
      kind: 'agent',
      agentType: preferredAgent,
    };
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
    if (capabilities.canAutoSubmit && capabilities.canAppendInput && capabilities.canFillInput) {
      return 'send + append + overwrite';
    }

    if (capabilities.canAutoSubmit && capabilities.canAppendInput) {
      return 'send + append';
    }

    if (capabilities.canAutoSubmit && capabilities.canFillInput) {
      return 'send + overwrite';
    }

    if (capabilities.canAutoSubmit) {
      return 'send';
    }

    if (capabilities.canAppendInput) {
      return 'append';
    }

    if (capabilities.canFillInput) {
      return 'overwrite';
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
        return `Append to ${agentName} input without auto-submit`;
      case 'overwrite':
        return `Overwrite ${agentName} input without auto-submit`;
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

    return getSupportedExecutionBehaviors(adapter.capabilities);
  }

  private async dispatch(resolvedExecution: ResolvedExecution) {
    this.log(
      `Dispatching prompt "${resolvedExecution.prompt.name}" to ${this.formatTargetLabel(
        resolvedExecution.target
      )}${resolvedExecution.behavior ? ` (${resolvedExecution.behavior})` : ''}`
    );

    if (resolvedExecution.target.kind === 'agent') {
      return this.agentService.sendToAgent(
        resolvedExecution.dispatchText,
        resolvedExecution.target.agentType,
        { behavior: resolvedExecution.behavior }
      );
    }

    const fallbackTarget = resolvedExecution.target.kind === 'file' ? 'file' : 'clipboard';
    return this.agentService.sendToAgent(resolvedExecution.dispatchText, fallbackTarget);
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
    const mode = this.getExecutionSelectionMode();
    if (mode !== 'last-execution') {
      return;
    }

    const config = vscode.workspace.getConfiguration('pbp');
    if (config.get<boolean>('rememberLastExecution') === false) {
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
