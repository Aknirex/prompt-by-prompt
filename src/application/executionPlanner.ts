import { PayloadComposer } from './payloadComposer';
import { PromptTemplate, EditorContext } from '../types/prompt';
import {
  ExecutionBehavior,
  ExecutionContextPayload,
  ExecutionEnvelope,
  ExecutionTarget,
  ResolvedExecution,
} from '../types/execution';
import { EffectivePolicy, ResolvedRuleSet } from '../types/rule';

export interface ExecutionPlanRequest {
  prompt: PromptTemplate;
  renderedPrompt: string;
  variables: Record<string, string>;
  policy: EffectivePolicy;
  resolvedRules: ResolvedRuleSet;
  sourceContext: EditorContext;
  executionContext: ExecutionContextPayload;
  target: ExecutionTarget;
  behavior?: ExecutionBehavior;
}

export class ExecutionPlanner {
  constructor(private readonly payloadComposer = new PayloadComposer()) {}

  buildPlan(request: ExecutionPlanRequest): ResolvedExecution {
    const envelope = this.buildExecutionEnvelope(request);
    const dispatchText = this.payloadComposer.buildDispatchText(envelope, request.target);
    const plan: ResolvedExecution = {
      prompt: request.prompt,
      renderedPrompt: request.renderedPrompt,
      resolvedRules: request.resolvedRules,
      envelope,
      target: request.target,
      behavior: request.behavior,
      variables: request.variables,
      sourceContext: request.sourceContext,
      dispatchText,
      previewText: '',
    };

    plan.previewText = this.payloadComposer.buildPreviewText(plan);
    return plan;
  }

  buildExecutionEnvelope(request: ExecutionPlanRequest): ExecutionEnvelope {
    return {
      task: {
        promptId: request.prompt.id,
        promptName: request.prompt.name,
        renderedPrompt: request.renderedPrompt,
        variables: request.variables,
      },
      policy: request.policy,
      context: request.executionContext,
      metadata: {
        injectionMode: request.resolvedRules.injectionMode === 'structured-context'
          ? 'native-structured'
          : 'segmented-text',
        bindingSource: request.resolvedRules.binding?.source,
        notes: request.resolvedRules.notes,
        conflicts: request.resolvedRules.conflicts.map((conflict) => conflict.message),
      },
    };
  }
}
