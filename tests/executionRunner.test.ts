import { describe, expect, it, vi } from 'vitest';
import { ExecutionRunner } from '../src/application/executionRunner';
import { ResolvedExecution } from '../src/types/execution';

describe('ExecutionRunner', () => {
  it('records history only after a successful dispatch', async () => {
    const plan = { prompt: { id: 'prompt-1' } } as ResolvedExecution;
    const dispatch = vi.fn(async () => ({ success: true as const }));
    const recordSuccessfulExecution = vi.fn(async () => undefined);
    const runner = new ExecutionRunner(
      { dispatch },
      { recordSuccessfulExecution }
    );

    await expect(runner.run(plan)).resolves.toEqual({ success: true });

    expect(dispatch).toHaveBeenCalledWith(plan);
    expect(recordSuccessfulExecution).toHaveBeenCalledWith(plan);
  });

  it('does not record history when dispatch fails', async () => {
    const plan = { prompt: { id: 'prompt-2' } } as ResolvedExecution;
    const failure = {
      success: false as const,
      reason: 'command_failed' as const,
      message: 'dispatch failed',
    };
    const dispatch = vi.fn(async () => failure);
    const recordSuccessfulExecution = vi.fn(async () => undefined);
    const runner = new ExecutionRunner(
      { dispatch },
      { recordSuccessfulExecution }
    );

    await expect(runner.run(plan)).resolves.toEqual(failure);

    expect(dispatch).toHaveBeenCalledWith(plan);
    expect(recordSuccessfulExecution).not.toHaveBeenCalled();
  });
});
