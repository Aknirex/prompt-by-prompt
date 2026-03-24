/**
 * Prompt by Prompt - Core Type Definitions
 * Based on docs/03-data-spec.md
 */

// ============================================================================
// Prompt Template Schema
// ============================================================================

/**
 * Variable definition in a prompt template
 */
export interface PromptVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'enum';
  required?: boolean;
  values?: string[]; // for enum type
  default?: string | number | boolean;
  placeholder?: string;
  multiline?: boolean;
}

/**
 * LLM parameters for prompt execution
 */
export interface PromptParameters {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
}

/**
 * Complete Prompt Template definition
 */
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author?: string;
  version: string;
  parameters?: PromptParameters;
  variables?: PromptVariable[];
  template: string;
  
  // Metadata (not stored in YAML)
  source?: 'workspace' | 'global' | 'builtin' | 'team-pack';
  filePath?: string;
  readOnly?: boolean;
  packId?: string;
  packVersion?: string;
}

// ============================================================================
// Context Variables
// ============================================================================

/**
 * Context variables that can be extracted from VS Code editor
 */
export interface EditorContext {
  selection: string;
  filepath: string;
  file_content: string;
  lang: string;
  project_name: string;
  git_commit_diff?: string;
  line_number?: number;
  column_number?: number;
}

/**
 * All available context variables
 */
export type ContextVariableKey = keyof EditorContext;

// ============================================================================
// LLM Response Types
// ============================================================================

export type ResponseStatus = 'loading' | 'success' | 'error';

export interface ResponseMetadata {
  latencyMs: number;
  modelName: string;
  provider: string;
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface LLMResponse {
  status: ResponseStatus;
  rawResponse: string;
  metadata: ResponseMetadata;
  error?: string;
}

// ============================================================================
// Provider Types
// ============================================================================

export type LLMProvider = 'ollama' | 'openai' | 'claude' | 'groq';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  endpoint?: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ExtensionConfig {
  defaultModel: LLMProvider;
  ollamaEndpoint: string;
  ollamaModel: string;
  openaiApiKey: string;
  openaiModel: string;
  claudeApiKey: string;
  claudeModel: string;
  groqApiKey: string;
  groqModel: string;
  promptsDir: string;
}

// ============================================================================
// Event Types
// ============================================================================

export interface PromptEvent {
  type: 'create' | 'update' | 'delete';
  prompt: PromptTemplate;
}

export interface ExecutionEvent {
  type: 'start' | 'stream' | 'complete' | 'error';
  promptId: string;
  data?: string;
  response?: LLMResponse;
  error?: string;
}
