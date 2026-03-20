import { describe, expect, it, vi } from 'vitest';

const configValues = vi.hoisted(() => ({
  sendBehavior: 'send',
  executionSelectionMode: 'last-execution',
  rememberLastExecution: true,
  defaultAgent: 'clipboard',
}));

vi.mock('vscode', async () => {
  class EventEmitter<T> {
    private listeners: Array<(value: T) => void> = [];
    public event = (listener: (value: T) => void) => {
      this.listeners.push(listener);
      return { dispose: () => undefined };
    };
    public fire(value: T): void {
      for (const listener of this.listeners) {
        listener(value);
      }
    }
  }

  return {
    workspace: {
      getConfiguration: vi.fn(() => ({
        get: (key: string, fallback?: unknown) =>
          (configValues as Record<string, unknown>)[key.replace('pbp.', '')] ?? fallback,
      })),
    },
    window: {
      showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
      showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
      showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
      showQuickPick: vi.fn(() => Promise.resolve(undefined)),
      showInputBox: vi.fn(() => Promise.resolve(undefined)),
    },
    commands: {
      executeCommand: vi.fn(async () => undefined),
    },
    EventEmitter,
  };
});

describe('ExecutionService', () => {
  it('dispatches copilot payloads with task, rules, and context instead of preview chrome', async () => {
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn(() => ({})),
          update: vi.fn(async () => undefined),
        },
      } as never,
      {
        extractContext: vi.fn(async () => ({
          selection: 'const value = 1;',
          filepath: 'src/file.ts',
          file_content: 'const value = 1;',
          lang: 'typescript',
          project_name: 'prompt-by-prompt',
          line_number: 3,
          column_number: 7,
        })),
        getMissingVariables: vi.fn(() => []),
        renderTemplate: vi.fn(async () => 'Review this change'),
      } as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'GitHub Copilot',
          capabilities: {
            canCreateTask: true,
            canFillInput: true,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: true,
            canUseStructuredContext: false,
          },
        })),
        sendToAgent: vi.fn(async () => ({ success: true })),
      } as never,
      {
        resolveRuleSet: vi.fn(() => ({
          profile: { id: 'profile', name: 'Global: team.md', enabledRuleIds: ['g1'], priority: 1, isActive: true },
          workspaceRules: [],
          globalRules: [],
          activeRules: [],
          activeEntries: [
            {
              rule: {
                id: 'g1',
                name: 'team.md',
                path: '/tmp/team.md',
                scope: 'global',
                format: 'markdown',
                content: '# Follow team conventions',
              },
              reason: 'Enabled by active profile "Global: team.md"',
            },
          ],
          injectionMode: 'text-fallback',
          notes: [],
          conflicts: [],
        })),
      } as never,
      vi.fn()
    );

    (service as never as { resolveSelection: () => Promise<unknown> }).resolveSelection = vi.fn(async () => ({
      target: { kind: 'agent', agentType: 'copilot' },
      behavior: 'send',
    }));

    await service.runPrompt({
      id: 'prompt-1',
      name: 'Review Prompt',
      description: '',
      category: 'test',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
    });

    const sendToAgent = (service as never as { agentService: { sendToAgent: ReturnType<typeof vi.fn> } }).agentService.sendToAgent;
    expect(sendToAgent).toHaveBeenCalledTimes(1);
    const [payload, agentType] = sendToAgent.mock.calls[0];
    expect(agentType).toBe('copilot');
    expect(payload).toContain('Task:\nReview this change');
    expect(payload).toContain('Rules:\n- team.md: Enabled by active profile "Global: team.md"');
    expect(payload).toContain('Context:\n- project: prompt-by-prompt');
    expect(payload).not.toContain('[Dispatch Target]');
  });

  it('builds task-oriented payloads and preview wrappers for task agents', async () => {
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      { globalState: { get: vi.fn(() => ({})), update: vi.fn(async () => undefined) } } as never,
      {} as never,
      {} as never,
      {} as never,
      vi.fn()
    );

    const editorContext = {
      selection: 'line',
      filepath: 'src/example.ts',
      file_content: 'line',
      lang: 'typescript',
      project_name: 'prompt-by-prompt',
      line_number: 1,
      column_number: 1,
    };
    const resolvedRules = {
      profile: { id: 'profile', name: 'Workspace Only', enabledRuleIds: [], priority: 0, isActive: true },
      workspaceRules: [],
      globalRules: [],
      activeRules: [],
      activeEntries: [
        {
          rule: {
            id: 'w1',
            name: 'AGENTS.md',
            path: '/tmp/AGENTS.md',
            scope: 'workspace',
            format: 'markdown',
            content: 'Be precise',
          },
          reason: 'Workspace rule discovered in the current project | Included for target cline | Applies to all agents',
        },
      ],
      injectionMode: 'text-fallback',
      notes: ['Active profile: Workspace Only'],
      conflicts: [{ type: 'duplicate-name', message: 'Duplicate rule', ruleIds: ['w1', 'w2'] }],
    };

    const dispatchText = (service as never as {
      buildDispatchText: (
        renderedPrompt: string,
        resolvedRules: typeof resolvedRules,
        editorContext: typeof editorContext,
        target: { kind: 'agent'; agentType: 'cline' }
      ) => string;
    }).buildDispatchText('Implement feature', resolvedRules, editorContext, { kind: 'agent', agentType: 'cline' });

    expect(dispatchText).toContain('[Dispatch Strategy]\nTask-oriented bundle for cline');
    expect(dispatchText).toContain('[Rules]');
    expect(dispatchText).toContain('Why active: Workspace rule discovered in the current project');
    expect(dispatchText).toContain('[Conflicts]\n- Duplicate rule');

    const previewText = (service as never as {
      buildPreviewText: (execution: {
        target: { kind: 'agent'; agentType: 'cline' };
        behavior: 'send';
        resolvedRules: typeof resolvedRules;
        dispatchText: string;
      }) => string;
    }).buildPreviewText({
      target: { kind: 'agent', agentType: 'cline' },
      behavior: 'send',
      resolvedRules,
      dispatchText,
    });

    expect(previewText).toContain('[Dispatch Target]');
    expect(previewText).toContain('- target: cline');
    expect(previewText).toContain('[Actual Payload]');
    expect(previewText).toContain('Task-oriented bundle for cline');
  });
});
