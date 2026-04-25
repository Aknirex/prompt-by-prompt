import { describe, expect, it } from 'vitest';
import { decodePromptYaml, encodePromptYaml } from '../src/infrastructure/files/promptFileCodec';
import { PromptDefinition } from '../src/domain/prompt';
import { validatePromptDefinition } from '../src/domain/promptValidation';

describe('promptFileCodec', () => {
  it('decodes current prompt YAML into the vNext domain model', () => {
    const result = decodePromptYaml(`
id: code-review
name: Code Review
description: Review selected code
category: Code Analysis
tags:
  - review
  - quality
version: 1.2.0
author: Team
variables:
  - name: tone
    description: Response tone
    type: enum
    required: true
    values:
      - concise
      - detailed
    default: concise
  - name: selection
    description: Editor selection
    type: string
template: |
  Review {{selection}} with a {{tone}} style.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.prompt).toMatchObject({
      id: 'code-review',
      schemaVersion: 1,
      title: 'Code Review',
      description: 'Review selected code',
      category: 'Code Analysis',
      body: 'Review {{selection}} with a {{tone}} style.\n',
      tags: ['review', 'quality'],
      metadata: {
        author: 'Team',
        version: '1.2.0',
      },
    });
    expect(result.prompt.variables[0]).toMatchObject({
      name: 'tone',
      type: 'enum',
      required: true,
      enumValues: ['concise', 'detailed'],
      defaultValue: 'concise',
      source: 'manual',
    });
    expect(result.prompt.variables[1]).toMatchObject({
      name: 'selection',
      source: 'editor-context',
    });
  });

  it('decodes vNext title and body fields while keeping legacy compatibility', () => {
    const result = decodePromptYaml(`
schemaVersion: 1
id: explain-code
title: Explain Code
body: |
  Explain {{selection}}.
`);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.prompt.title).toBe('Explain Code');
    expect(result.prompt.body).toBe('Explain {{selection}}.\n');
  });

  it('returns structured validation issues for invalid prompt files', () => {
    const result = decodePromptYaml(`
id: ""
name: ""
template: ""
variables:
  - name: invalid-name!
    description: ""
    type: enum
  - name: invalid-name!
    description: Duplicate
    type: string
`);

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'missing-id',
      'missing-title',
      'missing-body',
      'invalid-variable-name',
      'duplicate-variable-name',
      'missing-variable-description',
      'invalid-enum-values',
    ]));
  });

  it('serializes the vNext model to current-compatible YAML', () => {
    const prompt: PromptDefinition = {
      id: 'commit-message',
      schemaVersion: 1,
      title: 'Commit Message',
      description: 'Draft a commit message',
      category: 'Git',
      tags: ['git', 'commit'],
      body: 'Write a commit message for {{git_commit_diff}}.',
      variables: [{
        name: 'style',
        description: 'Commit style',
        type: 'enum',
        required: false,
        defaultValue: 'conventional',
        enumValues: ['conventional', 'plain'],
        source: 'manual',
      }],
      metadata: {
        author: 'Prompt by Prompt',
        version: '2.0.0',
        favorite: true,
      },
    };

    const yaml = encodePromptYaml(prompt);
    const decoded = decodePromptYaml(yaml);

    expect(yaml).toContain('schemaVersion: 1');
    expect(yaml).toContain('name: Commit Message');
    expect(yaml).toContain('template: Write a commit message for {{git_commit_diff}}.');
    expect(yaml).toContain('values:');
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }

    expect(decoded.prompt).toEqual(prompt);
  });

  it('validates default values against variable types', () => {
    const prompt: PromptDefinition = {
      id: 'bad-default',
      schemaVersion: 1,
      title: 'Bad Default',
      description: '',
      category: 'General',
      tags: [],
      body: 'Run',
      variables: [{
        name: 'count',
        description: 'Count',
        type: 'number',
        required: false,
        defaultValue: 'three',
        source: 'manual',
      }],
      metadata: {},
    };

    const result = validatePromptDefinition(prompt);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'invalid-default-value', path: 'variables.0.defaultValue' }),
    ]));
  });
});

