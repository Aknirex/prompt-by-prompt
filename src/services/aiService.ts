/**
 * AI Service - Handles AI API calls for prompt generation
 */

import * as vscode from 'vscode';

export interface GeneratePromptOptions {
  userDescription: string;
  systemPrompt: string;
}

export interface GeneratePromptResult {
  success: boolean;
  prompt?: string;
  error?: string;
}

/**
 * AI Service for generating prompts using various providers
 */
export class AIService {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  /**
   * Get the current configuration
   */
  private getConfig() {
    const config = vscode.workspace.getConfiguration('pbp');
    return {
      defaultModel: config.get<string>('defaultModel') || 'ollama',
      ollamaEndpoint: config.get<string>('ollamaEndpoint') || 'http://localhost:11434',
      ollamaModel: config.get<string>('ollamaModel') || 'llama3.2',
      openaiApiKey: config.get<string>('openaiApiKey') || '',
      openaiModel: config.get<string>('openaiModel') || 'gpt-4o-mini',
      claudeApiKey: config.get<string>('claudeApiKey') || '',
      claudeModel: config.get<string>('claudeModel') || 'claude-3-5-sonnet-20241022',
      groqApiKey: config.get<string>('groqApiKey') || '',
      groqModel: config.get<string>('groqModel') || 'llama-3.3-70b-versatile',
    };
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
   * Generate a prompt using the configured AI provider
   */
  async generatePrompt(options: GeneratePromptOptions): Promise<GeneratePromptResult> {
    const config = this.getConfig();
    const systemPrompt = options.systemPrompt || this.getSystemPrompt();

    try {
      switch (config.defaultModel) {
        case 'ollama':
          return await this.callOllama(config, systemPrompt, options.userDescription);
        case 'openai':
          return await this.callOpenAI(config, systemPrompt, options.userDescription);
        case 'claude':
          return await this.callClaude(config, systemPrompt, options.userDescription);
        case 'groq':
          return await this.callGroq(config, systemPrompt, options.userDescription);
        default:
          return { success: false, error: `Unknown model provider: ${config.defaultModel}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  /**
   * Call Ollama API
   */
  private async callOllama(config: ReturnType<typeof this.getConfig>, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    try {
      const response = await fetch(`${config.ollamaEndpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.ollamaModel,
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
  private async callOpenAI(config: ReturnType<typeof this.getConfig>, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    if (!config.openaiApiKey) {
      return { success: false, error: 'OpenAI API key not configured. Please set it in settings.' };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.openaiModel,
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
  private async callClaude(config: ReturnType<typeof this.getConfig>, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    if (!config.claudeApiKey) {
      return { success: false, error: 'Claude API key not configured. Please set it in settings.' };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.claudeApiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.claudeModel,
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
  private async callGroq(config: ReturnType<typeof this.getConfig>, systemPrompt: string, userDescription: string): Promise<GeneratePromptResult> {
    if (!config.groqApiKey) {
      return { success: false, error: 'Groq API key not configured. Please set it in settings.' };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey}`,
        },
        body: JSON.stringify({
          model: config.groqModel,
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
   * Check if any AI provider is configured
   */
  hasConfiguredProvider(): boolean {
    const config = this.getConfig();
    
    switch (config.defaultModel) {
      case 'ollama':
        return true; // Ollama is local, always "configured"
      case 'openai':
        return !!config.openaiApiKey;
      case 'claude':
        return !!config.claudeApiKey;
      case 'groq':
        return !!config.groqApiKey;
      default:
        return false;
    }
  }

  /**
   * Get the name of the current provider
   */
  getProviderName(): string {
    const config = this.getConfig();
    const names: Record<string, string> = {
      ollama: 'Ollama',
      openai: 'OpenAI',
      claude: 'Claude',
      groq: 'Groq',
    };
    return names[config.defaultModel] || config.defaultModel;
  }
}
