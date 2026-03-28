import { AgentAdapter, AgentType, SendOptions, SendResult } from '../../types/agent';
import { ExecutionBehavior } from '../../types/execution';
import {
  ClipboardAdapter, FileAdapter, ClineAdapter, RooCodeAdapter,
  CopilotAdapter, ContinueAdapter, CursorAdapter, GeminiAdapter,
  TongyiAdapter, KiloCodeAdapter, CodexAdapter,
} from './adapters';
import { getSupportedExecutionBehaviors } from './agentCapabilities';

const CACHE_TTL = 30_000;

export class AgentRegistry {
  private readonly adapters: Map<AgentType, AgentAdapter>;
  private availabilityCache = new Map<AgentType, boolean>();
  private cacheExpiry = 0;

  constructor() {
    this.adapters = new Map([
      ['clipboard', new ClipboardAdapter()],
      ['file', new FileAdapter()],
      ['cline', new ClineAdapter()],
      ['roo-code', new RooCodeAdapter()],
      ['copilot', new CopilotAdapter()],
      ['continue', new ContinueAdapter()],
      ['cursor', new CursorAdapter()],
      ['gemini', new GeminiAdapter()],
      ['tongyi', new TongyiAdapter()],
      ['kilo-code', new KiloCodeAdapter()],
      ['codex', new CodexAdapter()],
    ]);
  }

  getAdapter(type: AgentType): AgentAdapter | undefined {
    return this.adapters.get(type);
  }

  getSupportedBehaviors(agentType: AgentType): ExecutionBehavior[] {
    const adapter = this.adapters.get(agentType);
    if (!adapter) return [];
    return getSupportedExecutionBehaviors(adapter.capabilities);
  }

  async isAvailable(agentType: AgentType): Promise<boolean> {
    const adapter = this.adapters.get(agentType);
    if (!adapter) return false;
    return adapter.isAvailable();
  }

  async getAvailableAgentTypes(): Promise<AgentType[]> {
    const now = Date.now();
    if (now < this.cacheExpiry) {
      return [...this.availabilityCache.entries()]
        .filter(([, v]) => v)
        .map(([k]) => k);
    }

    const results = await Promise.allSettled(
      [...this.adapters.entries()].map(async ([type, adapter]) => {
        const available = await adapter.isAvailable();
        return { type, available };
      })
    );

    this.availabilityCache.clear();
    for (const r of results) {
      if (r.status === 'fulfilled') {
        this.availabilityCache.set(r.value.type, r.value.available);
      }
    }
    this.cacheExpiry = now + CACHE_TTL;

    return [...this.availabilityCache.entries()]
      .filter(([, v]) => v)
      .map(([k]) => k);
  }

  async sendToAgent(prompt: string, agentType: AgentType, options?: SendOptions): Promise<SendResult> {
    const adapter = this.adapters.get(agentType);
    if (!adapter) {
      return { success: false, reason: 'unavailable', message: `Unknown agent: ${agentType}` };
    }
    if (!(await adapter.isAvailable())) {
      return { success: false, reason: 'unavailable', message: `Agent ${adapter.name} is not available` };
    }
    return adapter.sendPrompt(prompt, options);
  }

  invalidateCache(): void {
    this.cacheExpiry = 0;
    this.availabilityCache.clear();
  }

  getAllAdapters(): AgentAdapter[] {
    return [...this.adapters.values()];
  }
}
