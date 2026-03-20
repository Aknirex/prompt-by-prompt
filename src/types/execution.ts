import { AgentType } from './agent';
import { EditorContext, PromptTemplate } from './prompt';
import { ResolvedRuleSet } from './rule';

export type ExecutionBehavior = 'send' | 'append' | 'overwrite' | 'insert';

export type ExecutionTarget =
  | { kind: 'agent'; agentType: AgentType }
  | { kind: 'clipboard' }
  | { kind: 'file' };

export interface ExecutionPreset {
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
}

export interface ResolvedExecution {
  prompt: PromptTemplate;
  renderedPrompt: string;
  resolvedRules: ResolvedRuleSet;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
  variables: Record<string, string>;
  sourceContext: EditorContext;
  dispatchText: string;
  previewText: string;
}

export interface ExecutionHistoryRecord extends ExecutionPreset {
  promptId: string;
  executedAt: string;
}

export type ExecutionHistoryMap = Record<string, ExecutionHistoryRecord>;
