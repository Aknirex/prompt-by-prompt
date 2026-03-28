export interface IAIProvider {
  readonly id: string;
  readonly displayName: string;
  generate(prompt: string, systemPrompt: string, apiKey: string, model: string): Promise<string>;
}

// Internal helper type used by provider implementations
export interface GenerateProviderResult {
  success: boolean;
  rawText?: string;
  error?: string;
}
