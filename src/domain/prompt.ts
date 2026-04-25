export const PROMPT_SCHEMA_VERSION = 1;

export type PromptSchemaVersion = typeof PROMPT_SCHEMA_VERSION;
export type PromptVariableType = 'string' | 'number' | 'boolean' | 'enum';
export type PromptVariableSource = 'manual' | 'editor-context' | 'system';

export interface PromptVariableDefinition {
  name: string;
  type: PromptVariableType;
  description: string;
  required: boolean;
  defaultValue?: string | number | boolean;
  enumValues?: string[];
  placeholder?: string;
  multiline?: boolean;
  source: PromptVariableSource;
}

export interface PromptMetadata {
  author?: string;
  version?: string;
  createdAt?: string;
  updatedAt?: string;
  lastUsedAt?: string;
  favorite?: boolean;
}

export interface PromptDefinition {
  id: string;
  schemaVersion: PromptSchemaVersion;
  title: string;
  description: string;
  body: string;
  tags: string[];
  category?: string;
  variables: PromptVariableDefinition[];
  metadata: PromptMetadata;
}

export type PromptSource =
  | { kind: 'personal' }
  | { kind: 'workspace'; workspaceFolder: string }
  | { kind: 'builtin' }
  | { kind: 'shared'; libraryId: string; libraryVersion: string };

export type PromptStorageRef =
  | { kind: 'file'; path: string; workspaceFolder?: string }
  | { kind: 'builtin'; path?: string }
  | { kind: 'shared'; libraryId: string; sourceFile?: string };

export interface PromptLibraryItem {
  prompt: PromptDefinition;
  source: PromptSource;
  readOnly: boolean;
  storage?: PromptStorageRef;
}

export type PromptSaveTarget =
  | { kind: 'personal' }
  | { kind: 'workspace'; workspaceFolder: string };

