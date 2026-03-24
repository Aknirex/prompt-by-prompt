import { AgentType } from './agent';
import { EditorContext, PromptTemplate } from './prompt';
import { EffectivePolicy, ResolvedRuleSet } from './rule';

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
  envelope: ExecutionEnvelope;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
  variables: Record<string, string>;
  sourceContext: EditorContext;
  dispatchText: string;
  previewText: string;
}

export interface TaskPayload {
  promptId: string;
  promptName: string;
  renderedPrompt: string;
  variables: Record<string, string>;
}

export interface ExecutionEnvironmentContext {
  os?: string;
  shell?: string;
  locale?: string;
}

export interface ExecutionEditorContext {
  project?: string;
  file?: string;
  language?: string;
  line?: number;
  column?: number;
  selection?: string;
}

export interface ExecutionContextPayload {
  environment: ExecutionEnvironmentContext;
  editor: ExecutionEditorContext;
}

export interface ExecutionMetadata {
  injectionMode: 'native-structured' | 'segmented-text' | 'legacy-flat-text';
  bindingSource?: 'runtime' | 'workspace' | 'settings' | 'implicit';
  notes: string[];
  conflicts: string[];
}

export interface ExecutionEnvelope {
  task: TaskPayload;
  policy: EffectivePolicy;
  context: ExecutionContextPayload;
  metadata: ExecutionMetadata;
}

export interface ExecutionHistoryRecord extends ExecutionPreset {
  promptId: string;
  executedAt: string;
}

export type ExecutionHistoryMap = Record<string, ExecutionHistoryRecord>;
