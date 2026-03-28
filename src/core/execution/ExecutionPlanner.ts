import * as vscode from 'vscode';
import {
  ExecutionBehavior,
  ExecutionPreset,
} from '../../types/execution';
import { AgentType } from '../../types/agent';
import { ExecutionHistory } from './ExecutionHistory';
import { t } from '../../utils/i18n';

export interface AgentAvailabilityChecker {
  getSupportedBehaviors(agentType: AgentType): ExecutionBehavior[];
  isAvailable(agentType: AgentType): Promise<boolean>;
  getAvailableAgentTypes(): Promise<AgentType[]>;
  getAllAdapterNames(): { type: AgentType; name: string }[];
}

export interface PlannerStateStore {
  getGlobal<T>(key: string): T | undefined;
  setGlobal(key: string, value: unknown): Promise<void>;
}

const AGENT_CONFIGURED_KEY = 'pbp.agentConfigured';

export class ExecutionPlanner {
  constructor(
    private readonly history: ExecutionHistory,
    private readonly agents: AgentAvailabilityChecker,
    private readonly config: { defaultAgent: string },
    private readonly stateStore: PlannerStateStore
  ) {}

  /**
   * Resolve which agent to use.
   * - If user has already configured an agent (agentConfigured flag), use defaultAgent.
   * - Otherwise show a one-time picker and save the choice.
   */
  async resolveAgent(): Promise<AgentType> {
    const configured = this.stateStore.getGlobal<boolean>(AGENT_CONFIGURED_KEY);

    if (configured) {
      return this.config.defaultAgent as AgentType;
    }

    // First run: show picker
    const chosen = await this.showAgentPicker();
    const agentType = chosen ?? 'clipboard';

    await vscode.workspace.getConfiguration('pbp').update(
      'defaultAgent', agentType, vscode.ConfigurationTarget.Global
    );
    await this.stateStore.setGlobal(AGENT_CONFIGURED_KEY, true);

    if (chosen) {
      vscode.window.showInformationMessage(
        t('Default agent set to "{0}". Change anytime with Select Agent.', agentType)
      );
    }

    return agentType;
  }

  async recordExecution(promptId: string, agentType: AgentType, behavior: ExecutionBehavior): Promise<void> {
    const target = agentType === 'clipboard'
      ? { kind: 'clipboard' as const }
      : agentType === 'file'
        ? { kind: 'file' as const }
        : { kind: 'agent' as const, agentType };
    const preset: ExecutionPreset = { target, behavior };
    await this.history.saveRecord(promptId, preset);
  }

  private async showAgentPicker(): Promise<AgentType | undefined> {
    const available = await this.agents.getAvailableAgentTypes();
    const all = this.agents.getAllAdapterNames();

    const items: (vscode.QuickPickItem & { value: AgentType })[] = [
      // Available agents first
      ...all
        .filter(a => available.includes(a.type))
        .map(a => ({
          label: a.name,
          description: a.type,
          value: a.type,
        })),
      // Unavailable agents (grayed out)
      ...all
        .filter(a => !available.includes(a.type))
        .map(a => ({
          label: a.name,
          description: `${a.type} — not installed`,
          value: a.type,
        })),
    ];

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: t('Select default agent for running prompts'),
      title: t('Choose Agent'),
    });

    return picked?.value;
  }
}
