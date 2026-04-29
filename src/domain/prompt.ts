export const PROMPT_SCHEMA_VERSION = 1;

export type PromptSource = 'workspace' | 'user' | 'builtin';
export type PromptVariableType = 'string' | 'number' | 'boolean' | 'enum';

export interface PromptVariable {
  name: string;
  description: string;
  type: PromptVariableType;
  required: boolean;
  defaultValue?: string | number | boolean;
  values?: string[];
  multiline?: boolean;
}

export interface PromptDefinition {
  schemaVersion: number;
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  body: string;
  variables: PromptVariable[];
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptEntry {
  prompt: PromptDefinition;
  source: PromptSource;
  filePath?: string;
  readOnly: boolean;
  favorite: boolean;
  lastUsedAt?: string;
}

export interface PromptMetadata {
  favorite?: boolean;
  lastUsedAt?: string;
}

export type PromptMetadataMap = Record<string, PromptMetadata>;

export interface PromptLibrarySummary {
  total: number;
  workspace: number;
  user: number;
  builtin: number;
  favorites: number;
}

export function createEmptyPrompt(id: string, title: string, now = new Date()): PromptDefinition {
  const timestamp = now.toISOString();
  return {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    id,
    title,
    description: '',
    category: 'General',
    tags: [],
    body: [
      `# ${title}`,
      '',
      'Use editor context variables like {{selection}}, {{filepath}}, {{lang}}, and {{file_content}}.',
      '',
      'Write the prompt body here.',
    ].join('\n'),
    variables: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function summarizeLibrary(entries: PromptEntry[]): PromptLibrarySummary {
  return {
    total: entries.length,
    workspace: entries.filter((entry) => entry.source === 'workspace').length,
    user: entries.filter((entry) => entry.source === 'user').length,
    builtin: entries.filter((entry) => entry.source === 'builtin').length,
    favorites: entries.filter((entry) => entry.favorite).length,
  };
}

