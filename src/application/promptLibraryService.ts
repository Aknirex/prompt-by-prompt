import { PromptLibraryItem, PromptSource } from '../domain/prompt';
import { PromptRepository, PromptRepositoryDiagnostic } from './promptRepository';

export type PromptLibrarySourceGroup = 'personal' | 'workspace' | 'shared' | 'builtin';

export interface PromptLibraryEntry {
  key: string;
  item: PromptLibraryItem;
  sourceGroup: PromptLibrarySourceGroup;
}

export interface PromptLibrarySnapshot {
  entries: PromptLibraryEntry[];
  diagnostics: PromptRepositoryDiagnostic[];
  generatedAt: string;
}

export interface PromptSearchOptions {
  query?: string;
  sourceGroups?: PromptLibrarySourceGroup[];
  includeBody?: boolean;
  limit?: number;
}

export class PromptLibraryService {
  constructor(private readonly repositories: PromptRepository[]) {}

  async loadSnapshot(now: Date = new Date()): Promise<PromptLibrarySnapshot> {
    const entries: PromptLibraryEntry[] = [];
    const diagnostics: PromptRepositoryDiagnostic[] = [];

    for (const repository of this.repositories) {
      try {
        const items = await repository.list();
        entries.push(...items.map((item) => this.toEntry(repository.id, item)));
      } catch (error) {
        diagnostics.push({
          repositoryId: repository.id,
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      entries: this.sortForLibrary(entries),
      diagnostics,
      generatedAt: now.toISOString(),
    };
  }

  search(snapshot: PromptLibrarySnapshot, options: PromptSearchOptions): PromptLibraryEntry[] {
    const sourceGroups = new Set(options.sourceGroups ?? []);
    const terms = normalizeText(options.query ?? '')
      .split(' ')
      .map((term) => term.trim())
      .filter(Boolean);

    const scored = snapshot.entries
      .filter((entry) => sourceGroups.size === 0 || sourceGroups.has(entry.sourceGroup))
      .flatMap((entry) => {
        const score = this.scoreEntry(entry, terms, options.includeBody === true);
        return score > 0 ? [{ entry, score }] : [];
      })
      .sort((left, right) =>
        right.score - left.score ||
        compareEntryPriority(left.entry, right.entry) ||
        left.entry.item.prompt.title.localeCompare(right.entry.item.prompt.title)
      )
      .map((scoredEntry) => scoredEntry.entry);

    return typeof options.limit === 'number'
      ? scored.slice(0, Math.max(0, options.limit))
      : scored;
  }

  getFavorites(snapshot: PromptLibrarySnapshot): PromptLibraryEntry[] {
    return snapshot.entries.filter((entry) => entry.item.prompt.metadata.favorite === true);
  }

  getRecents(snapshot: PromptLibrarySnapshot, limit = 10): PromptLibraryEntry[] {
    return snapshot.entries
      .filter((entry) => Boolean(entry.item.prompt.metadata.lastUsedAt))
      .sort((left, right) =>
        parseTime(right.item.prompt.metadata.lastUsedAt) - parseTime(left.item.prompt.metadata.lastUsedAt) ||
        left.item.prompt.title.localeCompare(right.item.prompt.title)
      )
      .slice(0, Math.max(0, limit));
  }

  groupBySource(snapshot: PromptLibrarySnapshot): Map<PromptLibrarySourceGroup, PromptLibraryEntry[]> {
    const groups = new Map<PromptLibrarySourceGroup, PromptLibraryEntry[]>();

    for (const entry of snapshot.entries) {
      const existing = groups.get(entry.sourceGroup) ?? [];
      existing.push(entry);
      groups.set(entry.sourceGroup, existing);
    }

    return groups;
  }

  private toEntry(repositoryId: string, item: PromptLibraryItem): PromptLibraryEntry {
    const sourceGroup = toSourceGroup(item.source);
    return {
      key: `${repositoryId}:${sourceGroup}:${item.prompt.id}`,
      item,
      sourceGroup,
    };
  }

  private sortForLibrary(entries: PromptLibraryEntry[]): PromptLibraryEntry[] {
    return [...entries].sort((left, right) =>
      compareEntryPriority(left, right) ||
      left.item.prompt.title.localeCompare(right.item.prompt.title)
    );
  }

  private scoreEntry(entry: PromptLibraryEntry, terms: string[], includeBody: boolean): number {
    if (terms.length === 0) {
      return 1;
    }

    const prompt = entry.item.prompt;
    const searchable = [
      prompt.title,
      prompt.description,
      prompt.category ?? '',
      prompt.tags.join(' '),
      sourceLabel(entry.sourceGroup),
      includeBody ? prompt.body : '',
    ].map(normalizeText);

    let score = 0;
    for (const term of terms) {
      const title = normalizeText(prompt.title);
      const tags = prompt.tags.map(normalizeText);

      if (title === term) {
        score += 100;
      } else if (title.startsWith(term)) {
        score += 60;
      } else if (title.includes(term)) {
        score += 40;
      }

      if (tags.includes(term)) {
        score += 35;
      } else if (tags.some((tag) => tag.includes(term))) {
        score += 20;
      }

      if (normalizeText(prompt.description).includes(term)) {
        score += 15;
      }

      if (normalizeText(prompt.category ?? '').includes(term)) {
        score += 10;
      }

      if (includeBody && normalizeText(prompt.body).includes(term)) {
        score += 5;
      }

      if (!searchable.some((value) => value.includes(term))) {
        return 0;
      }
    }

    if (prompt.metadata.favorite === true) {
      score += 8;
    }

    if (prompt.metadata.lastUsedAt) {
      score += 4;
    }

    return score;
  }
}

function compareEntryPriority(left: PromptLibraryEntry, right: PromptLibraryEntry): number {
  const favoriteDelta = Number(right.item.prompt.metadata.favorite === true) - Number(left.item.prompt.metadata.favorite === true);
  if (favoriteDelta !== 0) {
    return favoriteDelta;
  }

  const recentDelta = parseTime(right.item.prompt.metadata.lastUsedAt) - parseTime(left.item.prompt.metadata.lastUsedAt);
  if (recentDelta !== 0) {
    return recentDelta;
  }

  return sourceRank(left.sourceGroup) - sourceRank(right.sourceGroup);
}

function toSourceGroup(source: PromptSource): PromptLibrarySourceGroup {
  switch (source.kind) {
    case 'personal':
      return 'personal';
    case 'workspace':
      return 'workspace';
    case 'shared':
      return 'shared';
    case 'builtin':
    default:
      return 'builtin';
  }
}

function sourceRank(sourceGroup: PromptLibrarySourceGroup): number {
  switch (sourceGroup) {
    case 'personal':
      return 0;
    case 'workspace':
      return 1;
    case 'shared':
      return 2;
    case 'builtin':
    default:
      return 3;
  }
}

function sourceLabel(sourceGroup: PromptLibrarySourceGroup): string {
  switch (sourceGroup) {
    case 'personal':
      return 'personal';
    case 'workspace':
      return 'workspace project';
    case 'shared':
      return 'shared library team';
    case 'builtin':
    default:
      return 'built in builtin';
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, ' ').trim();
}

function parseTime(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

