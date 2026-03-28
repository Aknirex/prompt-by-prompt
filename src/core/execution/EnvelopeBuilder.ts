import { EditorContext, PromptTemplate } from '../../types/prompt';
import {
  ExecutionContextPayload,
  ExecutionEnvelope,
  ExecutionMetadata,
} from '../../types/execution';
import { EffectivePolicy, ResolvedRuleSet } from '../../types/rule';

export class EnvelopeBuilder {
  build(
    prompt: PromptTemplate,
    renderedPrompt: string,
    variables: Record<string, string>,
    policy: EffectivePolicy,
    editorContext: EditorContext,
    resolvedRules: ResolvedRuleSet
  ): ExecutionEnvelope {
    return {
      task: {
        promptId: prompt.id,
        promptName: prompt.name,
        renderedPrompt,
        variables,
      },
      policy,
      context: this.buildContext(editorContext),
      metadata: this.buildMetadata(resolvedRules),
    };
  }

  private buildContext(ctx: EditorContext): ExecutionContextPayload {
    const shellPath = process.platform === 'win32'
      ? (process.env.ComSpec ?? process.env.SHELL ?? '')
      : (process.env.SHELL ?? '');
    const shell = shellPath.split(/[\/\\]/).filter(Boolean).pop() ?? '';

    return {
      environment: {
        os: process.platform === 'win32' ? 'Windows' : process.platform,
        shell,
        locale: process.env.LANG ?? process.env.LANGUAGE ?? '',
      },
      editor: {
        project: ctx.project_name,
        file: ctx.filepath,
        language: ctx.lang,
        line: ctx.line_number,
        column: ctx.column_number,
        selection: ctx.selection,
      },
    };
  }

  private buildMetadata(resolvedRules: ResolvedRuleSet): ExecutionMetadata {
    return {
      injectionMode: resolvedRules.injectionMode === 'structured-context'
        ? 'native-structured'
        : 'segmented-text',
      bindingSource: resolvedRules.binding?.source,
      notes: resolvedRules.notes,
      conflicts: resolvedRules.conflicts.map(c => c.message),
    };
  }
}
