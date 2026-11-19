export const TASK_PACK_VERSION = 1;

export type TaskIntent = 'implement' | 'fix' | 'refactor' | 'review' | 'test' | 'docs' | 'custom';

export type ContextKind = 'selection' | 'current-file' | 'file' | 'git-diff' | 'diagnostics' | 'note' | 'reference';

export interface ContextItem {
  id: string;
  kind: ContextKind;
  label: string;
  source?: string;
  language?: string;
  content?: string;
  summary?: string;
  charCount: number;
  truncated: boolean;
}

export interface TaskPack {
  version: typeof TASK_PACK_VERSION;
  id: string;
  title: string;
  intent: TaskIntent;
  goal: string;
  contextItems: ContextItem[];
  constraints: string[];
  acceptanceCriteria: string[];
  verificationCommands: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskPackInput {
  id: string;
  title: string;
  intent: TaskIntent;
  goal: string;
  now?: Date;
}

export function createTaskPack(input: CreateTaskPackInput): TaskPack {
  const timestamp = (input.now ?? new Date()).toISOString();
  return {
    version: TASK_PACK_VERSION,
    id: input.id,
    title: input.title.trim(),
    intent: input.intent,
    goal: input.goal.trim(),
    contextItems: [],
    constraints: defaultConstraints(),
    acceptanceCriteria: defaultAcceptanceCriteria(input.intent),
    verificationCommands: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function touchTaskPack(pack: TaskPack, now = new Date()): TaskPack {
  return {
    ...pack,
    updatedAt: now.toISOString(),
  };
}

export function addContextItems(pack: TaskPack, items: ContextItem[], now = new Date()): TaskPack {
  const existingIds = new Set(pack.contextItems.map((item) => item.id));
  const nextItems = [...pack.contextItems];

  for (const item of items) {
    if (!existingIds.has(item.id)) {
      nextItems.push(item);
      existingIds.add(item.id);
    }
  }

  return {
    ...pack,
    contextItems: nextItems,
    updatedAt: now.toISOString(),
  };
}

export function removeContextItem(pack: TaskPack, itemId: string, now = new Date()): TaskPack {
  return {
    ...pack,
    contextItems: pack.contextItems.filter((item) => item.id !== itemId),
    updatedAt: now.toISOString(),
  };
}

export function replaceTaskPackGuidance(
  pack: TaskPack,
  updates: Partial<Pick<TaskPack, 'goal' | 'constraints' | 'acceptanceCriteria' | 'verificationCommands'>>,
  now = new Date()
): TaskPack {
  return {
    ...pack,
    goal: normalizeText(updates.goal) ?? pack.goal,
    constraints: normalizeList(updates.constraints) ?? pack.constraints,
    acceptanceCriteria: normalizeList(updates.acceptanceCriteria) ?? pack.acceptanceCriteria,
    verificationCommands: normalizeList(updates.verificationCommands) ?? pack.verificationCommands,
    updatedAt: now.toISOString(),
  };
}

export function trimContentToBudget(content: string, budgetChars: number): { content: string; truncated: boolean } {
  const normalizedBudget = Math.max(0, Math.floor(budgetChars));
  if (content.length <= normalizedBudget) {
    return { content, truncated: false };
  }

  if (normalizedBudget <= 80) {
    return { content: content.slice(0, normalizedBudget), truncated: true };
  }

  const marker = '\n\n[Content truncated by Prompt by Prompt]\n';
  const keep = Math.max(0, normalizedBudget - marker.length);
  const head = Math.ceil(keep * 0.65);
  const tail = keep - head;
  return {
    content: `${content.slice(0, head)}${marker}${content.slice(content.length - tail)}`,
    truncated: true,
  };
}

export function createContextItem(input: {
  id: string;
  kind: ContextKind;
  label: string;
  content?: string;
  source?: string;
  language?: string;
  budgetChars: number;
  summary?: string;
}): ContextItem {
  const rawContent = input.content ?? '';
  const trimmed = trimContentToBudget(rawContent, input.budgetChars);
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    source: input.source,
    language: input.language,
    content: trimmed.content,
    summary: input.summary,
    charCount: rawContent.length,
    truncated: trimmed.truncated,
  };
}

export function intentLabel(intent: TaskIntent): string {
  switch (intent) {
    case 'implement':
      return 'Implement';
    case 'fix':
      return 'Fix';
    case 'refactor':
      return 'Refactor';
    case 'review':
      return 'Review';
    case 'test':
      return 'Test';
    case 'docs':
      return 'Docs';
    case 'custom':
      return 'Custom';
  }
}

function defaultConstraints(): string[] {
  return [
    'Inspect the relevant files before changing behavior.',
    'Keep changes scoped to the requested task.',
    'Preserve existing public APIs unless the task explicitly requires changing them.',
    'Do not rewrite unrelated code.',
  ];
}

function defaultAcceptanceCriteria(intent: TaskIntent): string[] {
  switch (intent) {
    case 'review':
      return [
        'Findings are prioritized by severity.',
        'Each finding includes a concrete file or behavior reference.',
        'Residual risks or missing test coverage are called out.',
      ];
    case 'docs':
      return [
        'Documentation matches the current implementation.',
        'Examples are accurate and runnable when applicable.',
        'Terminology is consistent with the project.',
      ];
    case 'test':
      return [
        'Tests cover the requested behavior and important edge cases.',
        'Tests fail before the fix when practical.',
        'The existing test style is preserved.',
      ];
    default:
      return [
        'The requested behavior is implemented end to end.',
        'Relevant checks pass or any blocked checks are explained.',
        'The final response summarizes changed behavior and verification.',
      ];
  }
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function normalizeList(value: string[] | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.map((entry) => entry.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}
