import * as vscode from 'vscode';
import {
  ExecutionBehavior,
  ExecutionPreset,
  ExecutionTarget,
} from '../../types/execution';
import { AgentType } from '../../types/agent';
import { ExecutionHistory } from './ExecutionHistory';
import { t } from '../../utils/i18n';

export type ExecutionSelectionMode = 'last-execution' | 'initial-recommendation' | 'ask-every-time';

export interface PlannerConfig {
  selectionMode: ExecutionSelectionMode;
  defaultAgent: string;
  defaultBehavior: string;
}

export interface AgentAvailabilityChecker {
  getSupportedBehaviors(agentType: AgentType): ExecutionBehavior[];
  isAvailable(agentType: AgentType): Promise<boolean>;
  getAvailableAgentTypes(): Promise<AgentType[]>;
}

export class ExecutionPlanner {
  constructor(
    private readonly history: ExecutionHistory,
    private readonly agents: AgentAvailabilityChecker,
    private readonly config: PlannerConfig
  ) {}

  async resolvePreset(
    promptId: string,
    forcePicker: boolean,
    explicitPreset?: ExecutionPreset
  ): Promise<ExecutionPreset | undefined> {
    if (explicitPreset) return explicitPreset;

    const mode = this.config.selectionMode;

    if (!forcePicker && mode === 'last-execution') {
      const last = this.history.getRecord(promptId);
      if (last) return { target: last.target, behavior: last.behavior };
    }

    if (!forcePicker && mode === 'initial-recommendation') {
      const recommended = await this.buildRecommendedPreset();
      if (recommended) return recommended;
    }

    return this.showPicker();
  }

  private async buildRecommendedPreset(): Promise<ExecutionPreset | undefined> {
    const defaultAgent = this.config.defaultAgent;

    if (defaultAgent === 'clipboard') return { target: { kind: 'clipboard' } };
    if (defaultAgent === 'file') return { target: { kind: 'file' } };

    const agentType = defaultAgent as AgentType;
    if (await this.agents.isAvailable(agentType)) {
      const behaviors = this.agents.getSupportedBehaviors(agentType);
      const behavior = behaviors.includes('send') ? 'send' : behaviors[0];
      return { target: { kind: 'agent', agentType }, behavior };
    }

    return undefined;
  }

  private async showPicker(): Promise<ExecutionPreset | undefined> {
    const available = await this.agents.getAvailableAgentTypes();
    const items: vscode.QuickPickItem[] = [
      { label: t('Clipboard'), description: 'clipboard' },
      { label: t('File'), description: 'file' },
      ...available.map(a => ({ label: a, description: `agent:${a}` })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('Select target agent'),
    });
    if (!picked) return undefined;

    if (picked.description === 'clipboard') return { target: { kind: 'clipboard' } };
    if (picked.description === 'file') return { target: { kind: 'file' } };

    const agentType = picked.label as AgentType;
    const behaviors = this.agents.getSupportedBehaviors(agentType);
    if (behaviors.length <= 1) {
      return { target: { kind: 'agent', agentType }, behavior: behaviors[0] };
    }

    const behaviorPick = await vscode.window.showQuickPick(
      behaviors.map(b => ({ label: b })),
      { placeHolder: t('Select behavior') }
    );
    if (!behaviorPick) return undefined;

    return { target: { kind: 'agent', agentType }, behavior: behaviorPick.label as ExecutionBehavior };
  }
}
