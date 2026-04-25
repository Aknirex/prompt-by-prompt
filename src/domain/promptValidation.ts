import { PROMPT_SCHEMA_VERSION, PromptDefinition, PromptVariableDefinition, PromptVariableType } from './prompt';

export type PromptValidationIssueCode =
  | 'invalid-yaml'
  | 'invalid-yaml-shape'
  | 'invalid-schema-version'
  | 'missing-id'
  | 'missing-title'
  | 'missing-body'
  | 'invalid-variable-name'
  | 'duplicate-variable-name'
  | 'missing-variable-description'
  | 'invalid-enum-values'
  | 'invalid-default-value';

export interface PromptValidationIssue {
  code: PromptValidationIssueCode;
  path: string;
  message: string;
}

export interface PromptValidationResult {
  valid: boolean;
  issues: PromptValidationIssue[];
}

const VARIABLE_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validatePromptDefinition(prompt: PromptDefinition): PromptValidationResult {
  const issues: PromptValidationIssue[] = [];

  if (prompt.schemaVersion !== PROMPT_SCHEMA_VERSION) {
    issues.push({
      code: 'invalid-schema-version',
      path: 'schemaVersion',
      message: `Prompt schemaVersion must be ${PROMPT_SCHEMA_VERSION}.`,
    });
  }

  if (!prompt.id.trim()) {
    issues.push({
      code: 'missing-id',
      path: 'id',
      message: 'Prompt id is required.',
    });
  }

  if (!prompt.title.trim()) {
    issues.push({
      code: 'missing-title',
      path: 'title',
      message: 'Prompt title is required.',
    });
  }

  if (!prompt.body.trim()) {
    issues.push({
      code: 'missing-body',
      path: 'body',
      message: 'Prompt body is required.',
    });
  }

  issues.push(...validateVariables(prompt.variables));

  return {
    valid: issues.length === 0,
    issues,
  };
}

function validateVariables(variables: PromptVariableDefinition[]): PromptValidationIssue[] {
  const issues: PromptValidationIssue[] = [];
  const seenNames = new Set<string>();

  for (const [index, variable] of variables.entries()) {
    const path = `variables.${index}`;
    const normalizedName = variable.name.trim();

    if (!VARIABLE_NAME_PATTERN.test(normalizedName)) {
      issues.push({
        code: 'invalid-variable-name',
        path: `${path}.name`,
        message: `Variable name "${variable.name}" must start with a letter or underscore and contain only letters, numbers, or underscores.`,
      });
    }

    const uniqueKey = normalizedName.toLowerCase();
    if (seenNames.has(uniqueKey)) {
      issues.push({
        code: 'duplicate-variable-name',
        path: `${path}.name`,
        message: `Variable name "${variable.name}" is duplicated.`,
      });
    }
    seenNames.add(uniqueKey);

    if (!variable.description.trim()) {
      issues.push({
        code: 'missing-variable-description',
        path: `${path}.description`,
        message: `Variable "${variable.name}" needs a description.`,
      });
    }

    if (variable.type === 'enum' && (!variable.enumValues || variable.enumValues.length === 0)) {
      issues.push({
        code: 'invalid-enum-values',
        path: `${path}.enumValues`,
        message: `Enum variable "${variable.name}" must define at least one value.`,
      });
    }

    if (typeof variable.defaultValue !== 'undefined' && !defaultValueMatchesType(variable.defaultValue, variable.type, variable.enumValues)) {
      issues.push({
        code: 'invalid-default-value',
        path: `${path}.defaultValue`,
        message: `Default value for "${variable.name}" does not match its variable type.`,
      });
    }
  }

  return issues;
}

function defaultValueMatchesType(
  value: string | number | boolean,
  type: PromptVariableType,
  enumValues?: string[]
): boolean {
  switch (type) {
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'enum':
      return typeof value === 'string' && Boolean(enumValues?.includes(value));
    case 'string':
    default:
      return typeof value === 'string';
  }
}
