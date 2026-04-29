import * as Handlebars from 'handlebars';
import { PromptDefinition, PromptVariable } from './prompt';

export interface PromptRenderContext {
  selection: string;
  filepath: string;
  file_content: string;
  lang: string;
  project_name: string;
  line_number: number;
  column_number: number;
}

export const BUILTIN_VARIABLES: Array<keyof PromptRenderContext> = [
  'selection',
  'filepath',
  'file_content',
  'lang',
  'project_name',
  'line_number',
  'column_number',
];

export type PromptVariableValues = Record<string, string | number | boolean>;

export function renderPrompt(
  prompt: PromptDefinition,
  context: PromptRenderContext,
  values: PromptVariableValues = {}
): string {
  const mergedValues: PromptVariableValues = { ...context, ...getDefaultVariableValues(prompt), ...values };
  const compiled = Handlebars.compile(prompt.body, { noEscape: true });
  return compiled(mergedValues).trim();
}

export function getMissingVariables(
  prompt: PromptDefinition,
  context: PromptRenderContext,
  provided: PromptVariableValues = {}
): PromptVariable[] {
  return prompt.variables.filter((variable) => {
    if (BUILTIN_VARIABLES.includes(variable.name as keyof PromptRenderContext)) {
      return false;
    }

    const value = provided[variable.name] ?? context[variable.name as keyof PromptRenderContext];
    if (typeof value !== 'undefined' && String(value).length > 0) {
      return false;
    }

    if (typeof variable.defaultValue !== 'undefined') {
      return false;
    }

    return variable.required;
  });
}

export function getTemplateVariableNames(template: string): string[] {
  const names = new Set<string>();
  const pattern = /\{\{\s*([a-zA-Z_][\w.-]*)\s*\}\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(template)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names).sort();
}

function getDefaultVariableValues(prompt: PromptDefinition): PromptVariableValues {
  const values: PromptVariableValues = {};

  for (const variable of prompt.variables) {
    if (typeof variable.defaultValue !== 'undefined') {
      values[variable.name] = variable.defaultValue;
    }
  }

  return values;
}

