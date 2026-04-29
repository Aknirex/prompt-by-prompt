import * as yaml from 'js-yaml';
import {
  PROMPT_SCHEMA_VERSION,
  PromptDefinition,
  PromptVariable,
  PromptVariableType,
} from './prompt';

export type DecodePromptResult =
  | { ok: true; prompt: PromptDefinition }
  | { ok: false; error: string };

type YamlRecord = Record<string, unknown>;

export function decodePromptYaml(content: string, fallbackId: string): DecodePromptResult {
  let parsed: unknown;
  try {
    parsed = yaml.load(content);
  } catch (error) {
    return { ok: false, error: `Invalid YAML: ${formatError(error)}` };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: 'Prompt YAML must contain an object.' };
  }

  const id = optionalString(parsed.id) ?? fallbackId;
  const title = optionalString(parsed.title) ?? optionalString(parsed.name);
  const body = optionalText(parsed.body) ?? optionalText(parsed.template);

  if (!title) {
    return { ok: false, error: 'Prompt title is required.' };
  }

  if (!body) {
    return { ok: false, error: 'Prompt body is required.' };
  }

  return {
    ok: true,
    prompt: {
      schemaVersion: PROMPT_SCHEMA_VERSION,
      id,
      title,
      description: optionalString(parsed.description) ?? '',
      category: optionalString(parsed.category) ?? 'General',
      tags: stringArray(parsed.tags),
      body,
      variables: decodeVariables(parsed.variables),
      createdAt: optionalString(parsed.createdAt),
      updatedAt: optionalString(parsed.updatedAt),
    },
  };
}

export function encodePromptYaml(prompt: PromptDefinition): string {
  const record: YamlRecord = {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    id: prompt.id,
    title: prompt.title,
    description: prompt.description,
    category: prompt.category,
    tags: prompt.tags,
    body: prompt.body,
  };

  if (prompt.variables.length > 0) {
    record.variables = prompt.variables.map((variable) => {
      const value: YamlRecord = {
        name: variable.name,
        description: variable.description,
        type: variable.type,
        required: variable.required,
      };
      if (typeof variable.defaultValue !== 'undefined') {
        value.default = variable.defaultValue;
      }
      if (variable.values && variable.values.length > 0) {
        value.values = variable.values;
      }
      if (variable.multiline) {
        value.multiline = true;
      }
      return value;
    });
  }

  if (prompt.createdAt) {
    record.createdAt = prompt.createdAt;
  }
  if (prompt.updatedAt) {
    record.updatedAt = prompt.updatedAt;
  }

  return yaml.dump(record, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
    quotingType: '"',
  });
}

function decodeVariables(value: unknown): PromptVariable[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry): PromptVariable[] => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = optionalString(entry.name);
    if (!name) {
      return [];
    }

    const type = normalizeVariableType(entry.type);
    const values = stringArray(entry.values);
    const defaultValue = normalizeDefaultValue(entry.default ?? entry.defaultValue, type);

    return [{
      name,
      description: optionalString(entry.description) ?? name,
      type,
      required: entry.required === true,
      defaultValue,
      values: type === 'enum' ? values : undefined,
      multiline: entry.multiline === true,
    }];
  });
}

function normalizeVariableType(value: unknown): PromptVariableType {
  return value === 'number' || value === 'boolean' || value === 'enum'
    ? value
    : 'string';
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

  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => String(entry).trim()).filter(Boolean);
}

function isRecord(value: unknown): value is YamlRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

