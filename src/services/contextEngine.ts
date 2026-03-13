/**
 * Context Engine Service
 * Extracts editor context and renders templates
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as Handlebars from 'handlebars';
import { EditorContext, PromptTemplate, PromptVariable } from '../types/prompt';

const execAsync = promisify(exec);

export class ContextEngine {
  private readonly builtinVariables: string[] = [
    'selection',
    'filepath',
    'file_content',
    'lang',
    'project_name',
    'git_commit_diff',
    'line_number',
    'column_number'
  ];

  constructor() {
    // Register Handlebars helpers
    this.registerHandlebarsHelpers();
  }

  /**
   * Extract context from current VS Code editor state
   */
  async extractContext(): Promise<EditorContext> {
    const editor = vscode.window.activeTextEditor;
    const workspaceFolders = vscode.workspace.workspaceFolders;

    // Default context
    const context: EditorContext = {
      selection: '',
      filepath: '',
      file_content: '',
      lang: '',
      project_name: '',
      line_number: 0,
      column_number: 0
    };

    if (!editor) {
      return context;
    }

    const document = editor.document;
    const selection = editor.selection;

    // Extract selection
    if (!selection.isEmpty) {
      context.selection = document.getText(selection);
    } else {
      // If no selection, get current line
      const currentLine = selection.active.line;
      context.selection = document.lineAt(currentLine).text;
    }

    // Extract file path (relative to workspace)
    if (workspaceFolders && workspaceFolders.length > 0) {
      const workspaceRoot = workspaceFolders[0].uri.fsPath;
      context.filepath = path.relative(workspaceRoot, document.uri.fsPath);
      context.project_name = path.basename(workspaceRoot);
    } else {
      context.filepath = document.uri.fsPath;
      context.project_name = path.basename(path.dirname(document.uri.fsPath));
    }

    // Extract file content
    context.file_content = document.getText();

    // Extract language
    context.lang = this.getLanguageId(document.languageId);

    // Extract cursor position
    context.line_number = selection.active.line + 1; // 1-indexed
    context.column_number = selection.active.character + 1; // 1-indexed

    // Extract git diff (optional)
    try {
      context.git_commit_diff = await this.getGitDiff();
    } catch {
      // Git diff is optional, ignore errors
    }

    return context;
  }

  /**
   * Get language identifier for prompts
   */
  private getLanguageId(vscodeLang: string): string {
    const languageMap: Record<string, string> = {
      'typescript': 'typescript',
      'typescriptreact': 'typescript',
      'javascript': 'javascript',
      'javascriptreact': 'javascript',
      'python': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'csharp': 'csharp',
      'go': 'go',
      'rust': 'rust',
      'ruby': 'ruby',
      'php': 'php',
      'swift': 'swift',
      'kotlin': 'kotlin',
      'scala': 'scala',
      'sql': 'sql',
      'json': 'json',
      'yaml': 'yaml',
      'markdown': 'markdown',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'less': 'less',
      'shell': 'bash',
      'bash': 'bash',
      'powershell': 'powershell',
      'dockerfile': 'dockerfile',
      'dockercompose': 'yaml'
    };

    return languageMap[vscodeLang] || vscodeLang;
  }

  /**
   * Get git diff for current changes
   */
  private async getGitDiff(): Promise<string> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return '';
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;
    
    try {
      const { stdout } = await execAsync('git diff', {
        cwd: workspaceRoot,
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });
      return stdout;
    } catch {
      return '';
    }
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    // Helper for conditional checks
    Handlebars.registerHelper('eq', (a: unknown, b: unknown) => {
      return a === b;
    });

    Handlebars.registerHelper('ne', (a: unknown, b: unknown) => {
      return a !== b;
    });

    // Helper for string operations
    Handlebars.registerHelper('lowercase', (str: string) => {
      return str ? str.toLowerCase() : '';
    });

    Handlebars.registerHelper('uppercase', (str: string) => {
      return str ? str.toUpperCase() : '';
    });

    Handlebars.registerHelper('capitalize', (str: string) => {
      if (!str) { return ''; }
      return str.charAt(0).toUpperCase() + str.slice(1);
    });

    // Helper for array operations
    Handlebars.registerHelper('join', (arr: string[], separator: string) => {
      return Array.isArray(arr) ? arr.join(separator || ', ') : '';
    });

    // Helper for default values
    Handlebars.registerHelper('default', (value: unknown, defaultValue: unknown) => {
      return value || defaultValue;
    });
  }

  /**
   * Render a prompt template with context
   */
  async renderTemplate(
    template: PromptTemplate,
    context: EditorContext,
    customVariables?: Record<string, string>
  ): Promise<string> {
    // Combine context with custom variables
    const variables: Record<string, unknown> = {
      ...context,
      ...customVariables
    };

    // Compile and render the template
    const compiledTemplate = Handlebars.compile(template.template);
    return compiledTemplate(variables);
  }

  /**
   * Get missing required variables for a prompt
   */
  getMissingVariables(
    template: PromptTemplate,
    context: EditorContext
  ): PromptVariable[] {
    if (!template.variables) {
      return [];
    }

    const missing: PromptVariable[] = [];

    for (const variable of template.variables) {
      // Skip if it's a builtin variable
      if (this.builtinVariables.includes(variable.name)) {
        continue;
      }

      // Check if required and not provided
      if (variable.required) {
        const value = context[variable.name as keyof EditorContext];
        if (value === undefined || value === '') {
          missing.push(variable);
        }
      }
    }

    return missing;
  }

  /**
   * Extract variable names from template string
   */
  extractTemplateVariables(templateString: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const variables: Set<string> = new Set();
    let match;

    while ((match = regex.exec(templateString)) !== null) {
      const variable = match[1].trim();
      // Skip helpers and operators
      if (!variable.includes('(') && !variable.includes(' ')) {
        variables.add(variable);
      }
    }

    return Array.from(variables);
  }

  /**
   * Validate that all required variables are present
   */
  validateVariables(
    template: PromptTemplate,
    providedVariables: Record<string, unknown>
  ): { valid: boolean; missing: string[] } {
    const missing: string[] = [];

    if (template.variables) {
      for (const variable of template.variables) {
        if (variable.required) {
          const value = providedVariables[variable.name];
          if (value === undefined || value === '') {
            missing.push(variable.name);
          }
        }
      }
    }

    return {
      valid: missing.length === 0,
      missing
    };
  }
}
