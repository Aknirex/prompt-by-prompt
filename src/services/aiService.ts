/**
 * AI Service - Handles AI API calls for prompt generation
 * Supports multiple providers with comprehensive coverage
 */

import * as vscode from 'vscode';

export type AIProvider = 
  | 'anthropic'
  | 'azure'
  | 'deepseek'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'ollama'
  | 'openai'
  | 'openrouter'
  | 'xai';

export interface ProviderInfo {
  id: AIProvider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
  apiBaseUrl?: string;
}

export interface GeneratePromptOptions {
  userDescription: string;
  systemPrompt: string;
  provider?: AIProvider;
  model?: string;
}

export interface GeneratePromptResult {
  success: boolean;
  prompt?: string;
  error?: string;
}

/**
 * Available AI providers with their default models (sorted alphabetically)
 */
export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307', 'claude-3-5-haiku-20241022'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.anthropic.com/v1/messages'
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    models: ['gpt-4o', 'gpt-4-turbo', 'gpt-35-turbo'],
    requiresApiKey: true
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    models: ['deepseek-chat', 'deepseek-coder'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.deepseek.com/v1/chat/completions'
  },
  {
    id: 'google',
    name: 'Google AI',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-pro-exp'],
    requiresApiKey: true,
    apiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models'
  },
  {
    id: 'groq',
    name: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.groq.com/openai/v1/chat/completions'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    models: ['mistral-large-latest', 'mistral-medium', 'mistral-small-latest', 'codestral-latest', 'ministral-8b-latest'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.mistral.ai/v1/chat/completions'
  },
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    models: ['llama3.2', 'llama3.1', 'llama2', 'codellama', 'mistral', 'qwen2.5', 'deepseek-coder-v2', 'phi3'],
    requiresApiKey: false,
    apiBaseUrl: 'http://localhost:11434/api/generate'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'o1-preview', 'o1-mini'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.openai.com/v1/chat/completions'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: [
      'anthropic/claude-3.5-sonnet',
      'anthropic/claude-3-opus',
      'openai/gpt-4o',
      'openai/gpt-4-turbo',
      'google/gemini-2.0-flash-exp',
      'meta-llama/llama-3.3-70b-instruct',
      'deepseek/deepseek-chat',
      'mistralai/mistral-large',
      'x-ai/grok-beta'
    ],
    requiresApiKey: true,
    apiBaseUrl: 'https://openrouter.ai/api/v1/chat/completions'
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    models: ['grok-beta', 'grok-2-1212', 'grok-2-vision-1212'],
    requiresApiKey: true,
    apiBaseUrl: 'https://api.x.ai/v1/chat/completions'
  }
];

/**
 * AI Service for generating prompts using various providers
 */
