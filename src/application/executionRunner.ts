import type { SendResult } from '../types/agent';
import type { ResolvedExecution } from '../types/execution';

export interface ExecutionDispatchPort {
  dispatch(plan: ResolvedExecution): Promise<SendResult>;
}

export interface ExecutionHistoryPort {
  recordSuccessfulExecution(plan: ResolvedExecution): Promise<void>;
}

export class ExecutionRunner {
  constructor(
    private readonly dispatchPort: ExecutionDispatchPort,
    private readonly historyPort: ExecutionHistoryPort
  ) {}

  async run(plan: ResolvedExecution): Promise<SendResult> {
    const result = await this.dispatchPort.dispatch(plan);
    if (!result.success) {
      return result;
    }

    await this.historyPort.recordSuccessfulExecution(plan);
    return result;
  }
}
