import * as vscode from 'vscode';
import { AgentService, getSupportedExecutionBehaviors } from './agentService';
import { ContextEngine } from './contextEngine';
import { PromptTemplate } from '../types/prompt';
import { ExecutionPlanner } from '../application/executionPlanner';
import { ExecutionRunner } from '../application/executionRunner';
import { PayloadComposer } from '../application/payloadComposer';
import {
  ExecutionContextPayload,
  ExecutionEnvelope,
  ExecutionBehavior,
  ExecutionHistoryMap,
  ExecutionHistoryRecord,
  ExecutionPreset,
  ExecutionTarget,
  ResolvedExecution,
} from '../types/execution';
import { AgentType } from '../types/agent';
import { ResolvedRuleSet } from '../types/rule';
import { RuleManager } from './ruleManager';
import { t } from '../utils/i18n';

const EXECUTION_HISTORY_KEY = 'pbp.executionHistory';
const EXECUTION_SELECTION_MODE_STATE_KEY = 'pbp.executionSelectionMode';
const REMEMBER_LAST_EXECUTION_STATE_KEY = 'pbp.rememberLastExecution';

interface ExecutionSelection {
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
}

interface ExecutionServiceOptions {
  forcePicker?: boolean;
  explicitPreset?: ExecutionPreset;
}

type ExecutionSelectionMode =
  | 'last-execution'
  | 'initial-recommendation'
  | 'ask-every-time';

