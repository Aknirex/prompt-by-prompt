import { PromptEntry, PromptLibrarySummary, PromptMetadataMap, summarizeLibrary } from '../domain/prompt';
import {
  PromptStoreDefinition,
  PromptStoreDiagnostic,
  loadPromptStores,
} from '../infrastructure/promptStore';

export interface PromptCatalogSnapshot {
  entries: PromptEntry[];
  diagnostics: PromptStoreDiagnostic[];
  summary: PromptLibrarySummary;
}

export async function loadPromptCatalog(
  stores: PromptStoreDefinition[],
  metadata: PromptMetadataMap = {}
): Promise<PromptCatalogSnapshot> {
  const result = await loadPromptStores(stores, metadata);
  return {
    entries: result.entries,
    diagnostics: result.diagnostics,
    summary: summarizeLibrary(result.entries),
  };
}

export function searchPrompts(entries: PromptEntry[], query: string): PromptEntry[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [...entries];
  }

  const terms = normalized.split(/\s+/).filter(Boolean);
  return entries.filter((entry) => {
    const haystack = [
      entry.prompt.title,
      entry.prompt.description,
      entry.prompt.category,
      entry.prompt.tags.join(' '),
      entry.prompt.body,
      entry.source,
    ].join(' ').toLowerCase();

    return terms.every((term) => haystack.includes(term));
  });
}

