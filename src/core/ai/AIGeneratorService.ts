import * as yaml from 'js-yaml';
import { PromptVariable } from '../../types/prompt';
import { IAIProvider } from './IAIProvider';
import { AIProvider, PROVIDER_REGISTRY } from './AIProviderRegistry';

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
  rawText?: string;
  draft?: GeneratedPromptDraft;
  error?: string;
}

// Re-export for provider implementations
export type { GeneratePromptResult as GenerateProviderResult };

export interface AIKeyStore {
  getSecret(key: string): Promise<string | undefined>;
}

export interface AIConfig {
  defaultProvider: AIProvider;
  defaultModel: string;
  systemPrompt: string;
}

const DRAFT_FORMAT_INSTRUCTIONS = `
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
- tags must be a YAML list.
- variables is optional. Omit it if no extra variables are needed.
- template should be production-ready, not just an outline.
`;

export const DEFAULT_SYSTEM_PROMPT = `You are a prompt engineering assistant. Your task is to help users create effective prompts for AI assistants.

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
- {{column_number}}: Current column number`;

export class AIGeneratorService {
  constructor(
    private readonly keyStore: AIKeyStore,
    private readonly getConfig: () => AIConfig
  ) {}

  async generate(
    userDescription: string,
    overrideProvider?: AIProvider,
    overrideModel?: string
  ): Promise<GeneratePromptResult> {
    const config = this.getConfig();
    const provider = overrideProvider ?? config.defaultProvider;
    const model = overrideModel ?? config.defaultModel;

    const impl = PROVIDER_REGISTRY.get(provider);
    if (!impl) return { success: false, error: `Unknown provider: ${provider}` };

    const apiKey = await this.resolveApiKey(provider);
    if (!apiKey && provider !== 'ollama') {
      return { success: false, error: `API key not configured for ${provider}. Please set it in Settings.` };
    }

    const systemPrompt = (config.systemPrompt || DEFAULT_SYSTEM_PROMPT) + '\n\n' + DRAFT_FORMAT_INSTRUCTIONS.trim();
    const userPrompt = `Create a complete prompt draft for this request:\n\n${userDescription.trim()}`;

    try {
      const rawText = await impl.generate(userPrompt, systemPrompt, apiKey ?? '', model);
      const draft = this.parseDraft(rawText, userDescription);
      return { success: true, rawText, draft };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async resolveApiKey(provider: AIProvider): Promise<string | undefined> {
    const keyMap: Record<AIProvider, string> = {
      anthropic: 'pbp.apiKey.anthropic',
      openai: 'pbp.apiKey.openai',
      google: 'pbp.apiKey.google',
      groq: 'pbp.apiKey.groq',
      deepseek: 'pbp.apiKey.deepseek',
      mistral: 'pbp.apiKey.mistral',
      azure: 'pbp.apiKey.azure',
      openrouter: 'pbp.apiKey.openrouter',
      xai: 'pbp.apiKey.xai',
      ollama: '',
      custom: 'pbp.apiKey.custom',
    };
    const key = keyMap[provider];
    if (!key) return undefined;
    return this.keyStore.getSecret(key);
  }

  private parseDraft(raw: string, fallbackDescription: string): GeneratedPromptDraft {
    // Strip markdown fences if present
    const cleaned = raw.replace(/^```(?:yaml)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    try {
      const parsed = yaml.load(cleaned) as Partial<GeneratedPromptDraft>;
      if (parsed && typeof parsed === 'object' && parsed.template) {
        return {
          name: parsed.name ?? 'Generated Prompt',
          description: parsed.description ?? fallbackDescription,
          category: parsed.category ?? 'General',
          tags: Array.isArray(parsed.tags) ? parsed.tags : [],
          template: parsed.template,
          variables: parsed.variables,
        };
      }
    } catch {
      // fall through to plain text fallback
    }
    return {
      name: 'Generated Prompt',
      description: fallbackDescription,
      category: 'General',
      tags: [],
      template: cleaned,
    };
  }
}