export class ExecutionService {
  private readonly payloadComposer = new PayloadComposer();
  private readonly executionPlanner = new ExecutionPlanner(this.payloadComposer);
  private readonly executionRunner = new ExecutionRunner(
    {
      dispatch: (plan) => this.dispatch(plan),
    },
    {
      recordSuccessfulExecution: (plan) => this.saveHistory(plan.prompt.id, {
        target: plan.target,
        behavior: plan.behavior,
      }),
    }
  );

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
  ): Promise<boolean> {
    const resolvedExecution = await this.resolveExecution(prompt, options);
    if (!resolvedExecution) {
      return false;
    }

    const result = await this.executionRunner.run(resolvedExecution);
    if (!result.success) {
      vscode.window.showErrorMessage(`${t('Failed to send prompt')}: ${result.message}`);
      return false;
    }

    return true;
  }

  async previewPrompt(
    prompt: PromptTemplate,
    options: ExecutionServiceOptions = {}
  ): Promise<ResolvedExecution | undefined> {
    return this.resolveExecution(prompt, options);
  }

  async selectExecutionTarget(prompt: PromptTemplate): Promise<ExecutionPreset | undefined> {
    const selection = await this.selectTargetAndBehavior();
    if (!selection) {
      return undefined;
    }

    await this.savePreset(prompt.id, selection);
    return selection;
  }

  async rerunLastTarget(prompt: PromptTemplate): Promise<boolean> {
    return this.runPrompt(prompt);
  }

  private async resolveExecution(
    prompt: PromptTemplate,
    options: ExecutionServiceOptions = {}
  ): Promise<ResolvedExecution | undefined> {
    const editorContext = await this.contextEngine.extractContext();
    const variables = await this.collectVariables(prompt, editorContext);
    if (!variables) {
      this.log('Prompt execution cancelled while collecting variables');
      return undefined;
    }

    const renderedPrompt = await this.contextEngine.renderTemplate(prompt, editorContext, variables);
    if (!renderedPrompt.trim()) {
      vscode.window.showWarningMessage(
        t('The rendered prompt is empty. Please check your template and variables.')
      );
      return undefined;
    }

    const selection = options.explicitPreset ?? await this.resolveSelection(prompt.id, options.forcePicker === true);
    if (!selection) {
      this.log('Prompt execution cancelled while selecting target');
      return undefined;
    }
    const resolvedRules = this.resolveRules(selection.target);
    const effectivePolicy = this.ruleManager.resolvePolicy({
      agentType: selection.target.kind === 'agent' ? selection.target.agentType : undefined,
      supportsStructuredContext: resolvedRules.injectionMode === 'structured-context',
    });
    return this.executionPlanner.buildPlan({
      prompt,
      renderedPrompt,
      variables,
      policy: effectivePolicy,
      resolvedRules,
      sourceContext: editorContext,
      executionContext: this.buildExecutionContext(editorContext),
      target: selection.target,
      behavior: selection.behavior,
    });
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

  private buildPreviewText(resolvedExecution: ResolvedExecution): string {
    return this.payloadComposer.buildPreviewText(resolvedExecution);
  }

  private buildExecutionContext(
    editorContext: Awaited<ReturnType<ContextEngine['extractContext']>>
  ): ExecutionContextPayload {
    const shellPath = process.platform === 'win32'
      ? (process.env.ComSpec || process.env.SHELL || process.env.PSModulePath || '')
      : (process.env.SHELL || '');
    const shell = shellPath.split(/[/\\]/).filter(Boolean).pop() || '';

    return {
      environment: {
        os: process.platform === 'win32' ? 'Windows' : process.platform,
        shell,
        locale: vscode.env.language || '',
      },
      editor: {
        project: editorContext.project_name,
        file: editorContext.filepath,
        language: editorContext.lang,
        line: editorContext.line_number,
        column: editorContext.column_number,
        selection: editorContext.selection,
      },
    };
  }

  private buildDispatchText(envelope: ExecutionEnvelope, target: ExecutionTarget): string {
    return this.payloadComposer.buildDispatchText(envelope, target);
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

    const globalMode = this.context.globalState.get<string>(EXECUTION_SELECTION_MODE_STATE_KEY);
    if (
      globalMode === 'last-execution' ||
      globalMode === 'initial-recommendation' ||
      globalMode === 'ask-every-time'
    ) {
      return globalMode;
    }

    const rememberLastExecution = this.getRememberLastExecution(config);
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
      placeHolder: t('Select execution target'),
      title: t('Prompt by Prompt'),
    });

    return selected?.target;
  }

  private describeAgent(capabilities: { canAutoSubmit: boolean; canAppendInput: boolean; canFillInput: boolean }): string {
    if (capabilities.canAutoSubmit && capabilities.canAppendInput && capabilities.canFillInput) {
      return t('send + append + overwrite');
    }

    if (capabilities.canAutoSubmit && capabilities.canAppendInput) {
      return t('send + append');
    }

    if (capabilities.canAutoSubmit && capabilities.canFillInput) {
      return t('send + overwrite');
    }

    if (capabilities.canAutoSubmit) {
      return t('send');
    }

    if (capabilities.canAppendInput) {
      return t('append');
    }

    if (capabilities.canFillInput) {
      return t('overwrite');
    }

    return t('clipboard fallback');
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
      placeHolder: t('Select behavior for {0}', adapter.name),
      title: t('Prompt by Prompt'),
    });

    return selected?.behavior ?? null;
  }

  private describeBehavior(behavior: ExecutionBehavior, agentName: string): string {
    switch (behavior) {
      case 'append':
        return t('Append to {0} input without auto-submit', agentName);
      case 'overwrite':
        return t('Overwrite {0} input without auto-submit', agentName);
      case 'insert':
        return t('Insert at top of {0} input', agentName);
      default:
        return t('Send immediately to {0}', agentName);
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
    return this.payloadComposer.formatTargetLabel(target);
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
    if (this.getRememberLastExecution(config) === false) {
      return;
    }

    await this.savePreset(promptId, selection);
  }

  private async savePreset(promptId: string, selection: ExecutionPreset): Promise<void> {
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

  private getRememberLastExecution(config: vscode.WorkspaceConfiguration): boolean | undefined {
    const configured = config.get<boolean>('rememberLastExecution');
    if (typeof configured === 'boolean') {
      return configured;
    }

    return this.context.globalState.get<boolean>(REMEMBER_LAST_EXECUTION_STATE_KEY);
  }
}