export class AIService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get list of available providers (sorted alphabetically)
   */
  getAvailableProviders(): ProviderInfo[] {
    return AI_PROVIDERS;
  }

  /**
   * Get the default provider from settings
   */
  getDefaultProvider(): AIProvider {
    const config = vscode.workspace.getConfiguration('pbp');
    return (config.get<string>('defaultModel') || 'ollama') as AIProvider;
  }

  /**
   * Get the default model for a provider
   */
  getDefaultModel(provider?: AIProvider): string {
    const config = vscode.workspace.getConfiguration('pbp');
    const p = provider || this.getDefaultProvider();
    
    const modelMap: Record<string, string> = {
      anthropic: config.get<string>('claudeModel') || 'claude-3-5-sonnet-20241022',
      azure: config.get<string>('azureModel') || 'gpt-4o',
      deepseek: config.get<string>('deepseekModel') || 'deepseek-chat',
      google: config.get<string>('geminiModel') || 'gemini-2.0-flash',
      groq: config.get<string>('groqModel') || 'llama-3.3-70b-versatile',
      mistral: config.get<string>('mistralModel') || 'mistral-large-latest',
      ollama: config.get<string>('ollamaModel') || 'llama3.2',
      openai: config.get<string>('openaiModel') || 'gpt-4o-mini',
      openrouter: config.get<string>('openrouterModel') || 'anthropic/claude-3.5-sonnet',
      xai: config.get<string>('xaiModel') || 'grok-beta'
    };
    
    return modelMap[p] || '';
  }

  /**
   * Get the generator system prompt
   */
  private getSystemPrompt(): string {
    return this.context.globalState.get<string>('pbp.generatorSystemPrompt') || 
      `You are a prompt engineering assistant. Your task is to help users create effective prompts for AI assistants.

When generating prompts:
1. Be clear and specific about the task
2. Include relevant context variables like {{selection}}, {{filepath}}, {{lang}}
3. Structure the prompt logically with clear sections
4. Consider the target AI's capabilities and limitations

Available context variables:
- {{selection}}: Currently selected text in the editor
- {{filepath}}: Path of the current file
- {{file_content}}: Full content of the current file
- {{lang}}: Programming language of the current file
- {{project_name}}: Name of the current project
- {{line_number}}: Current line number
- {{column_number}}: Current column number

Respond with ONLY the generated prompt, no explanations or markdown formatting.`;
  }

  /**
   * Get API key for a provider
   */
  private getApiKey(provider: AIProvider): string {
    const config = vscode.workspace.getConfiguration('pbp');
    const keyMap: Record<string, string> = {
      anthropic: config.get<string>('claudeApiKey') || '',
      azure: config.get<string>('azureApiKey') || '',
      deepseek: config.get<string>('deepseekApiKey') || '',
      google: config.get<string>('geminiApiKey') || '',
      groq: config.get<string>('groqApiKey') || '',
      mistral: config.get<string>('mistralApiKey') || '',
      openai: config.get<string>('openaiApiKey') || '',
      openrouter: config.get<string>('openrouterApiKey') || '',
      xai: config.get<string>('xaiApiKey') || ''
    };
    return keyMap[provider] || '';
  }

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider: AIProvider): boolean {
    if (provider === 'ollama') {
      return true; // Ollama is local, always "configured"
    }
    return !!this.getApiKey(provider);
  }

  /**
   * Generate a prompt using the specified AI provider
   */
  async generatePrompt(options: GeneratePromptOptions): Promise<GeneratePromptResult> {
    const provider = options.provider || this.getDefaultProvider();
    const model = options.model || this.getDefaultModel(provider);
    const systemPrompt = options.systemPrompt || this.getSystemPrompt();

    // Check if provider is configured
    if (!this.isProviderConfigured(provider)) {
      const providerInfo = AI_PROVIDERS.find(p => p.id === provider);
      return { 
        success: false, 
        error: `${providerInfo?.name || provider} API key not configured. Please set it in Settings.` 
      };
    }

    try {
      switch (provider) {
        case 'anthropic':
          return await this.callAnthropic(model, systemPrompt, options.userDescription);
        case 'azure':
          return await this.callAzure(model, systemPrompt, options.userDescription);
        case 'deepseek':
          return await this.callDeepSeek(model, systemPrompt, options.userDescription);
        case 'google':
          return await this.callGoogle(model, systemPrompt, options.userDescription);
        case 'groq':
          return await this.callGroq(model, systemPrompt, options.userDescription);
        case 'mistral':
          return await this.callMistral(model, systemPrompt, options.userDescription);
        case 'ollama':
          return await this.callOllama(model, systemPrompt, options.userDescription);
        case 'openai':
          return await this.callOpenAI(model, systemPrompt, options.userDescription);
        case 'openrouter':
          return await this.callOpenRouter(model, systemPrompt, options.userDescription);
        case 'xai':
          return await this.callXAI(model, systemPrompt, options.userDescription);
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Call Anthropic Claude API
   */
  private async callAnthropic(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('anthropic');
    
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 2000,
          system: systemPrompt,
          messages: [{ role: 'user', content: userDescription }],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Anthropic API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      return { success: true, prompt: data.content?.[0]?.text?.trim() };
    } catch (error) {
      return { success: false, error: `Anthropic connection failed: ${error}` };
    }
  }

  /**
   * Call Azure OpenAI API
   */
  private async callAzure(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const config = vscode.workspace.getConfiguration('pbp');
    const apiKey = this.getApiKey('azure');
    const endpoint = config.get<string>('azureEndpoint') || '';
    
    if (!endpoint) {
      return { success: false, error: 'Azure OpenAI endpoint not configured.' };
    }
    
    try {
      const response = await fetch(`${endpoint}/openai/deployments/${model}/chat/completions?api-version=2024-02-15-preview`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `Azure OpenAI API error: ${response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `Azure OpenAI connection failed: ${error}` };
    }
  }

  /**
   * Call DeepSeek API
   */
  private async callDeepSeek(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('deepseek');
    
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `DeepSeek API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `DeepSeek connection failed: ${error}` };
    }
  }

  /**
   * Call Google Gemini API
   */
  private async callGoogle(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('google');
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: systemPrompt + '\n\n' + userDescription }] }],
          generationConfig: { maxOutputTokens: 2000 }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Google AI API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return { success: true, prompt: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() };
    } catch (error) {
      return { success: false, error: `Google AI connection failed: ${error}` };
    }
  }

  /**
   * Call Groq API
   */
  private async callGroq(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('groq');
    
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Groq API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `Groq connection failed: ${error}` };
    }
  }

  /**
   * Call Mistral API
   */
  private async callMistral(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('mistral');
    
    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Mistral API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `Mistral connection failed: ${error}` };
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllama(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const config = vscode.workspace.getConfiguration('pbp');
    const endpoint = config.get<string>('ollamaEndpoint') || 'http://localhost:11434';
    
    try {
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model,
          prompt: userDescription,
          system: systemPrompt,
          stream: false,
        }),
      });

      if (!response.ok) {
        return { success: false, error: `Ollama API error: ${response.status}` };
      }

      const data = await response.json() as { response?: string };
      return { success: true, prompt: data.response?.trim() };
    } catch (error) {
      return { success: false, error: `Ollama connection failed: ${error}` };
    }
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('openai');
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `OpenAI API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `OpenAI connection failed: ${error}` };
    }
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('openrouter');
    
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://vscode-prompt-by-prompt',
          'X-Title': 'Prompt by Prompt'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `OpenRouter API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `OpenRouter connection failed: ${error}` };
    }
  }

  /**
   * Call xAI (Grok) API
   */
  private async callXAI(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('xai');
    
    try {
      const response = await fetch('https://api.x.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userDescription },
          ],
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `xAI API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return { success: true, prompt: data.choices?.[0]?.message?.content?.trim() };
    } catch (error) {
      return { success: false, error: `xAI connection failed: ${error}` };
    }
  }
}
