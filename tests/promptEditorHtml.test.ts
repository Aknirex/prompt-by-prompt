import { describe, expect, it } from 'vitest';
import { buildPromptEditorHtml } from '../src/providers/promptEditorHtml';

describe('prompt editor html', () => {
  it('uses delegated actions instead of inline onclick handlers', () => {
    const html = buildPromptEditorHtml({
      prompt: undefined,
      providers: [
        { id: 'ollama', name: 'Ollama', models: ['llama3.2'], requiresApiKey: false },
      ],
      defaultProvider: 'ollama',
      builtinVariables: ['selection', 'filepath'],
      defaultTarget: 'global',
      initialYamlDraft: 'name: Example',
      strings: {
        defaultLabel: 'Default',
        previewBasedOnForm: 'Preview is based on the form state.',
        refreshingPreview: 'Refreshing preview...',
        previewUnavailable: 'Preview unavailable right now.',
        previewStillReflects: 'Preview still reflects the form state.',
        previewUsesContext: 'Preview uses current editor context.',
        yamlRefreshed: 'YAML refreshed.',
        yamlApplied: 'YAML applied.',
        failedToSaveYaml: 'Failed to save YAML.',
        nameRequired: 'Name is required',
        templateRequired: 'Template is required',
        noSchemaVariables: 'No schema variables defined yet.',
        variableName: 'Variable Name',
        description: 'Description',
        type: 'Type',
        defaultValue: 'Default Value',
        placeholder: 'Placeholder',
        enumValues: 'Enum Values',
        required: 'Required',
        multiline: 'Multiline',
        remove: 'Remove',
        whatShouldUserProvide: 'What should the user provide?',
        optional: 'Optional',
        shownDuringInput: 'Shown during input collection',
      },
    });

    expect(html).toContain('data-action="save"');
    expect(html).toContain('data-action="generate"');
    expect(html).toContain('data-action="remove-variable"');
    expect(html).not.toContain('onclick=');
  });
});
