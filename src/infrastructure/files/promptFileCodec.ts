import * as yaml from 'js-yaml';
import {
  PROMPT_SCHEMA_VERSION,
  PromptDefinition,
  PromptMetadata,
  PromptVariableDefinition,
  PromptVariableSource,
  PromptVariableType,
} from '../../domain/prompt';
import { PromptValidationIssue, validatePromptDefinition } from '../../domain/promptValidation';

export interface DecodePromptYamlOptions {
  fallbackId?: string;
}

export type DecodePromptYamlResult =
  | { ok: true; prompt: PromptDefinition; warnings: PromptValidationIssue[] }
  | { ok: false; issues: PromptValidationIssue[] };

type PromptYamlRecord = Record<string, unknown>;

const EDITOR_CONTEXT_VARIABLES = new Set([
  'selection',
  'filepath',
  'file_content',
  'lang',
  'project_name',
  'git_commit_diff',
  'line_number',
  'column_number',
]);

export function decodePromptYaml(
  content: string,
  options: DecodePromptYamlOptions = {}
): DecodePromptYamlResult {
  let parsed: unknown;

  try {
    parsed = yaml.load(content);
  } catch (error) {
    return {
      ok: false,
      issues: [{
        code: 'invalid-yaml',
        path: 'yaml',
        message: `Prompt YAML could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      }],
    };
  }

  if (!isRecord(parsed)) {
    return {
      ok: false,
      issues: [{
        code: 'invalid-yaml-shape',
        path: 'yaml',
        message: 'Prompt YAML must contain an object.',
      }],
    };
  }

  const prompt = normalizePromptRecord(parsed, options);
  const validation = validatePromptDefinition(prompt);

  if (!validation.valid) {
    return {
      ok: false,
      issues: validation.issues,
    };
  }

  return {
    ok: true,
    prompt,
    warnings: [],
  };
}

export function encodePromptYaml(prompt: PromptDefinition): string {
  const record: PromptYamlRecord = {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    id: prompt.id,
    name: prompt.title,
    description: prompt.description,
    category: prompt.category ?? 'General',
    tags: prompt.tags,
    template: prompt.body,
  };

  if (prompt.metadata.author) {
    record.author = prompt.metadata.author;
  }
  if (prompt.metadata.version) {
    record.version = prompt.metadata.version;
  }
  if (prompt.metadata.createdAt) {
    record.createdAt = prompt.metadata.createdAt;
  }
  if (prompt.metadata.updatedAt) {
    record.updatedAt = prompt.metadata.updatedAt;
  }
  if (prompt.metadata.lastUsedAt) {
    record.lastUsedAt = prompt.metadata.lastUsedAt;
  }
  if (typeof prompt.metadata.favorite === 'boolean') {
    record.favorite = prompt.metadata.favorite;
  }
  if (prompt.variables.length > 0) {
    record.variables = prompt.variables.map(encodeVariable);
  }

  return yaml.dump(record, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
  });
}

function normalizePromptRecord(
  record: PromptYamlRecord,
  options: DecodePromptYamlOptions
): PromptDefinition {
  const id = toOptionalString(record.id) ?? options.fallbackId ?? '';
  const title = toOptionalString(record.title) ?? toOptionalString(record.name) ?? '';
  const body = toOptionalTemplateText(record.body) ?? toOptionalTemplateText(record.template) ?? '';
  const metadata = normalizeMetadata(record);

  return {
    id,
    schemaVersion: PROMPT_SCHEMA_VERSION,
    title,
    description: toOptionalString(record.description) ?? '',
    body,
    tags: toStringArray(record.tags),
    category: toOptionalString(record.category),
    variables: normalizeVariables(record.variables),
    metadata,
  };
}

function normalizeMetadata(record: PromptYamlRecord): PromptMetadata {
  return {
    author: toOptionalString(record.author),
    version: toOptionalString(record.version),
    createdAt: toOptionalString(record.createdAt),
    updatedAt: toOptionalString(record.updatedAt),
    lastUsedAt: toOptionalString(record.lastUsedAt),
    favorite: typeof record.favorite === 'boolean' ? record.favorite : undefined,
  };
}

function normalizeVariables(value: unknown): PromptVariableDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): PromptVariableDefinition[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = toOptionalString(entry.name) ?? '';
    const type = normalizeVariableType(entry.type);
    const enumValues = toStringArray(entry.enumValues).length > 0
      ? toStringArray(entry.enumValues)
      : toStringArray(entry.values);
    const defaultValue = normalizeDefaultValue(entry.defaultValue ?? entry.default, type);

    return [{
      name,
      type,
      description: typeof entry.description === 'string' ? entry.description.trim() : name,
      required: typeof entry.required === 'boolean' ? entry.required : false,
      defaultValue,
      enumValues: type === 'enum' ? enumValues : undefined,
      placeholder: toOptionalString(entry.placeholder),
      multiline: typeof entry.multiline === 'boolean' ? entry.multiline : undefined,
      source: normalizeVariableSource(entry.source, name),
    }];
  });
}

function encodeVariable(variable: PromptVariableDefinition): PromptYamlRecord {
  const record: PromptYamlRecord = {
    name: variable.name,
    description: variable.description,
    type: variable.type,
    required: variable.required,
    source: variable.source,
  };

  if (typeof variable.defaultValue !== 'undefined') {
    record.default = variable.defaultValue;
  }
  if (variable.enumValues && variable.enumValues.length > 0) {
    record.values = variable.enumValues;
  }
  if (variable.placeholder) {
    record.placeholder = variable.placeholder;
  }
  if (typeof variable.multiline === 'boolean') {
    record.multiline = variable.multiline;
  }

  return record;
}

function normalizeVariableType(value: unknown): PromptVariableType {
  return value === 'number' || value === 'boolean' || value === 'enum'
    ? value
    : 'string';
}

function normalizeVariableSource(value: unknown, name: string): PromptVariableSource {
  if (value === 'manual' || value === 'editor-context' || value === 'system') {
    return value;
  }

  return EDITOR_CONTEXT_VARIABLES.has(name) ? 'editor-context' : 'manual';
}

function normalizeDefaultValue(
  value: unknown,
  type: PromptVariableType
): string | number | boolean | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (type === 'number') {
    return typeof value === 'number' ? value : undefined;
  }

  if (type === 'boolean') {
    return typeof value === 'boolean' ? value : undefined;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toOptionalTemplateText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function isRecord(value: unknown): value is PromptYamlRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
