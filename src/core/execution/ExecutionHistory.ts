import { ExecutionHistoryMap, ExecutionHistoryRecord, ExecutionPreset } from '../../types/execution';

export interface HistoryStore {
  getGlobal<T>(key: string): T | undefined;
  setGlobal<T>(key: string, value: T): Promise<void>;
}

export class ExecutionHistory {
  constructor(
    private readonly store: HistoryStore,
    private readonly key: string
  ) {}

  getRecord(promptId: string): ExecutionHistoryRecord | undefined {
    const map = this.store.getGlobal<ExecutionHistoryMap>(this.key) ?? {};
    return map[promptId];
  }

  async saveRecord(promptId: string, preset: ExecutionPreset): Promise<void> {
    const map = this.store.getGlobal<ExecutionHistoryMap>(this.key) ?? {};
    map[promptId] = {
      ...preset,
      promptId,
      executedAt: new Date().toISOString(),
    };
    await this.store.setGlobal(this.key, map);
  }
}
