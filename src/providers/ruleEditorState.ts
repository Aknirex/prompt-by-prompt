import { parseRuleDocument, serializeRuleDocument } from '../utils/ruleFrontmatter';
import { RuleKind } from '../types/rule';

export interface RuleEditorDraft {
  fileName: string;
  title: string;
  kind: RuleKind;
  priority: number;
  required: boolean;
  body: string;
}

export interface RuleEditorFilePayload {
  fileName: string;
  content: string;
}

export function normalizeRuleDraft(data: Partial<RuleEditorDraft>): RuleEditorDraft {
  return {
    fileName: typeof data.fileName === 'string' && data.fileName.trim() ? data.fileName.trim() : 'new-rule.md',
    title: typeof data.title === 'string' ? data.title : '',
    kind: isRuleKind(data.kind) ? data.kind : 'instruction',
    priority: typeof data.priority === 'number' && Number.isFinite(data.priority) ? data.priority : 100,
    required: typeof data.required === 'boolean' ? data.required : false,
    body: typeof data.body === 'string' ? data.body : '',
  };
}

export function parseDraftYaml(yamlText: string): RuleEditorDraft {
  const parsed = parseRuleDocument(yamlText);
  const normalized = normalizeRuleDraft({
    title: parsed.metadata.title ?? '',
    kind: parsed.metadata.kind ?? 'instruction',
    priority: parsed.metadata.priority ?? 100,
    required: parsed.metadata.required ?? false,
    body: parsed.body,
  });

  return normalized;
}

export function serializeDraft(draft: RuleEditorDraft): string {
  const content = serializeRuleDocument({
    title: draft.title.trim() || undefined,
    kind: draft.kind,
    priority: draft.priority,
    required: draft.required,
    body: draft.body,
  });

  return content;
}

function isRuleKind(value: unknown): value is RuleKind {
  return value === 'instruction' || value === 'preference' || value === 'guardrail';
}
