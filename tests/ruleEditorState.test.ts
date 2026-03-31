import { describe, expect, it } from 'vitest';
import { normalizeRuleDraft, parseDraftYaml, serializeDraft } from '../src/providers/ruleEditorState';

describe('ruleEditorState', () => {
  it('serializes only the minimal rule metadata', () => {
    const content = serializeDraft(normalizeRuleDraft({
      fileName: 'example.md',
      title: 'Example Rule',
      kind: 'guardrail',
      priority: 250,
      required: true,
      body: 'Keep the rule body front and center.',
    }));

    expect(content).toContain('title: Example Rule');
    expect(content).toContain('kind: guardrail');
    expect(content).toContain('priority: 250');
    expect(content).toContain('required: true');
    expect(content).toContain('Keep the rule body front and center.');
    expect(content).not.toContain('category:');
    expect(content).not.toContain('canonicalKey:');
    expect(content).not.toContain('ruleId:');
    expect(content).not.toContain('appliesTo:');
    expect(content).not.toContain('preferenceKey:');
    expect(content).not.toContain('preferenceValue:');
  });

  it('accepts legacy frontmatter but keeps the draft lean', () => {
    const draft = parseDraftYaml(`---\n\
title: Legacy Rule\n\
category: workflow\n\
canonicalKey: legacy:key\n\
ruleId: legacy-rule\n\
priority: 42\n\
required: true\n\
kind: preference\n\
appliesTo:\n\
  - codex\n\
preferenceKey: responseStyle\n\
preferenceValue: concise\n\
---\n\
Use the shortest path.\n`);

    expect(draft).toMatchObject({
      title: 'Legacy Rule',
      kind: 'preference',
      priority: 42,
      required: true,
      body: 'Use the shortest path.\n',
    });
  });
});
