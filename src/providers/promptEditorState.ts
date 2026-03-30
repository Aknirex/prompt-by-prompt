import * as yaml from 'js-yaml';
import { PromptVariable } from '../types/prompt';
import { ContextEngine } from '../services/contextEngine';
import { t } from '../utils/i18n';

export interface PromptEditorDraft {
  name: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables?: PromptVariable[];
}

export interface PreviewRequestData {
  template: string;
  variables?: PromptVariable[];
}

export function buildPreviewVariables(
  contextEngine: ContextEngine,
  builtinVariables: string[],
  template: string,
  variables: PromptVariable[]
): Record<string, string> {
  const previewVariables: Record<string, string> = {};
  const variableMap = new Map(variables.map((variable) => [variable.name, variable]));
  const extractedVariables = contextEngine.extractTemplateVariables(template);

  for (const variable of variables) {
    previewVariables[variable.name] = getPreviewVariableValue(variable);
  }

  for (const variableName of extractedVariables) {
    if (builtinVariables.includes(variableName) || previewVariables[variableName]) {
      continue;
    }

    const schemaVariable = variableMap.get(variableName);
    previewVariables[variableName] = schemaVariable
      ? getPreviewVariableValue(schemaVariable)
      : `[${variableName}]`;
  }

  return previewVariables;
}

export function getPreviewVariableValue(variable: PromptVariable): string {
  if (variable.default !== undefined && variable.default !== '') {
    return String(variable.default);
  }

  if (variable.type === 'enum' && variable.values && variable.values.length > 0) {
    return variable.values[0];
  }

  if (variable.type === 'boolean') {
    return 'true';
  }

  if (variable.type === 'number') {
    return '1';
  }

  return variable.placeholder || `[${variable.name}]`;
}

export function serializeDraft(data: PromptEditorDraft): string {
  const normalized = normalizeDraft(data);
  return yaml.dump(
    {
      name: normalized.name,
      description: normalized.description,
      category: normalized.category,
      tags: normalized.tags,
      variables: normalized.variables?.length ? normalized.variables : undefined,
      template: normalized.template,
    },
    {
      indent: 2,
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false,
    }
  );
}

export function parseDraftYaml(yamlText: string): PromptEditorDraft {
  const parsed = yaml.load(yamlText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error(t('YAML must describe a prompt object.'));
  }

  return normalizeDraft(parsed as Partial<PromptEditorDraft>);
}

export function normalizeDraft(data: Partial<PromptEditorDraft>): PromptEditorDraft {
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    name: typeof data.name === 'string' ? data.name : '',
    description: typeof data.description === 'string' ? data.description : '',
    category: typeof data.category === 'string' ? data.category : '',
    tags,
    template: typeof data.template === 'string' ? data.template : '',
    variables: normalizeVariables(data.variables),
  };
}

export function normalizeVariables(variables: unknown): PromptVariable[] | undefined {
  if (!Array.isArray(variables)) {
    return undefined;
  }

  const normalized = variables.flatMap((entry) => {
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
      ? record.values.map((value) => String(value)).filter(Boolean)
      : undefined;

    return [{
      name,
      description: typeof record.description === 'string' ? record.description : name,
      type: normalizedType,
      required: Boolean(record.required),
      default:
        typeof record.default === 'string' ||
        typeof record.default === 'number' ||
        typeof record.default === 'boolean'
          ? record.default
          : undefined,
      placeholder: typeof record.placeholder === 'string' ? record.placeholder : undefined,
      multiline: Boolean(record.multiline),
      values: normalizedType === 'enum' && values && values.length > 0 ? values : undefined,
    }];
  });

  return normalized.length > 0 ? normalized : undefined;
}
