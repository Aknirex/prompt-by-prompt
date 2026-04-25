import { describe, expect, it } from 'vitest';
import { PayloadComposer } from '../src/application/payloadComposer';
import { ExecutionEnvelope } from '../src/types/execution';
import { EffectivePolicy } from '../src/types/rule';

type EnvelopeOverrides = {
  task?: Partial<ExecutionEnvelope['task']>;
  policy?: Partial<EffectivePolicy>;
  context?: {
    environment?: Partial<ExecutionEnvelope['context']['environment']>;
    editor?: Partial<ExecutionEnvelope['context']['editor']>;
  };
  metadata?: Partial<ExecutionEnvelope['metadata']>;
};

describe('PayloadComposer', () => {
  function createEnvelope(overrides: EnvelopeOverrides = {}): ExecutionEnvelope {
    const base: ExecutionEnvelope = {
      task: {
        promptId: 'prompt-1',
        promptName: 'Example',
        renderedPrompt: 'Implement feature',
        variables: {},
      },
      policy: {
        profileId: 'profile',
        rules: [],
        preferences: [],
        guardrails: [],
        notes: [],
        conflicts: [],
      },
      context: {
        environment: { os: 'Windows', shell: 'pwsh', locale: 'zh-cn' },
        editor: {
          project: 'prompt-by-prompt',
          file: 'src/example.ts',
          language: 'typescript',
          line: 1,
          column: 1,
          selection: 'const value = 1;',
        },
      },
      metadata: {
        injectionMode: 'segmented-text',
        notes: [],
        conflicts: [],
      },
    };

    return {
      task: { ...base.task, ...overrides.task },
      policy: { ...base.policy, ...overrides.policy },
      context: {
        environment: { ...base.context.environment, ...overrides.context?.environment },
        editor: { ...base.context.editor, ...overrides.context?.editor },
      },
      metadata: { ...base.metadata, ...overrides.metadata },
    };
  }

  it('builds copilot payloads without preview chrome', () => {
    const composer = new PayloadComposer();
    const envelope = createEnvelope({
      task: { renderedPrompt: 'Review this change' },
      policy: {
        rules: [
          {
            id: 'g1',
            canonicalKey: 'global:team.md',
            title: 'team.md',
            body: '# Follow team conventions',
            source: 'global',
            priority: 100,
            required: false,
            kind: 'instruction',
            reason: 'Enabled by active personal rule "Global: team.md"',
          },
        ],
      },
    });

    const payload = composer.buildDispatchText(envelope, {
      kind: 'agent',
      agentType: 'copilot',
    });

    expect(payload).toContain('Policy:\n- profile: profile');
    expect(payload).toContain('Rules:\n- team.md: Enabled by active personal rule "Global: team.md"');
    expect(payload).toContain('Task:\nReview this change');
    expect(payload).toContain('Context:\n- project: prompt-by-prompt');
    expect(payload).not.toContain('[Dispatch Target]');
  });

  it('builds task-oriented payloads and preview wrappers for task agents', () => {
    const composer = new PayloadComposer();
    const envelope = createEnvelope({
      policy: {
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
      },
      metadata: {
        notes: ['Activated rules profile: Workspace Only'],
        conflicts: ['Duplicate rule'],
      },
    });

    const dispatchText = composer.buildDispatchText(envelope, {
      kind: 'agent',
      agentType: 'cline',
    });

    expect(dispatchText).toContain('[Dispatch Strategy]\nTask-oriented bundle for cline');
    expect(dispatchText).toContain('[Rules]');
    expect(dispatchText).toContain('Why active: Workspace rule discovered in the current project');
    expect(dispatchText).toContain('[Conflicts]\n- Duplicate rule');

    const previewText = composer.buildPreviewText({
      envelope,
      target: { kind: 'agent', agentType: 'cline' },
      behavior: 'send',
      dispatchText,
    });

    expect(previewText).toContain('[Dispatch Target]');
    expect(previewText).toContain('- target: cline');
    expect(previewText).toContain('[Actual Payload]');
    expect(previewText).toContain('Task-oriented bundle for cline');
  });

  it('builds generic payloads with policy notes and conflicts for fallback targets', () => {
    const composer = new PayloadComposer();
    const envelope = createEnvelope({
      task: { renderedPrompt: 'Summarize the selected code' },
      policy: {
        rules: [
          {
            id: 'g1',
            canonicalKey: 'global:team.md',
            title: 'team.md',
            body: '# Follow the playbook',
            source: 'global',
            priority: 100,
            required: false,
            kind: 'instruction',
            reason: 'Enabled by active personal rule "Global: team.md"',
          },
        ],
      },
      metadata: {
        notes: ['Resolved for target: clipboard'],
        conflicts: ['Duplicate rule name detected'],
      },
    });

    const dispatchText = composer.buildDispatchText(envelope, { kind: 'clipboard' });

    expect(dispatchText).toContain('[Dispatch Strategy]\nSegmented envelope bundle');
    expect(dispatchText).toContain('[Task]\nSummarize the selected code');
    expect(dispatchText).toContain('[Rules]');
    expect(dispatchText).toContain('[Policy Notes]\n- Resolved for target: clipboard');
    expect(dispatchText).toContain('[Policy Conflicts]\n- Duplicate rule name detected');
  });

  it('builds chat payloads with summarized rules and truncated selection context', () => {
    const composer = new PayloadComposer();
    const longSelection = 'x'.repeat(220);
    const envelope = createEnvelope({
      task: { renderedPrompt: 'Explain this code' },
      policy: {
        rules: [
          {
            id: 'w1',
            canonicalKey: 'workspace:AGENTS.md',
            title: 'AGENTS.md',
            body: 'Prefer small patches',
            source: 'workspace',
            priority: 300,
            required: false,
            kind: 'instruction',
            reason: 'Workspace rule discovered in the current project',
          },
        ],
      },
      context: {
        editor: {
          selection: longSelection,
          line: 8,
          column: 2,
        },
      },
    });

    const dispatchText = composer.buildDispatchText(envelope, {
      kind: 'agent',
      agentType: 'continue',
    });

    expect(dispatchText).toContain('[Dispatch Strategy]\nChat bundle for continue');
    expect(dispatchText).toContain(
      '[Active Rules]\n- AGENTS.md\n  Why active: Workspace rule discovered in the current project'
    );
    expect(dispatchText).toContain(`- selection: ${'x'.repeat(200)}...`);
    expect(dispatchText).not.toContain(longSelection);
  });
});
