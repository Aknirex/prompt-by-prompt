import { AIProvider } from '../../core/ai/AIProviderRegistry';
import { AgentType } from '../../types/agent';
import { ExecutionBehavior } from '../../types/execution';

export interface SettingsState {
  defaultAgent: AgentType;
  defaultBehavior: ExecutionBehavior;
  executionSelectionMode: 'last-execution' | 'initial-recommendation' | 'ask-every-time';
  defaultTarget: 'workspace' | 'global';
  generatorProvider: AIProvider;
  generatorModel: string;
  generatorSystemPrompt: string;
  ollamaEndpoint: string;
  customProviderUrl: string;
  uiLanguage: string;
  availableAgents: AgentType[];
}

export type HostToWebview =
  | { type: 'load'; state: SettingsState; providers: ProviderInfo[] }
  | { type: 'saved' }
  | { type: 'error'; message: string };

export type WebviewToHost =
  | { type: 'ready' }
  | { type: 'saveApiKey'; provider: AIProvider; key: string }
  | { type: 'saveSetting'; key: string; value: unknown }
  | { type: 'clearApiKey'; provider: AIProvider };

export interface ProviderInfo {
  id: AIProvider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
}
