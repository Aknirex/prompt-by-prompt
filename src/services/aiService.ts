/**
 * AI Service - Handles AI API calls for prompt generation
 * Supports multiple providers with comprehensive coverage
 */

import * as vscode from 'vscode';
import * as yaml from 'js-yaml';
import { PromptVariable } from '../types/prompt';
import { AI_PROVIDERS } from './aiProviders';

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
  | 'xai'
  | 'custom';

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

export interface GeneratedPromptDraft {
  name: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables?: PromptVariable[];
}

export interface GeneratePromptResult {
  success: boolean;
  prompt?: string;
  draft?: GeneratedPromptDraft;
  error?: string;
}

/**
 * Default generator system prompt
 */
export const DEFAULT_GENERATOR_SYSTEM_PROMPT = `You are a prompt engineering assistant. Your task is to help users create effective prompts for AI assistants.

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

const STRUCTURED_DRAFT_FORMAT_INSTRUCTIONS = `
You must return ONLY valid YAML with this exact top-level structure:
name: short descriptive title
description: one sentence describing when to use the prompt
category: one short category such as Development, Code Analysis, Documentation, Testing, Data, or General
tags:
  - short-tag
template: |
  full prompt template text here
variables:
  - name: optional_variable_name
    description: what the user should provide
    type: string
    required: false
    placeholder: optional example

Rules:
- Return raw YAML only. Do not wrap it in markdown fences.
- Always include name, description, category, tags, and template.
- tags must be a YAML list, even if there is only one tag.
- variables is optional. Omit it if no extra variables are needed.
- template should be production-ready, not just an outline.
- Fill the metadata thoughtfully from the user request instead of leaving generic placeholders.
`;

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
    const systemPrompt = this.buildStructuredSystemPrompt(options.systemPrompt || this.getSystemPrompt());
    const userDescription = this.buildStructuredUserDescription(options.userDescription);

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
          return await this.callAnthropic(model, systemPrompt, userDescription);
        case 'azure':
          return await this.callAzure(model, systemPrompt, userDescription);
        case 'deepseek':
          return await this.callDeepSeek(model, systemPrompt, userDescription);
        case 'google':
          return await this.callGoogle(model, systemPrompt, userDescription);
        case 'groq':
          return await this.callGroq(model, systemPrompt, userDescription);
        case 'mistral':
          return await this.callMistral(model, systemPrompt, userDescription);
        case 'ollama':
          return await this.callOllama(model, systemPrompt, userDescription);
        case 'openai':
          return await this.callOpenAI(model, systemPrompt, userDescription);
        case 'openrouter':
          return await this.callOpenRouter(model, systemPrompt, userDescription);
        case 'xai':
          return await this.callXAI(model, systemPrompt, userDescription);
        default:
          return { success: false, error: `Unknown provider: ${provider}` };
      }
    } catch (error) {
      return { success: false, error: String(error) };
    }
  }

  private buildStructuredSystemPrompt(systemPrompt: string): string {
    return `${systemPrompt.trim()}\n\n${STRUCTURED_DRAFT_FORMAT_INSTRUCTIONS.trim()}`;
  }

  private buildStructuredUserDescription(userDescription: string): string {
    return `Create a complete prompt draft for this request:\n\n${userDescription.trim()}`;
  }

  private toStructuredResult(rawResponse: string | undefined, userDescription: string): GeneratePromptResult {
    const raw = rawResponse?.trim();
    if (!raw) {
      return { success: false, error: 'Empty generator response.' };
    }

    const draft = this.parseGeneratedDraft(raw, userDescription);
    return {
      success: true,
      prompt: draft.template,
      draft,
    };
  }

  private parseGeneratedDraft(rawResponse: string, userDescription: string): GeneratedPromptDraft {
    const cleaned = rawResponse
      .replace(/^```ya?ml\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    const parsed = yaml.load(cleaned);
    if (!parsed || typeof parsed !== 'object') {
      return this.buildFallbackDraft(rawResponse, userDescription);
    }

    const record = parsed as Record<string, unknown>;
    const template = typeof record.template === 'string' ? record.template.trim() : '';
    if (!template) {
      return this.buildFallbackDraft(rawResponse, userDescription);
    }

    const tags = Array.isArray(record.tags)
      ? record.tags.map((tag) => String(tag).trim()).filter(Boolean)
      : [];

    const variables = this.normalizeDraftVariables(record.variables);

    return {
      name: typeof record.name === 'string' && record.name.trim() ? record.name.trim() : this.deriveDraftName(userDescription),
      description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : userDescription.trim(),
      category: typeof record.category === 'string' && record.category.trim() ? record.category.trim() : 'General',
      tags: tags.length > 0 ? tags : ['generated'],
      template,
      variables,
    };
  }

  private normalizeDraftVariables(value: unknown): PromptVariable[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }

    const variables = value.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') {
        return [];
      }

      const record = entry as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';
      if (!name) {
        return [];
      }

      const type = record.type;
      const normalizedType: PromptVariable['type'] =
        type === 'number' || type === 'boolean' || type === 'enum' ? type : 'string';
      const values = Array.isArray(record.values)
        ? record.values.map((item) => String(item).trim()).filter(Boolean)
        : undefined;

      return [{
        name,
        description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : name,
        type: normalizedType,
        required: Boolean(record.required),
        placeholder: typeof record.placeholder === 'string' && record.placeholder.trim() ? record.placeholder.trim() : undefined,
        multiline: Boolean(record.multiline),
        values: normalizedType === 'enum' && values && values.length > 0 ? values : undefined,
        default:
          typeof record.default === 'string' ||
          typeof record.default === 'number' ||
          typeof record.default === 'boolean'
            ? record.default
            : undefined,
      }];
    });

    return variables.length > 0 ? variables : undefined;
  }

  private buildFallbackDraft(rawResponse: string, userDescription: string): GeneratedPromptDraft {
    return {
      name: this.deriveDraftName(userDescription),
      description: userDescription.trim(),
      category: 'General',
      tags: ['generated'],
      template: rawResponse.trim(),
    };
  }

  private deriveDraftName(userDescription: string): string {
    const normalized = userDescription
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.?!]+$/, '');

    if (!normalized) {
      return 'Generated Prompt';
    }

    return normalized.length <= 60 ? normalized : `${normalized.slice(0, 57).trim()}...`;
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
      return this.toStructuredResult(data.content?.[0]?.text?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.candidates?.[0]?.content?.parts?.[0]?.text?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.response?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
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
      return this.toStructuredResult(data.choices?.[0]?.message?.content?.trim(), userDescription);
    } catch (error) {
      return { success: false, error: `xAI connection failed: ${error}` };
    }
  }
}
