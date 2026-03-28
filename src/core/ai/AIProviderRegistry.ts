import { IAIProvider } from './IAIProvider';
import {
  AnthropicProvider, OpenAIProvider, DeepSeekProvider, GroqProvider,
  MistralProvider, OpenRouterProvider, XAIProvider, GoogleProvider,
  OllamaProvider, AzureProvider, CustomProvider,
} from './providers/providers';

export type AIProvider =
  | 'anthropic' | 'openai' | 'deepseek' | 'groq' | 'mistral'
  | 'openrouter' | 'xai' | 'google' | 'ollama' | 'azure' | 'custom';

export interface ProviderInfo {
  id: AIProvider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
}

export const AI_PROVIDERS: ProviderInfo[] = [
  { id: 'anthropic', name: 'Anthropic Claude', requiresApiKey: true, models: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] },
  { id: 'openai', name: 'OpenAI', requiresApiKey: true, models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { id: 'google', name: 'Google Gemini', requiresApiKey: true, models: ['gemini-2.0-flash', 'gemini-1.5-pro'] },
  { id: 'groq', name: 'Groq', requiresApiKey: true, models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768'] },
  { id: 'deepseek', name: 'DeepSeek', requiresApiKey: true, models: ['deepseek-chat', 'deepseek-reasoner'] },
  { id: 'mistral', name: 'Mistral', requiresApiKey: true, models: ['mistral-large-latest', 'mistral-small-latest'] },
  { id: 'ollama', name: 'Ollama (local)', requiresApiKey: false, models: ['llama3.2', 'qwen2.5-coder', 'codellama'] },
  { id: 'azure', name: 'Azure OpenAI', requiresApiKey: true, models: [] },
  { id: 'openrouter', name: 'OpenRouter', requiresApiKey: true, models: [] },
  { id: 'xai', name: 'xAI (Grok)', requiresApiKey: true, models: ['grok-3-mini', 'grok-2'] },
  { id: 'custom', name: 'Custom (OpenAI-compat)', requiresApiKey: false, models: [] },
];

export const PROVIDER_REGISTRY = new Map<AIProvider, IAIProvider>([
  ['anthropic', AnthropicProvider],
  ['openai', OpenAIProvider],
  ['deepseek', DeepSeekProvider],
  ['groq', GroqProvider],
  ['mistral', MistralProvider],
  ['openrouter', OpenRouterProvider],
  ['xai', XAIProvider],
  ['google', GoogleProvider],
  ['ollama', OllamaProvider],
  ['azure', AzureProvider],
  ['custom', CustomProvider],
]);
