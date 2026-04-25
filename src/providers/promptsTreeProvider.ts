/**
 * Tree View Provider for Prompts
 * Displays the vNext prompt library snapshot in a daily-use shape:
 * Favorites, Recent, then source/category groups.
 */

import * as vscode from 'vscode';
import {
  PromptLibraryEntry,
  PromptLibraryService,
  PromptLibrarySnapshot,
  PromptLibrarySourceGroup,
} from '../application/promptLibraryService';
import { PromptTemplate } from '../types/prompt';
import { t } from '../utils/i18n';

type PromptTreeKind = 'collection' | 'source' | 'category' | 'prompt';
type PromptCollection = 'favorites' | 'recent';

class PromptItem extends vscode.TreeItem {
  constructor(
    public readonly kind: PromptTreeKind,
    options: {
      label: string;
      prompt?: PromptTemplate;
      entryKey?: string;
      sourceGroup?: PromptLibrarySourceGroup;
      category?: string;
      collection?: PromptCollection;
    }
  ) {
    super(
      options.label,
      kind === 'prompt'
        ? vscode.TreeItemCollapsibleState.None
        : vscode.TreeItemCollapsibleState.Collapsed
    );

    this.prompt = options.prompt;
    this.entryKey = options.entryKey;
    this.sourceGroup = options.sourceGroup;
    this.category = options.category;
    this.collection = options.collection;

    if (kind === 'prompt' && options.prompt) {
      this.description = options.prompt.description.substring(0, 50) +
        (options.prompt.description.length > 50 ? '...' : '');
      this.tooltip = this.createTooltip(options.prompt);
      this.contextValue = 'prompt';
      this.iconPath = this.getIconForCategory(options.prompt.category);
      this.command = {
        command: 'pbp.runPrompt',
        title: t('Run Prompt'),
        arguments: [options.prompt],
      };
      return;
    }

    if (kind === 'collection') {
      this.contextValue = 'promptCollection';
      this.iconPath = new vscode.ThemeIcon(options.collection === 'favorites' ? 'star-full' : 'history');
      return;
    }

    if (kind === 'category') {
      this.contextValue = 'category';
      this.iconPath = new vscode.ThemeIcon('folder');
      return;
    }

    this.contextValue = 'source';
    this.iconPath = new vscode.ThemeIcon(this.getIconForSource(options.sourceGroup));
  }

  public readonly prompt?: PromptTemplate;
  public readonly entryKey?: string;
  public readonly sourceGroup?: PromptLibrarySourceGroup;
  public readonly category?: string;
  public readonly collection?: PromptCollection;

  private createTooltip(prompt: PromptTemplate): vscode.MarkdownString {
    const md = new vscode.MarkdownString();

    md.appendMarkdown(`**${prompt.name}**\n\n`);
    md.appendMarkdown(`${prompt.description}\n\n`);

    if (prompt.tags.length > 0) {
      md.appendMarkdown(`**${t('Tags')}:** ${prompt.tags.join(', ')}\n\n`);
    }

    if (prompt.author) {
      md.appendMarkdown(`**${t('Author')}:** ${prompt.author}\n\n`);
    }

    md.appendMarkdown(`**${t('Source')}:** ${prompt.source || t('Unknown')}`);

    return md;
  }

  private getIconForCategory(category?: string): vscode.ThemeIcon {
    const iconMap: Record<string, string> = {
      Development: 'code',
      'Code Analysis': 'search',
      'Code Generation': 'file-code',
      Documentation: 'book',
      Testing: 'beaker',
      Data: 'database',
      General: 'file-text',
    };

    const iconName = iconMap[category || 'General'] || 'file-text';
    return new vscode.ThemeIcon(iconName);
  }

  private getIconForSource(sourceGroup?: PromptLibrarySourceGroup): string {
    switch (sourceGroup) {
      case 'personal':
        return 'account';
      case 'workspace':
        return 'root-folder';
      case 'shared':
        return 'library';
      case 'builtin':
      default:
        return 'package';
    }
  }
}

