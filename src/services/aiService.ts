/**
 * AI Service - Handles AI API calls for prompt generation
 * Supports multiple providers: Ollama, OpenAI, Claude, Groq, Gemini, OpenRouter
 */

import * as vscode from 'vscode';

export type AIProvider = 'ollama' | 'openai' | 'claude' | 'groq' | 'gemini' | 'openrouter';

export interface ProviderInfo {
  id: AIProvider;
  name: string;
  models: string[];
  requiresApiKey: boolean;
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
 * Available AI providers with their default models
 */
export const AI_PROVIDERS: ProviderInfo[] = [
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    models: ['llama3.2', 'llama3.1', 'llama2', 'codellama', 'mistral', 'qwen2.5'],
    requiresApiKey: false
  },
  {
    id: 'openai',
    name: 'OpenAI',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresApiKey: true
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
    requiresApiKey: true
  },
  {
    id: 'groq',
    name: 'Groq',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'mixtral-8x7b-32768'],
    requiresApiKey: true
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
    requiresApiKey: true
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    models: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'google/gemini-2.0-flash-exp', 'meta-llama/llama-3.3-70b-instruct'],
    requiresApiKey: true
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
   * Get list of available providers
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
      ollama: config.get<string>('ollamaModel') || 'llama3.2',
      openai: config.get<string>('openaiModel') || 'gpt-4o-mini',
      claude: config.get<string>('claudeModel') || 'claude-3-5-sonnet-20241022',
      groq: config.get<string>('groqModel') || 'llama-3.3-70b-versatile',
      gemini: config.get<string>('geminiModel') || 'gemini-2.0-flash',
      openrouter: config.get<string>('openrouterModel') || 'anthropic/claude-3.5-sonnet'
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
      openai: config.get<string>('openaiApiKey') || '',
      claude: config.get<string>('claudeApiKey') || '',
      groq: config.get<string>('groqApiKey') || '',
      gemini: config.get<string>('geminiApiKey') || '',
      openrouter: config.get<string>('openrouterApiKey') || ''
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
        case 'ollama':
          return await this.callOllama(model, systemPrompt, options.userDescription);
        case 'openai':
          return await this.callOpenAI(model, systemPrompt, options.userDescription);
        case 'claude':
          return await this.callClaude(model, systemPrompt, options.userDescription);
        case 'groq':
          return await this.callGroq(model, systemPrompt, options.userDescription);
        case 'gemini':
          return await this.callGemini(model, systemPrompt, options.userDescription);
        case 'openrouter':
          return await this.callOpenRouter(model, systemPrompt, options.userDescription);
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
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
   * Call Claude API
   */
  private async callClaude(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('claude');
    
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
          messages: [
            { role: 'user', content: userDescription },
          ],
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Claude API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      return { success: true, prompt: data.content?.[0]?.text?.trim() };
    } catch (error) {
      return { success: false, error: `Claude connection failed: ${error}` };
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
   * Call Google Gemini API
   */
  private async callGemini(model: string, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    const apiKey = this.getApiKey('gemini');
    
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + '\n\n' + userDescription }
              ]
            }
          ],
          generationConfig: {
            maxOutputTokens: 2000,
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        return { success: false, error: `Gemini API error: ${errorData.error?.message || response.status}` };
      }

      const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
      return { success: true, prompt: data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() };
    } catch (error) {
      return { success: false, error: `Gemini connection failed: ${error}` };
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
}
