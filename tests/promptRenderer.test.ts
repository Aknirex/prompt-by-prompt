import { describe, expect, it } from 'vitest';
import { PromptDefinition, PROMPT_SCHEMA_VERSION } from '../src/domain/prompt';
import {
  getMissingVariables,
  getTemplateVariableNames,
  PromptRenderContext,
  renderPrompt,
} from '../src/domain/promptRenderer';

const context: PromptRenderContext = {
  selection: 'const x = 1;',
  filepath: 'src/index.ts',
  file_content: 'const x = 1;',
  lang: 'typescript',
  project_name: 'demo',
  line_number: 4,
  column_number: 2,
};

function prompt(overrides: Partial<PromptDefinition> = {}): PromptDefinition {
  return {
    schemaVersion: PROMPT_SCHEMA_VERSION,
    id: 'render',
    title: 'Render',
    description: '',
    category: 'General',
    tags: [],
    body: 'Explain {{selection}} using {{tone}} tone.',
    variables: [{
      name: 'tone',
      description: 'Tone',
      type: 'string',
      required: true,
      defaultValue: 'direct',
    }],
    ...overrides,
  };
}

describe('promptRenderer', () => {
  it('renders built-in context and manual variables', () => {
    expect(renderPrompt(prompt(), context, { tone: 'friendly' })).toBe(
      'Explain const x = 1; using friendly tone.'
    );
  });

  it('uses variable defaults when manual values are omitted', () => {
    expect(renderPrompt(prompt(), context)).toBe('Explain const x = 1; using direct tone.');
  });

  it('reports missing required variables without defaults', () => {
    const missing = getMissingVariables(prompt({
      variables: [{
        name: 'audience',
        description: 'Audience',
        type: 'string',
        required: true,
      }],
    }), context);

    expect(missing.map((variable) => variable.name)).toEqual(['audience']);
  });

  it('extracts simple template variable names', () => {
    expect(getTemplateVariableNames('Use {{selection}} in {{ lang }}.')).toEqual(['lang', 'selection']);
  });
});

