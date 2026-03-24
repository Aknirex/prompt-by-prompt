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
    env: {
      language: 'en',
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
  it('persists per-prompt execution history after a successful run in last-execution mode', async () => {
    configValues.executionSelectionMode = 'last-execution';
    configValues.rememberLastExecution = true;

    const update = vi.fn(async () => undefined);
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn(() => ({})),
          update,
        },
      } as never,
      {
        extractContext: vi.fn(async () => ({
          selection: '',
          filepath: 'src/file.ts',
          file_content: '',
          lang: 'typescript',
          project_name: 'prompt-by-prompt',
          line_number: 1,
          column_number: 1,
        })),
        getMissingVariables: vi.fn(() => []),
        renderTemplate: vi.fn(async () => 'Run this task'),
      } as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'Clipboard',
          capabilities: {
            canCreateTask: false,
            canFillInput: false,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: false,
            canUseStructuredContext: false,
          },
        })),
        sendToAgent: vi.fn(async () => ({ success: true })),
      } as never,
      {
        resolveRuleSet: vi.fn(() => ({
          profile: { id: 'profile', name: 'Workspace Only', enabledRuleIds: [], priority: 0, isActive: true },
          workspaceRules: [],
          globalRules: [],
          teamRules: [],
          activeRules: [],
          activeEntries: [],
          inactiveEntries: [],
          injectionMode: 'text-fallback',
          notes: [],
          conflicts: [],
          binding: {
            source: 'workspace',
            packId: 'acme-engineering',
            packVersion: '1.4.2',
            profileId: 'frontend-standard',
            allowPersonalOverrides: true,
            pinned: true,
            reasons: ['Workspace policy binding declared in .pbp/policy.json'],
          },
          policyVersion: {
            packId: 'acme-engineering',
            declaredVersion: '1.4.2',
            resolvedVersion: 'commit-sha',
          },
        })),
      } as never,
      vi.fn()
    );

    (service as never as { resolveSelection: () => Promise<unknown> }).resolveSelection = vi.fn(async () => ({
      target: { kind: 'clipboard' },
      behavior: undefined,
    }));

    await service.runPrompt({
      id: 'prompt-history',
      name: 'History Prompt',
      description: '',
      category: 'test',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      'pbp.executionHistory',
      expect.objectContaining({
        'prompt-history': expect.objectContaining({
          promptId: 'prompt-history',
          target: { kind: 'clipboard' },
          behavior: undefined,
          executedAt: expect.any(String),
        }),
      })
    );
  });

  it('reuses an available per-prompt execution history record before opening pickers', async () => {
    configValues.executionSelectionMode = 'last-execution';
    configValues.rememberLastExecution = true;

    const { window } = await import('vscode');
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn((key: string) => key === 'pbp.executionHistory'
            ? {
                'prompt-1': {
                  promptId: 'prompt-1',
                  target: { kind: 'agent', agentType: 'copilot' },
                  behavior: 'send',
                  executedAt: '2026-03-20T00:00:00.000Z',
                },
              }
            : {}),
          update: vi.fn(async () => undefined),
        },
      } as never,
      {} as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'GitHub Copilot',
          isAvailable: vi.fn(async () => true),
          capabilities: {
            canCreateTask: true,
            canFillInput: true,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: true,
            canUseStructuredContext: false,
          },
        })),
      } as never,
      {} as never,
      vi.fn()
    );

    const selection = await (service as never as {
      resolveSelection: (promptId: string, forcePicker: boolean) => Promise<unknown>;
    }).resolveSelection('prompt-1', false);

    expect(selection).toEqual({
      target: { kind: 'agent', agentType: 'copilot' },
      behavior: 'send',
    });
    expect(window.showQuickPick).not.toHaveBeenCalled();
  });

  it('falls back to picker when saved execution history is no longer available', async () => {
    configValues.executionSelectionMode = 'last-execution';
    configValues.rememberLastExecution = true;

    const { window } = await import('vscode');
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn((key: string) => key === 'pbp.executionHistory'
            ? {
                'prompt-1': {
                  promptId: 'prompt-1',
                  target: { kind: 'agent', agentType: 'copilot' },
                  behavior: 'append',
                  executedAt: '2026-03-20T00:00:00.000Z',
                },
              }
            : {}),
          update: vi.fn(async () => undefined),
        },
      } as never,
      {} as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'GitHub Copilot',
          isAvailable: vi.fn(async () => true),
          capabilities: {
            canCreateTask: true,
            canFillInput: true,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: true,
            canUseStructuredContext: false,
          },
        })),
        getAvailableAgents: vi.fn(async () => []),
      } as never,
      {} as never,
      vi.fn()
    );

    vi.mocked(window.showQuickPick).mockResolvedValueOnce({
      label: 'Copy to clipboard',
      description: 'Clipboard target',
      target: { kind: 'clipboard' },
      sortOrder: 0,
    } as never);

    const selection = await (service as never as {
      resolveSelection: (promptId: string, forcePicker: boolean) => Promise<unknown>;
    }).resolveSelection('prompt-1', false);

    expect(selection).toEqual({
      target: { kind: 'clipboard' },
    });
    expect(window.showQuickPick).toHaveBeenCalledTimes(1);
  });

  it('does not persist execution history when dispatch fails', async () => {
    configValues.executionSelectionMode = 'last-execution';
    configValues.rememberLastExecution = true;

    const update = vi.fn(async () => undefined);
    const { window } = await import('vscode');
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn(() => ({})),
          update,
        },
      } as never,
      {
        extractContext: vi.fn(async () => ({
          selection: '',
          filepath: 'src/file.ts',
          file_content: '',
          lang: 'typescript',
          project_name: 'prompt-by-prompt',
          line_number: 1,
          column_number: 1,
        })),
        getMissingVariables: vi.fn(() => []),
        renderTemplate: vi.fn(async () => 'Run this task'),
      } as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'Clipboard',
          capabilities: {
            canCreateTask: false,
            canFillInput: false,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: false,
            canUseStructuredContext: false,
          },
        })),
        sendToAgent: vi.fn(async () => ({ success: false, message: 'dispatch failed' })),
      } as never,
      {
        resolveRuleSet: vi.fn(() => ({
          profile: { id: 'profile', name: 'Workspace Only', enabledRuleIds: [], priority: 0, isActive: true },
          workspaceRules: [],
          globalRules: [],
          teamRules: [],
          activeRules: [],
          activeEntries: [],
          inactiveEntries: [],
          injectionMode: 'text-fallback',
          notes: [],
          conflicts: [],
          binding: {
            source: 'workspace',
            packId: 'acme-engineering',
            packVersion: '1.4.2',
            profileId: 'frontend-standard',
            allowPersonalOverrides: true,
            pinned: true,
            reasons: ['Workspace policy binding declared in .pbp/policy.json'],
          },
          policyVersion: {
            packId: 'acme-engineering',
            declaredVersion: '1.4.2',
            resolvedVersion: 'commit-sha',
          },
        })),
      } as never,
      vi.fn()
    );

    (service as never as { resolveSelection: () => Promise<unknown> }).resolveSelection = vi.fn(async () => ({
      target: { kind: 'clipboard' },
      behavior: undefined,
    }));

    await service.runPrompt({
      id: 'prompt-history',
      name: 'History Prompt',
      description: '',
      category: 'test',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
    });

    expect(update).not.toHaveBeenCalled();
    expect(window.showErrorMessage).toHaveBeenCalledWith('Failed to send prompt: dispatch failed');
  });

  it('builds preview executions without dispatching or persisting history', async () => {
    configValues.executionSelectionMode = 'last-execution';
    configValues.rememberLastExecution = true;

    const update = vi.fn(async () => undefined);
    const sendToAgent = vi.fn(async () => ({ success: true }));
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn(() => ({})),
          update,
        },
      } as never,
      {
        extractContext: vi.fn(async () => ({
          selection: 'const value = 1;',
          filepath: 'src/file.ts',
          file_content: 'const value = 1;',
          lang: 'typescript',
          project_name: 'prompt-by-prompt',
          line_number: 2,
          column_number: 3,
        })),
        getMissingVariables: vi.fn(() => []),
        renderTemplate: vi.fn(async () => 'Review this code'),
      } as never,
      {
        getAdapter: vi.fn(() => ({
          name: 'Clipboard',
          capabilities: {
            canCreateTask: false,
            canFillInput: false,
            canAppendInput: false,
            canInsertInput: false,
            canAutoSubmit: false,
            canUseStructuredContext: false,
          },
        })),
        sendToAgent,
      } as never,
      {
        resolveRuleSet: vi.fn(() => ({
          profile: { id: 'profile', name: 'Workspace Only', enabledRuleIds: [], priority: 0, isActive: true },
          workspaceRules: [],
          globalRules: [],
          teamRules: [],
          activeRules: [],
          activeEntries: [],
          inactiveEntries: [],
          injectionMode: 'text-fallback',
          notes: [],
          conflicts: [],
          binding: {
            source: 'workspace',
            packId: 'acme-engineering',
            packVersion: '1.4.2',
            profileId: 'frontend-standard',
            allowPersonalOverrides: true,
            pinned: true,
            reasons: ['Workspace policy binding declared in .pbp/policy.json'],
          },
          policyVersion: {
            packId: 'acme-engineering',
            declaredVersion: '1.4.2',
            resolvedVersion: 'commit-sha',
          },
        })),
      } as never,
      vi.fn()
    );

    const preview = await service.previewPrompt({
      id: 'prompt-preview',
      name: 'Preview Prompt',
      description: '',
      category: 'test',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
    }, {
      explicitPreset: {
        target: { kind: 'clipboard' },
      },
    });

    expect(preview?.target).toEqual({ kind: 'clipboard' });
    expect(preview?.previewText).toContain('[Dispatch Target]');
    expect(preview?.previewText).toContain('[Effective Policy]');
    expect(preview?.previewText).toContain('- pack: acme-engineering');
    expect(preview?.previewText).toContain('[Actual Payload]');
    expect(sendToAgent).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('stores an explicitly selected execution preset for a prompt', async () => {
    const update = vi.fn(async () => undefined);
    const { window } = await import('vscode');
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      {
        globalState: {
          get: vi.fn(() => ({})),
          update,
        },
      } as never,
      {} as never,
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
        getAvailableAgents: vi.fn(async () => ['copilot']),
      } as never,
      {} as never,
      vi.fn()
    );

    vi.mocked(window.showQuickPick)
      .mockResolvedValueOnce({
        label: 'GitHub Copilot',
        description: 'send + overwrite',
        target: { kind: 'agent', agentType: 'copilot' },
        sortOrder: 2,
      } as never)
      .mockResolvedValueOnce({
        label: 'send',
        description: 'Send immediately to GitHub Copilot',
        behavior: 'send',
      } as never);

    const preset = await service.selectExecutionTarget({
      id: 'prompt-preset',
      name: 'Preset Prompt',
      description: '',
      category: 'test',
      tags: [],
      version: '1.0.0',
      template: 'ignored',
    });

    expect(preset).toEqual({
      target: { kind: 'agent', agentType: 'copilot' },
      behavior: 'send',
    });
    expect(update).toHaveBeenCalledWith(
      'pbp.executionHistory',
      expect.objectContaining({
        'prompt-preset': expect.objectContaining({
          promptId: 'prompt-preset',
          target: { kind: 'agent', agentType: 'copilot' },
          behavior: 'send',
          executedAt: expect.any(String),
        }),
      })
    );
  });

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

  it('builds generic preview wrappers for non-agent targets with rule notes and conflicts', async () => {
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      { globalState: { get: vi.fn(() => ({})), update: vi.fn(async () => undefined) } } as never,
      {} as never,
      {} as never,
      {} as never,
      vi.fn()
    );

    const editorContext = {
      selection: 'const answer = 42;',
      filepath: 'src/example.ts',
      file_content: 'const answer = 42;',
      lang: 'typescript',
      project_name: 'prompt-by-prompt',
      line_number: 10,
      column_number: 5,
    };
    const resolvedRules = {
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
            content: '# Follow the playbook',
          },
          reason: 'Enabled by active profile "Global: team.md"',
        },
      ],
      injectionMode: 'text-fallback',
      notes: ['Resolved for target: clipboard'],
      conflicts: [{ type: 'duplicate-name', message: 'Duplicate rule name detected', ruleIds: ['g1', 'g2'] }],
    };

    const dispatchText = (service as never as {
      buildDispatchText: (
        renderedPrompt: string,
        resolvedRules: typeof resolvedRules,
        editorContext: typeof editorContext,
        target: { kind: 'clipboard' }
      ) => string;
    }).buildDispatchText('Summarize the selected code', resolvedRules, editorContext, { kind: 'clipboard' });

    expect(dispatchText).toContain('[Dispatch Strategy]\nStandard preview bundle');
    expect(dispatchText).toContain('[Task Prompt]\nSummarize the selected code');
    expect(dispatchText).toContain('[Active Rules]');
    expect(dispatchText).toContain('Reason: Enabled by active profile "Global: team.md"');
    expect(dispatchText).toContain('[Rule Notes]\n- Resolved for target: clipboard');
    expect(dispatchText).toContain('[Rule Conflicts]\n- Duplicate rule name detected');

    const previewText = (service as never as {
      buildPreviewText: (execution: {
        target: { kind: 'clipboard' };
        behavior: undefined;
        resolvedRules: typeof resolvedRules;
        dispatchText: string;
      }) => string;
    }).buildPreviewText({
      target: { kind: 'clipboard' },
      behavior: undefined,
      resolvedRules,
      dispatchText,
    });

    expect(previewText).toContain('- target: clipboard');
    expect(previewText).toContain('- behavior: default');
    expect(previewText).toContain('[Actual Payload]');
    expect(previewText).toContain('Standard preview bundle');
  });

  it('builds chat-oriented dispatch text with summarized rules and truncated selection context', async () => {
    const { ExecutionService } = await import('../src/services/executionService');
    const service = new ExecutionService(
      { globalState: { get: vi.fn(() => ({})), update: vi.fn(async () => undefined) } } as never,
      {} as never,
      {} as never,
      {} as never,
      vi.fn()
    );

    const longSelection = 'x'.repeat(220);
    const editorContext = {
      selection: longSelection,
      filepath: 'src/example.ts',
      file_content: longSelection,
      lang: 'typescript',
      project_name: 'prompt-by-prompt',
      line_number: 8,
      column_number: 2,
    };
    const resolvedRules = {
      profile: { id: 'profile', name: 'Workspace Only', enabledRuleIds: ['w1'], priority: 0, isActive: true },
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
            content: 'Prefer small patches',
          },
          reason: 'Workspace rule discovered in the current project',
        },
      ],
      injectionMode: 'text-fallback',
      notes: [],
      conflicts: [],
    };

    const dispatchText = (service as never as {
      buildDispatchText: (
        renderedPrompt: string,
        resolvedRules: typeof resolvedRules,
        editorContext: typeof editorContext,
        target: { kind: 'agent'; agentType: 'continue' }
      ) => string;
    }).buildDispatchText('Explain this code', resolvedRules, editorContext, { kind: 'agent', agentType: 'continue' });

    expect(dispatchText).toContain('[Dispatch Strategy]\nChat bundle for continue');
    expect(dispatchText).toContain('[Active Rules]\n- AGENTS.md\n  Why active: Workspace rule discovered in the current project');
    expect(dispatchText).toContain(`- selection: ${'x'.repeat(200)}...`);
    expect(dispatchText).not.toContain(longSelection);
  });
});
