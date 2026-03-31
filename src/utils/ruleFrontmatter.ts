import * as yaml from 'js-yaml';
import { AgentType } from '../types/agent';
import { RuleCategory, RuleKind } from '../types/rule';

export interface ParsedRuleFrontmatter {
  ruleId?: string;
  canonicalKey?: string;
  title?: string;
  category?: RuleCategory;
  priority?: number;
  required?: boolean;
  kind?: RuleKind;
  appliesTo?: AgentType[];
  preferenceKey?: string;
  preferenceValue?: string | boolean | number;
}

export interface ParsedRuleDocument {
  body: string;
  metadata: ParsedRuleFrontmatter;
}

export interface RuleDocumentData {
  ruleId?: string;
  canonicalKey?: string;
  title?: string;
  category?: RuleCategory;
  priority?: number;
  required?: boolean;
  kind?: RuleKind;
  appliesTo?: AgentType[];
  preferenceKey?: string;
  preferenceValue?: string | boolean | number;
  body: string;
}

export function parseRuleDocument(content: string): ParsedRuleDocument {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return {
      body: content,
      metadata: {},
    };
  }

  const closingMarker = '\n---\n';
  const endIndex = normalized.indexOf(closingMarker, 4);
  if (endIndex === -1) {
    return {
      body: content,
      metadata: {},
    };
  }

  const rawFrontmatter = normalized.slice(4, endIndex);
  const rawBody = normalized.slice(endIndex + closingMarker.length);

  try {
    const parsed = (yaml.load(rawFrontmatter) ?? {}) as Record<string, unknown>;
    return {
      body: rawBody,
      metadata: {
        ruleId: toOptionalString(parsed.ruleId),
        canonicalKey: toOptionalString(parsed.canonicalKey),
        title: toOptionalString(parsed.title),
        category: toOptionalRuleCategory(parsed.category),
        priority: typeof parsed.priority === 'number' ? parsed.priority : undefined,
        required: typeof parsed.required === 'boolean' ? parsed.required : undefined,
        kind: toOptionalRuleKind(parsed.kind),
        appliesTo: toOptionalAgentList(parsed.appliesTo),
        preferenceKey: toOptionalString(parsed.preferenceKey),
        preferenceValue: toOptionalPreferenceValue(parsed.preferenceValue),
      },
    };
  } catch {
    return {
      body: content,
      metadata: {},
    };
  }
}

export function serializeRuleDocument(data: RuleDocumentData): string {
  const frontmatter: Record<string, unknown> = {};

  if (data.ruleId) frontmatter.ruleId = data.ruleId;
  if (data.canonicalKey) frontmatter.canonicalKey = data.canonicalKey;
  if (data.title) frontmatter.title = data.title;
  if (data.category) frontmatter.category = data.category;
  if (typeof data.priority === 'number') frontmatter.priority = data.priority;
  if (typeof data.required === 'boolean') frontmatter.required = data.required;
  if (data.kind) frontmatter.kind = data.kind;
  if (data.appliesTo && data.appliesTo.length > 0) frontmatter.appliesTo = data.appliesTo;
  if (data.preferenceKey) frontmatter.preferenceKey = data.preferenceKey;
  if (typeof data.preferenceValue !== 'undefined') frontmatter.preferenceValue = data.preferenceValue;

  const body = data.body ?? '';
  if (Object.keys(frontmatter).length === 0) {
    return body.trimStart();
  }

  const frontmatterYaml = yaml.dump(frontmatter, {
    indent: 2,
    lineWidth: -1,
    quotingType: '"',
    forceQuotes: false,
  }).trimEnd();

  return `---\n${frontmatterYaml}\n---\n${body.trimStart()}`;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toOptionalRuleCategory(value: unknown): RuleCategory | undefined {
  return value === 'style' || value === 'safety' || value === 'workflow' || value === 'tooling' || value === 'output'
    ? value
    : undefined;
}

function toOptionalRuleKind(value: unknown): RuleKind | undefined {
  return value === 'instruction' || value === 'preference' || value === 'guardrail'
    ? value
    : undefined;
}

function toOptionalAgentList(value: unknown): AgentType[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const agents = value.filter((entry): entry is AgentType => typeof entry === 'string');
  return agents.length > 0 ? agents : undefined;
}

function toOptionalPreferenceValue(value: unknown): string | boolean | number | undefined {
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
    return value;
  }

  return undefined;
}
