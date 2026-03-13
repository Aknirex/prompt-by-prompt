/**
 * LLM Adapter Service
 * Handles communication with various LLM providers
 */

import * as vscode from 'vscode';
import { LLMProvider, LLMConfig, LLMResponse, ResponseMetadata } from '../types/prompt';

export interface StreamCallback {
  (chunk: string): void;
}

export interface LLMAdapter {
  generate(prompt: string, config: LLMConfig, onStream?: StreamCallback): Promise<LLMResponse>;
  validateConfig(config: LLMConfig): boolean;
  getModels(): Promise<string[]>;
}

/**
 * Ollama Adapter - Local LLM support
 */
export class OllamaAdapter implements LLMAdapter {
  async generate(prompt: string, config: LLMConfig, onStream?: StreamCallback): Promise<LLMResponse> {
    const startTime = Date.now();
    const endpoint = config.endpoint || 'http://localhost:11434';
    
    try {
      const response = await fetch(`${endpoint}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          prompt: prompt,
          stream: !!onStream,
          options: {
            temperature: config.temperature,
            num_predict: config.maxTokens
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      let fullResponse = '';

      if (onStream && response.body) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.trim());

          for (const line of lines) {
            try {
              const json = JSON.parse(line);
              if (json.response) {
                fullResponse += json.response;
                onStream(json.response);
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json() as { response?: string };
        fullResponse = data.response || '';
      }

      const endTime = Date.now();

      return {
        status: 'success',
        rawResponse: fullResponse,
        metadata: {
          latencyMs: endTime - startTime,
          modelName: config.model,
          provider: 'ollama'
        }
      };
    } catch (error) {
      return {
        status: 'error',
        rawResponse: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          latencyMs: Date.now() - startTime,
          modelName: config.model,
          provider: 'ollama'
        }
      };
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return !!config.model && !!config.endpoint;
  }

  async getModels(): Promise<string[]> {
    try {
      const endpoint = 'http://localhost:11434';
      const response = await fetch(`${endpoint}/api/tags`);
      
      if (!response.ok) {
        return [];
      }

      const data = await response.json() as { models?: Array<{ name: string }> };
      return data.models?.map(m => m.name) || [];
    } catch {
      return [];
    }
  }
}

/**
 * OpenAI Adapter
 */
export class OpenAIAdapter implements LLMAdapter {
  async generate(prompt: string, config: LLMConfig, onStream?: StreamCallback): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!config.apiKey) {
      return {
        status: 'error',
        rawResponse: '',
        error: 'OpenAI API key not configured',
        metadata: {
          latencyMs: 0,
          modelName: config.model,
          provider: 'openai'
        }
      };
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          stream: !!onStream,
          temperature: config.temperature,
          max_tokens: config.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
      }

      let fullResponse = '';

      if (onStream && response.body) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data) as { 
                choices?: Array<{ 
                  delta?: { content?: string } 
                }> 
              };
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onStream(content);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json() as { 
          choices?: Array<{ 
            message?: { content?: string } 
          }>,
          usage?: {
            prompt_tokens: number;
            completion_tokens: number;
            total_tokens: number;
          }
        };
        fullResponse = data.choices?.[0]?.message?.content || '';
      }

      const endTime = Date.now();

      return {
        status: 'success',
        rawResponse: fullResponse,
        metadata: {
          latencyMs: endTime - startTime,
          modelName: config.model,
          provider: 'openai'
        }
      };
    } catch (error) {
      return {
        status: 'error',
        rawResponse: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          latencyMs: Date.now() - startTime,
          modelName: config.model,
          provider: 'openai'
        }
      };
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return !!config.apiKey && !!config.model;
  }

  async getModels(): Promise<string[]> {
    return [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4-turbo',
      'gpt-4',
      'gpt-3.5-turbo'
    ];
  }
}

/**
 * Claude (Anthropic) Adapter
 */
export class ClaudeAdapter implements LLMAdapter {
  async generate(prompt: string, config: LLMConfig, onStream?: StreamCallback): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!config.apiKey) {
      return {
        status: 'error',
        rawResponse: '',
        error: 'Claude API key not configured',
        metadata: {
          latencyMs: 0,
          modelName: config.model,
          provider: 'claude'
        }
      };
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: config.maxTokens || 4096,
          messages: [{ role: 'user', content: prompt }],
          stream: !!onStream
        })
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `Claude API error: ${response.status}`);
      }

      let fullResponse = '';

      if (onStream && response.body) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            const data = line.replace('data: ', '').trim();
            
            try {
              const json = JSON.parse(data) as {
                type?: string;
                delta?: { text?: string };
              };
              
              if (json.type === 'content_block_delta' && json.delta?.text) {
                fullResponse += json.delta.text;
                onStream(json.delta.text);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json() as {
          content?: Array<{ text?: string }>;
          usage?: {
            input_tokens: number;
            output_tokens: number;
          }
        };
        fullResponse = data.content?.map(c => c.text).join('') || '';
      }

      const endTime = Date.now();

      return {
        status: 'success',
        rawResponse: fullResponse,
        metadata: {
          latencyMs: endTime - startTime,
          modelName: config.model,
          provider: 'claude'
        }
      };
    } catch (error) {
      return {
        status: 'error',
        rawResponse: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          latencyMs: Date.now() - startTime,
          modelName: config.model,
          provider: 'claude'
        }
      };
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return !!config.apiKey && !!config.model;
  }

  async getModels(): Promise<string[]> {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }
}

/**
 * Groq Adapter
 */
export class GroqAdapter implements LLMAdapter {
  async generate(prompt: string, config: LLMConfig, onStream?: StreamCallback): Promise<LLMResponse> {
    const startTime = Date.now();
    
    if (!config.apiKey) {
      return {
        status: 'error',
        rawResponse: '',
        error: 'Groq API key not configured',
        metadata: {
          latencyMs: 0,
          modelName: config.model,
          provider: 'groq'
        }
      };
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          stream: !!onStream,
          temperature: config.temperature,
          max_tokens: config.maxTokens
        })
      });

      if (!response.ok) {
        const errorData = await response.json() as { error?: { message?: string } };
        throw new Error(errorData.error?.message || `Groq API error: ${response.status}`);
      }

      let fullResponse = '';

      if (onStream && response.body) {
        // Handle streaming response (same format as OpenAI)
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n').filter(line => line.startsWith('data:'));

          for (const line of lines) {
            const data = line.replace('data: ', '').trim();
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data) as {
                choices?: Array<{
                  delta?: { content?: string }
                }>
              };
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                fullResponse += content;
                onStream(content);
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } else {
        // Non-streaming response
        const data = await response.json() as {
          choices?: Array<{
            message?: { content?: string }
          }>
        };
        fullResponse = data.choices?.[0]?.message?.content || '';
      }

      const endTime = Date.now();

      return {
        status: 'success',
        rawResponse: fullResponse,
        metadata: {
          latencyMs: endTime - startTime,
          modelName: config.model,
          provider: 'groq'
        }
      };
    } catch (error) {
      return {
        status: 'error',
        rawResponse: '',
        error: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          latencyMs: Date.now() - startTime,
          modelName: config.model,
          provider: 'groq'
        }
      };
    }
  }

  validateConfig(config: LLMConfig): boolean {
    return !!config.apiKey && !!config.model;
  }

  async getModels(): Promise<string[]> {
    return [
      'llama-3.3-70b-versatile',
      'llama-3.1-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it'
    ];
  }
}

/**
 * LLM Service - Factory for LLM adapters
 */
export class LLMService {
  private adapters: Map<LLMProvider, LLMAdapter>;

  constructor() {
    this.adapters = new Map([
      ['ollama', new OllamaAdapter()],
      ['openai', new OpenAIAdapter()],
      ['claude', new ClaudeAdapter()],
      ['groq', new GroqAdapter()]
    ]);
  }

  /**
   * Get adapter for a provider
   */
  getAdapter(provider: LLMProvider): LLMAdapter | undefined {
    return this.adapters.get(provider);
  }

  /**
   * Generate response using specified provider
   */
  async generate(
    prompt: string,
    config: LLMConfig,
    onStream?: StreamCallback
  ): Promise<LLMResponse> {
    const adapter = this.adapters.get(config.provider);
    
    if (!adapter) {
      return {
        status: 'error',
        rawResponse: '',
        error: `Unknown provider: ${config.provider}`,
        metadata: {
          latencyMs: 0,
          modelName: config.model,
          provider: config.provider
        }
      };
    }

    if (!adapter.validateConfig(config)) {
      return {
        status: 'error',
        rawResponse: '',
        error: `Invalid configuration for provider: ${config.provider}`,
        metadata: {
          latencyMs: 0,
          modelName: config.model,
          provider: config.provider
        }
      };
    }

    return adapter.generate(prompt, config, onStream);
  }

  /**
   * Get available models for a provider
   */
  async getModels(provider: LLMProvider): Promise<string[]> {
    const adapter = this.adapters.get(provider);
    return adapter?.getModels() || [];
  }
}