export class PromptsTreeProvider implements vscode.TreeDataProvider<PromptItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<PromptItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<PromptItem | undefined | null | void> = this.onDidChangeTreeDataEmitter.event;

  private snapshot: PromptLibrarySnapshot | undefined;
  private promptByEntryKey = new Map<string, PromptTemplate>();
  private readonly libraryService = new PromptLibraryService([]);

  setLibrary(snapshot: PromptLibrarySnapshot | undefined, promptByEntryKey: Map<string, PromptTemplate>): void {
    this.snapshot = snapshot;
    this.promptByEntryKey = promptByEntryKey;
    this.refresh();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();
  }

  getTreeItem(element: PromptItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: PromptItem): Thenable<PromptItem[]> {
    if (!this.snapshot) {
      return Promise.resolve([]);
    }

    if (!element) {
      return Promise.resolve([
        ...this.getCollectionItems(),
        ...this.getSourceItems(),
      ]);
    }

    if (element.kind === 'collection' && element.collection) {
      return Promise.resolve(this.getCollectionPromptItems(element.collection));
    }

    if (element.kind === 'source' && element.sourceGroup) {
      return Promise.resolve(this.getCategoryItems(element.sourceGroup));
    }

    if (element.kind === 'category' && element.sourceGroup && element.category) {
      return Promise.resolve(this.getPromptItems(element.sourceGroup, element.category));
    }

    return Promise.resolve([]);
  }

  private getCollectionItems(): PromptItem[] {
    if (!this.snapshot) {
      return [];
    }

    const items: PromptItem[] = [];
    if (this.libraryService.getFavorites(this.snapshot).length > 0) {
      items.push(new PromptItem('collection', {
        label: t('Favorites'),
        collection: 'favorites',
      }));
    }
    if (this.libraryService.getRecents(this.snapshot).length > 0) {
      items.push(new PromptItem('collection', {
        label: t('Recent'),
        collection: 'recent',
      }));
    }

    return items;
  }

  private getCollectionPromptItems(collection: PromptCollection): PromptItem[] {
    if (!this.snapshot) {
      return [];
    }

    const entries = collection === 'favorites'
      ? this.libraryService.getFavorites(this.snapshot)
      : this.libraryService.getRecents(this.snapshot, 10);
    return this.toPromptItems(entries);
  }

  private getSourceItems(): PromptItem[] {
    if (!this.snapshot) {
      return [];
    }

    return Array.from(this.libraryService.groupBySource(this.snapshot).keys())
      .sort((left, right) => sourceRank(left) - sourceRank(right))
      .map((sourceGroup) => new PromptItem('source', {
        label: getSourceLabel(sourceGroup),
        sourceGroup,
      }));
  }

  private getCategoryItems(sourceGroup: PromptLibrarySourceGroup): PromptItem[] {
    const entries = this.getEntriesForSource(sourceGroup);
    const categories = new Set(entries.map((entry) => entry.item.prompt.category || 'General'));

    return Array.from(categories)
      .sort()
      .map((category) => new PromptItem('category', {
        label: category,
        sourceGroup,
        category,
      }));
  }

  private getPromptItems(sourceGroup: PromptLibrarySourceGroup, category: string): PromptItem[] {
    return this.toPromptItems(
      this.getEntriesForSource(sourceGroup)
        .filter((entry) => (entry.item.prompt.category || 'General') === category)
    );
  }

  private getEntriesForSource(sourceGroup: PromptLibrarySourceGroup): PromptLibraryEntry[] {
    if (!this.snapshot) {
      return [];
    }

    return this.snapshot.entries.filter((entry) => entry.sourceGroup === sourceGroup);
  }

  private toPromptItems(entries: PromptLibraryEntry[]): PromptItem[] {
    return entries
      .map((entry) => {
        const prompt = this.promptByEntryKey.get(entry.key);
        if (!prompt) {
          return undefined;
        }

        return new PromptItem('prompt', {
          label: prompt.name,
          prompt,
          entryKey: entry.key,
        });
      })
      .filter((item): item is PromptItem => Boolean(item));
  }
}

function getSourceLabel(sourceGroup: PromptLibrarySourceGroup): string {
  switch (sourceGroup) {
    case 'personal':
      return t('Personal');
    case 'workspace':
      return t('Workspace');
    case 'shared':
      return t('Shared Libraries');
    case 'builtin':
    default:
      return t('Built-in');
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
