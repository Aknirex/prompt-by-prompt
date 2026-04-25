import { describe, expect, it } from 'vitest';
import { ExecutionPlanner } from '../src/application/executionPlanner';
import { ExecutionContextPayload } from '../src/types/execution';
import { EditorContext, PromptTemplate } from '../src/types/prompt';
import { EffectivePolicy, ResolvedRuleSet } from '../src/types/rule';

describe('ExecutionPlanner', () => {
  function createPrompt(overrides: Partial<PromptTemplate> = {}): PromptTemplate {
    return {
      id: 'prompt-1',
      name: 'Review Prompt',
      description: '',
      category: 'review',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
      ...overrides,
    };
  }

  function createSourceContext(overrides: Partial<EditorContext> = {}): EditorContext {
    return {
      selection: 'const value = 1;',
      filepath: 'src/example.ts',
      file_content: 'const value = 1;',
      lang: 'typescript',
      project_name: 'prompt-by-prompt',
      line_number: 3,
      column_number: 7,
      ...overrides,
    };
  }

  function createExecutionContext(
    overrides: {
      environment?: Partial<ExecutionContextPayload['environment']>;
      editor?: Partial<ExecutionContextPayload['editor']>;
    } = {}
  ): ExecutionContextPayload {
    return {
      environment: {
        os: 'Windows',
        shell: 'pwsh',
        locale: 'zh-cn',
        ...overrides.environment,
      },
      editor: {
        project: 'prompt-by-prompt',
        file: 'src/example.ts',
        language: 'typescript',
        line: 3,
        column: 7,
        selection: 'const value = 1;',
        ...overrides.editor,
      },
    };
  }

  function createPolicy(overrides: Partial<EffectivePolicy> = {}): EffectivePolicy {
    return {
      profileId: 'profile',
      rules: [],
      preferences: [],
      guardrails: [],
      notes: [],
      conflicts: [],
      ...overrides,
    };
  }

  function createResolvedRules(overrides: Partial<ResolvedRuleSet> = {}): ResolvedRuleSet {
    return {
      profile: {
        id: 'profile',
        name: 'Workspace Only',
        enabledRuleIds: [],
        priority: 0,
        isActive: true,
      },
      workspaceRules: [],
      globalRules: [],
      teamRules: [],
      activeRules: [],
      activeEntries: [],
      inactiveEntries: [],
      injectionMode: 'text-fallback',
      notes: [],
      conflicts: [],
      ...overrides,
    };
  }

  it('builds one resolved execution plan for preview and dispatch', () => {
    const planner = new ExecutionPlanner();
    const plan = planner.buildPlan({
      prompt: createPrompt(),
      renderedPrompt: 'Review this change',
      variables: { tone: 'direct' },
      policy: createPolicy({
        rules: [
          {
            id: 'w1',
            canonicalKey: 'workspace:AGENTS.md',
            title: 'AGENTS.md',
            body: 'Be precise',
            source: 'workspace',
            priority: 300,
            required: false,
            kind: 'instruction',
            reason: 'Workspace rule discovered in the current project',
          },
        ],
      }),
      resolvedRules: createResolvedRules({
        injectionMode: 'structured-context',
        notes: ['Activated rules profile: Workspace Only'],
        conflicts: [
          {
            type: 'duplicate-name',
            message: 'Duplicate rule',
            ruleIds: ['w1', 'g1'],
          },
        ],
      }),
      sourceContext: createSourceContext(),
      executionContext: createExecutionContext(),
      target: { kind: 'agent', agentType: 'cline' },
      behavior: 'send',
    });

    expect(plan.envelope.task).toEqual({
      promptId: 'prompt-1',
      promptName: 'Review Prompt',
      renderedPrompt: 'Review this change',
      variables: { tone: 'direct' },
    });
    expect(plan.envelope.metadata).toEqual({
      injectionMode: 'native-structured',
      bindingSource: undefined,
      notes: ['Activated rules profile: Workspace Only'],
      conflicts: ['Duplicate rule'],
    });
    expect(plan.dispatchText).toContain('[Dispatch Strategy]\nTask-oriented bundle for cline');
    expect(plan.previewText).toContain('[Actual Payload]');
    expect(plan.previewText).toContain(plan.dispatchText);
    expect(plan.sourceContext.filepath).toBe('src/example.ts');
  });

  it('maps fallback rule injection to segmented text envelopes', () => {
    const planner = new ExecutionPlanner();
    const envelope = planner.buildExecutionEnvelope({
      prompt: createPrompt({ id: 'prompt-2', name: 'Summarizer' }),
      renderedPrompt: 'Summarize this file',
      variables: {},
      policy: createPolicy(),
      resolvedRules: createResolvedRules({
        injectionMode: 'text-fallback',
      }),
      sourceContext: createSourceContext(),
      executionContext: createExecutionContext({
        editor: { selection: '' },
      }),
      target: { kind: 'clipboard' },
    });

    expect(envelope.metadata.injectionMode).toBe('segmented-text');
    expect(envelope.task.promptName).toBe('Summarizer');
    expect(envelope.context.editor.selection).toBe('');
  });
});
