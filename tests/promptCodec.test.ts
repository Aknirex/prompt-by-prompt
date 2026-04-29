import { describe, expect, it } from 'vitest';
import { decodePromptYaml, encodePromptYaml } from '../src/domain/promptCodec';
import { PROMPT_SCHEMA_VERSION, PromptDefinition } from '../src/domain/prompt';

describe('promptCodec', () => {
  it('decodes the new prompt format', () => {
    const decoded = decodePromptYaml(`
schemaVersion: 1
id: sample
title: Sample Prompt
description: Useful for tests
category: Testing
tags:
  - unit
body: |
  Review {{selection}}
variables:
  - name: tone
    description: Tone
    type: enum
    required: true
    values:
      - direct
      - friendly
`, 'fallback');

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    expect(decoded.prompt.title).toBe('Sample Prompt');
    expect(decoded.prompt.body).toContain('{{selection}}');
    expect(decoded.prompt.variables[0]).toMatchObject({
      name: 'tone',
      type: 'enum',
      required: true,
      values: ['direct', 'friendly'],
    });
  });

  it('decodes legacy name/template prompt files', () => {
    const decoded = decodePromptYaml(`
id: legacy
name: Legacy Prompt
template: |
  Explain {{filepath}}
`, 'fallback');

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    expect(decoded.prompt).toMatchObject({
      id: 'legacy',
      title: 'Legacy Prompt',
      body: 'Explain {{filepath}}\n',
      category: 'General',
    });
  });

  it('encodes prompts with stable field names', () => {
    const prompt: PromptDefinition = {
      schemaVersion: PROMPT_SCHEMA_VERSION,
      id: 'encoded',
      title: 'Encoded Prompt',
      description: '',
      category: 'General',
      tags: ['demo'],
      body: 'Hello {{name}}',
      variables: [{
        name: 'name',
        description: 'Name',
        type: 'string',
        required: true,
      }],
    };

    const encoded = encodePromptYaml(prompt);
    expect(encoded).toContain('title: Encoded Prompt');
    expect(encoded).toContain('body: Hello {{name}}');
    expect(encoded).toContain('variables:');
  });
});

