/**
 * Prompt Manager Service
 * Handles file system I/O, CRUD operations, and caching for prompts
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { PromptTemplate, ExtensionConfig } from '../types/prompt';

const GLOBAL_STATE_KEY = 'pbp.globalPrompts';

export class PromptManager {
  private prompts: Map<string, PromptTemplate> = new Map();
  private fileWatcher?: vscode.FileSystemWatcher;
  private onDidChangePrompts: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  
  public readonly onDidChange = this.onDidChangePrompts.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly config: ExtensionConfig
  ) {}

  /**
   * Initialize the manager - scan and watch for prompts
   */
  async initialize(): Promise<void> {
    // Load all prompts
    await this.loadAllPrompts();
    
    // Setup file watcher for workspace prompts
    this.setupFileWatcher();
  }

  /**
   * Load prompts from all sources: workspace, global, and builtin
   */
  private async loadAllPrompts(): Promise<void> {
    this.prompts.clear();
    
    // Load builtin prompts
    await this.loadBuiltinPrompts();
    
    // Load global prompts from VS Code global state
    await this.loadGlobalPrompts();
    
    // Load workspace prompts
    await this.loadWorkspacePrompts();
  }

  /**
   * Load builtin prompts (embedded in extension)
   */
  private async loadBuiltinPrompts(): Promise<void> {
    const builtinPrompts = await this.getBuiltinPrompts();
    for (const prompt of builtinPrompts) {
      prompt.source = 'builtin';
      this.prompts.set(prompt.id, prompt);
    }
  }

  /**
   * Get builtin prompts - these are embedded in the extension
   */
  private async getBuiltinPrompts(): Promise<PromptTemplate[]> {
    // Return a list of builtin prompts
    // These will be loaded from extension's built-in templates
    const builtinPath = path.join(this.context.extensionPath, 'builtins', 'templates');
    
    if (!fs.existsSync(builtinPath)) {
      return [];
    }

    const prompts: PromptTemplate[] = [];
    const files = this.findYamlFiles(builtinPath);
    
    for (const file of files) {
      try {
        const prompt = await this.loadPromptFromFile(file, 'builtin');
        if (prompt) {
          prompts.push(prompt);
        }
      } catch (error) {
        console.error(`Failed to load builtin prompt ${file}:`, error);
      }
    }
    
    return prompts;
  }

  /**
   * Load global prompts from VS Code global state
   */
  private async loadGlobalPrompts(): Promise<void> {
    const globalPrompts = this.context.globalState.get<PromptTemplate[]>(GLOBAL_STATE_KEY, []);
    
    for (const prompt of globalPrompts) {
      prompt.source = 'global';
      this.prompts.set(prompt.id, prompt);
    }
  }

  /**
   * Load prompts from workspace .prompts directory
   */
  private async loadWorkspacePrompts(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const promptsDir = path.join(workspaceRoot, this.config.promptsDir, 'templates');
    
    if (!fs.existsSync(promptsDir)) {
      return;
    }

    const files = this.findYamlFiles(promptsDir);
    
    for (const file of files) {
      try {
        const prompt = await this.loadPromptFromFile(file, 'workspace');
        if (prompt) {
          this.prompts.set(prompt.id, prompt);
        }
      } catch (error) {
        console.error(`Failed to load workspace prompt ${file}:`, error);
      }
    }
  }

  /**
   * Find all YAML files in a directory recursively
   */
  private findYamlFiles(dir: string): string[] {
    const files: string[] = [];
    
    const traverse = (currentDir: string) => {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml'))) {
          files.push(fullPath);
        }
      }
    };
    
    traverse(dir);
    return files;
  }

  /**
   * Load a prompt from a YAML file
   */
  private async loadPromptFromFile(filePath: string, source: 'workspace' | 'global' | 'builtin'): Promise<PromptTemplate | null> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content) as Partial<PromptTemplate>;
      
      if (!parsed.name || !parsed.template) {
        console.warn(`Invalid prompt file ${filePath}: missing required fields`);
        return null;
      }
      
      const prompt: PromptTemplate = {
        id: parsed.id || uuidv4(),
        name: parsed.name,
        description: parsed.description || '',
        category: parsed.category || 'General',
        tags: parsed.tags || [],
        author: parsed.author,
        version: parsed.version || '1.0.0',
        parameters: parsed.parameters,
        variables: parsed.variables,
        template: parsed.template,
        source,
        filePath
      };
      
      return prompt;
    } catch (error) {
      console.error(`Error loading prompt from ${filePath}:`, error);
      return null;
    }
  }

  /**
   * Setup file watcher for workspace prompts directory
   */
  private setupFileWatcher(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const promptsDir = path.join(workspaceRoot, this.config.promptsDir);
    
    if (!fs.existsSync(promptsDir)) {
      // Create the directory if it doesn't exist
      fs.mkdirSync(promptsDir, { recursive: true });
      fs.mkdirSync(path.join(promptsDir, 'templates'), { recursive: true });
    }

    // Watch for changes in .prompts directory
    const pattern = new vscode.RelativePattern(
      workspaceFolders[0],
      `${this.config.promptsDir}/**/*.yaml`
    );
    
    this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);
    
    this.fileWatcher.onDidCreate(async () => {
      await this.loadWorkspacePrompts();
      this.onDidChangePrompts.fire();
    });
    
    this.fileWatcher.onDidChange(async () => {
      await this.loadWorkspacePrompts();
      this.onDidChangePrompts.fire();
    });
    
    this.fileWatcher.onDidDelete(async () => {
      await this.loadWorkspacePrompts();
      this.onDidChangePrompts.fire();
    });
  }

  /**
   * Get all prompts
   */
  getAllPrompts(): PromptTemplate[] {
    return Array.from(this.prompts.values());
  }

  /**
   * Get prompts grouped by category
   */
  getPromptsByCategory(): Map<string, PromptTemplate[]> {
    const grouped = new Map<string, PromptTemplate[]>();
    
    for (const prompt of this.prompts.values()) {
      const category = prompt.category || 'General';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(prompt);
    }
    
    return grouped;
  }

  /**
   * Get a single prompt by ID
   */
  getPrompt(id: string): PromptTemplate | undefined {
    return this.prompts.get(id);
  }

  /**
   * Search prompts by name, description, or tags
   */
  searchPrompts(query: string): PromptTemplate[] {
    const lowerQuery = query.toLowerCase();
    
    return this.getAllPrompts().filter(prompt => 
      prompt.name.toLowerCase().includes(lowerQuery) ||
      prompt.description.toLowerCase().includes(lowerQuery) ||
      prompt.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    );
  }

  /**
   * Create a new prompt
   */
  async createPrompt(prompt: Partial<PromptTemplate>, target: 'workspace' | 'global' = 'workspace'): Promise<PromptTemplate> {
    const newPrompt: PromptTemplate = {
      id: prompt.id || uuidv4(),
      name: prompt.name || 'Untitled Prompt',
      description: prompt.description || '',
      category: prompt.category || 'General',
      tags: prompt.tags || [],
      author: prompt.author,
      version: prompt.version || '1.0.0',
      parameters: prompt.parameters,
      variables: prompt.variables,
      template: prompt.template || '',
      source: target
    };

    // If target is workspace but no workspace is open, fall back to global
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
    
    if (target === 'global' || !hasWorkspace) {
      newPrompt.source = 'global';
      await this.saveGlobalPrompt(newPrompt);
    } else {
      await this.saveWorkspacePrompt(newPrompt);
    }

    this.prompts.set(newPrompt.id, newPrompt);
    this.onDidChangePrompts.fire();
    
    return newPrompt;
  }

  /**
   * Update an existing prompt
   */
  async updatePrompt(id: string, updates: Partial<PromptTemplate>): Promise<PromptTemplate | null> {
    const existing = this.prompts.get(id);
    if (!existing) {
      return null;
    }

    const updated: PromptTemplate = {
      ...existing,
      ...updates,
      id: existing.id, // Preserve ID
      source: existing.source
    };

    if (existing.source === 'global') {
      await this.saveGlobalPrompt(updated);
    } else if (existing.source === 'workspace') {
      await this.saveWorkspacePrompt(updated);
    }

    this.prompts.set(id, updated);
    this.onDidChangePrompts.fire();
    
    return updated;
  }

  /**
   * Delete a prompt
   */
  async deletePrompt(id: string): Promise<boolean> {
    const prompt = this.prompts.get(id);
    if (!prompt) {
      return false;
    }

    if (prompt.source === 'global') {
      await this.deleteGlobalPrompt(id);
    } else if (prompt.source === 'workspace' && prompt.filePath) {
      await this.deleteWorkspacePrompt(prompt.filePath);
    } else {
      return false; // Cannot delete builtin prompts
    }

    this.prompts.delete(id);
    this.onDidChangePrompts.fire();
    
    return true;
  }

  /**
   * Save prompt to global state
   */
  private async saveGlobalPrompt(prompt: PromptTemplate): Promise<void> {
    const globalPrompts = this.context.globalState.get<PromptTemplate[]>(GLOBAL_STATE_KEY, []);
    const index = globalPrompts.findIndex(p => p.id === prompt.id);
    
    if (index >= 0) {
      globalPrompts[index] = prompt;
    } else {
      globalPrompts.push(prompt);
    }
    
    await this.context.globalState.update(GLOBAL_STATE_KEY, globalPrompts);
  }

  /**
   * Delete prompt from global state
   */
  private async deleteGlobalPrompt(id: string): Promise<void> {
    const globalPrompts = this.context.globalState.get<PromptTemplate[]>(GLOBAL_STATE_KEY, []);
    const filtered = globalPrompts.filter(p => p.id !== id);
    await this.context.globalState.update(GLOBAL_STATE_KEY, filtered);
  }

  /**
   * Save prompt to workspace
   */
  private async saveWorkspacePrompt(prompt: PromptTemplate): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      throw new Error('No workspace folder open');
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    const promptsDir = path.join(workspaceRoot, this.config.promptsDir, 'templates');
    
    // Ensure directory exists
    if (!fs.existsSync(promptsDir)) {
      fs.mkdirSync(promptsDir, { recursive: true });
    }

    // Generate filename from prompt name
    const filename = this.sanitizeFilename(prompt.name) + '.yaml';
    const filePath = path.join(promptsDir, filename);
    
    // Convert to YAML
    const yamlContent = this.promptToYaml(prompt);
    
    await fs.promises.writeFile(filePath, yamlContent, 'utf-8');
    prompt.filePath = filePath;
  }

  /**
   * Delete workspace prompt file
   */
  private async deleteWorkspacePrompt(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  }

  /**
   * Convert prompt to YAML string
   */
  private promptToYaml(prompt: PromptTemplate): string {
    const obj: Partial<PromptTemplate> = {
      id: prompt.id,
      name: prompt.name,
      description: prompt.description,
      category: prompt.category,
      tags: prompt.tags,
      author: prompt.author,
      version: prompt.version,
      parameters: prompt.parameters,
      variables: prompt.variables,
      template: prompt.template
    };
    
    return yaml.dump(obj, { 
      indent: 2, 
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false
    });
  }

  /**
   * Sanitize filename
   */
  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Refresh prompts from all sources
   */
  async refresh(): Promise<void> {
    await this.loadAllPrompts();
    this.onDidChangePrompts.fire();
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.fileWatcher?.dispose();
    this.onDidChangePrompts.dispose();
  }
}
