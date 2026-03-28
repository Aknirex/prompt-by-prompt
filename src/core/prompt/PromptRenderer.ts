import * as Handlebars from 'handlebars';
import { PromptTemplate, PromptVariable } from '../../types/prompt';
import { EditorContext } from '../../types/prompt';

const BUILTIN_VARIABLES = [
  'selection', 'filepath', 'file_content', 'lang',
  'project_name', 'git_commit_diff', 'line_number', 'column_number',
];

function registerHelpers(): void {
  Handlebars.registerHelper('upper', (s: string) => String(s).toUpperCase());
  Handlebars.registerHelper('lower', (s: string) => String(s).toLowerCase());
  Handlebars.registerHelper('trim', (s: string) => String(s).trim());
  Handlebars.registerHelper('default', (val: unknown, def: unknown) => val ?? def);
}

let helpersRegistered = false;

export class PromptRenderer {
  constructor() {
    if (!helpersRegistered) {
      registerHelpers();
      helpersRegistered = true;
    }
  }

  render(template: string, context: Record<string, unknown>): string {
    try {
      const compiled = Handlebars.compile(template, { noEscape: true });
      return compiled(context);
    } catch (err) {
      throw new Error(`Template render error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  renderPrompt(prompt: PromptTemplate, editorContext: EditorContext, variables: Record<string, string>): string {
    const ctx = { ...editorContext, ...variables };
    return this.render(prompt.template, ctx);
  }

  extractTemplateVariables(template: string): string[] {
    const regex = /\{\{([^}]+)\}\}/g;
    const vars = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = regex.exec(template)) !== null) {
      const v = match[1].trim();
      if (!v.includes('(') && !v.includes(' ')) vars.add(v);
    }
    return Array.from(vars);
  }

  getCustomVariables(prompt: PromptTemplate): PromptVariable[] {
    const templateVars = this.extractTemplateVariables(prompt.template);
    const builtins = new Set(BUILTIN_VARIABLES);
    const defined = new Map((prompt.variables ?? []).map(v => [v.name, v]));
    return templateVars
      .filter(name => !builtins.has(name))
      .map(name => defined.get(name) ?? { name, description: '', type: 'string' as const, required: false });
  }

  getMissingRequired(prompt: PromptTemplate, provided: Record<string, string>): string[] {
    return (prompt.variables ?? [])
      .filter(v => v.required && !provided[v.name])
      .map(v => v.name);
  }
}
