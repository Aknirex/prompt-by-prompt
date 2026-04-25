import { AgentType } from '../types/agent';
import {
  ExecutionContextPayload,
  ExecutionEnvelope,
  ExecutionTarget,
  ResolvedExecution,
} from '../types/execution';
import { EffectivePolicy } from '../types/rule';

export type PayloadPreviewInput = Pick<
  ResolvedExecution,
  'target' | 'behavior' | 'envelope' | 'dispatchText'
>;

export class PayloadComposer {
  buildDispatchText(envelope: ExecutionEnvelope, target: ExecutionTarget): string {
    if (target.kind === 'agent') {
      return this.buildAgentDispatchText(envelope, target.agentType);
    }

    return this.buildGenericDispatchText(envelope, 'Segmented envelope bundle');
  }

  buildPreviewText(resolvedExecution: PayloadPreviewInput): string {
    const sections = [
      '[Dispatch Target]',
      `- target: ${this.formatTargetLabel(resolvedExecution.target)}`,
      `- behavior: ${resolvedExecution.behavior ?? 'default'}`,
      `- injection: ${resolvedExecution.envelope.metadata.injectionMode}`,
    ];

    if (resolvedExecution.envelope.policy.packId) {
      sections.push('');
      sections.push('[Effective Policy]');
      sections.push(`- pack: ${resolvedExecution.envelope.policy.packId}`);
      sections.push(`- profile: ${resolvedExecution.envelope.policy.profileId ?? 'none'}`);
      sections.push(`- declaredVersion: ${resolvedExecution.envelope.policy.declaredVersion ?? 'n/a'}`);
      sections.push(`- resolvedVersion: ${
        resolvedExecution.envelope.policy.resolvedVersion ??
        resolvedExecution.envelope.policy.declaredVersion ??
        'n/a'
      }`);
      sections.push(`- binding: ${resolvedExecution.envelope.policy.bindingSource ?? 'implicit'}`);
    }

    if (resolvedExecution.envelope.policy.preferences.length > 0) {
      sections.push('', '[Preferences]');
      for (const preference of resolvedExecution.envelope.policy.preferences) {
        sections.push(`- ${preference.key}: ${preference.value}`);
      }
    }

    if (resolvedExecution.envelope.policy.guardrails.length > 0) {
      sections.push('', '[Guardrails]');
      for (const guardrail of resolvedExecution.envelope.policy.guardrails) {
        sections.push(`- ${guardrail.text}`);
      }
    }

    sections.push('', '[Environment Context]');
    sections.push(...this.buildEnvironmentLines(resolvedExecution.envelope.context));
    sections.push('', '[Editor Context]');
    sections.push(...this.buildEditorLines(resolvedExecution.envelope.context));
    sections.push('', '[Actual Payload]', resolvedExecution.dispatchText);
    return sections.join('\n');
  }

  formatTargetLabel(target: ExecutionTarget): string {
    if (target.kind === 'agent') {
      return target.agentType;
    }

    return target.kind;
  }

  private buildGenericDispatchText(envelope: ExecutionEnvelope, strategyName: string): string {
    const sections: string[] = [];

    sections.push(`[Dispatch Strategy]\n${strategyName}`);
    sections.push(`[Policy]\n${this.buildPolicyLines(envelope.policy).join('\n')}`);

    if (envelope.policy.preferences.length > 0) {
      sections.push(`[Preferences]\n${envelope.policy.preferences.map((preference) =>
        `- ${preference.key}: ${preference.value}`
      ).join('\n')}`);
    }

    if (envelope.policy.guardrails.length > 0) {
      sections.push(`[Guardrails]\n${envelope.policy.guardrails.map((guardrail) =>
        `- ${guardrail.text}`
      ).join('\n')}`);
    }

    if (envelope.policy.rules.length > 0) {
      sections.push(
        `[Rules]\n${envelope.policy.rules.map((rule) =>
          `- ${rule.title} (${rule.source})\n  Why active: ${rule.reason}\n${this.indentBlock(rule.body, 2)}`
        ).join('\n\n')}`
      );
    }

    sections.push(`[Environment]\n${this.buildEnvironmentLines(envelope.context).join('\n')}`);
    sections.push(`[Editor Context]\n${this.buildEditorLines(envelope.context).join('\n')}`);
    sections.push(`[Task]\n${envelope.task.renderedPrompt.trim()}`);

    if (envelope.metadata.notes.length > 0) {
      sections.push(`[Policy Notes]\n${envelope.metadata.notes.map((note) => `- ${note}`).join('\n')}`);
    }

    if (envelope.metadata.conflicts.length > 0) {
      sections.push(`[Policy Conflicts]\n${envelope.metadata.conflicts.map((conflict) =>
        `- ${conflict}`
      ).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private buildAgentDispatchText(envelope: ExecutionEnvelope, agentType: AgentType): string {
    switch (agentType) {
      case 'copilot':
        return this.buildCopilotDispatchText(envelope);
      case 'cline':
      case 'roo-code':
      case 'codex':
        return this.buildTaskOrientedDispatchText(envelope, agentType);
      case 'continue':
      case 'cursor':
      case 'kilo-code':
      case 'gemini':
      case 'tongyi':
        return this.buildChatDispatchText(envelope, agentType);
      default:
        return this.buildGenericDispatchText(envelope, `Generic agent bundle for ${agentType}`);
    }
  }

  private buildTaskOrientedDispatchText(envelope: ExecutionEnvelope, agentType: AgentType): string {
    const sections: string[] = [
      `[Dispatch Strategy]\nTask-oriented bundle for ${agentType}`,
      `[Policy]\n${this.buildPolicyLines(envelope.policy).join('\n')}`,
    ];

    if (envelope.policy.guardrails.length > 0) {
      sections.push(`[Guardrails]\n${envelope.policy.guardrails.map((guardrail) =>
        `- ${guardrail.text}`
      ).join('\n')}`);
    }

    if (envelope.policy.rules.length > 0) {
      sections.push(
        `[Rules]\n${envelope.policy.rules.map((rule) =>
          `- ${rule.title} (${rule.source})\n  Why active: ${rule.reason}\n${this.indentBlock(rule.body, 2)}`
        ).join('\n\n')}`
      );
    }

    sections.push(`[Environment]\n${this.buildEnvironmentLines(envelope.context).join('\n')}`);
    sections.push(`[Editor Context]\n${this.buildEditorLines(envelope.context).join('\n')}`);
    sections.push(`[Task]\n${envelope.task.renderedPrompt.trim()}`);

    if (envelope.metadata.conflicts.length > 0) {
      sections.push(`[Conflicts]\n${envelope.metadata.conflicts.map((conflict) => `- ${conflict}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  private buildCopilotDispatchText(envelope: ExecutionEnvelope): string {
    const parts: string[] = [
      `Policy:\n${this.buildPolicyLines(envelope.policy).join('\n')}`,
    ];

    if (envelope.policy.rules.length > 0) {
      parts.push(
        `Rules:\n${envelope.policy.rules.map((rule) => `- ${rule.title}: ${rule.reason}`).join('\n')}`
      );
    }

    parts.push(`Environment:\n${this.buildEnvironmentLines(envelope.context).join('\n')}`);
    parts.push(`Context:\n${this.buildEditorLines(envelope.context).join('\n')}`);
    parts.push(`Task:\n${envelope.task.renderedPrompt.trim()}`);
    return parts.join('\n\n');
  }

  private buildChatDispatchText(envelope: ExecutionEnvelope, agentType: AgentType): string {
    const sections: string[] = [
      `[Dispatch Strategy]\nChat bundle for ${agentType}`,
      `[Policy]\n${this.buildPolicyLines(envelope.policy).join('\n')}`,
    ];

    if (envelope.policy.rules.length > 0) {
      sections.push(
        `[Active Rules]\n${envelope.policy.rules.map((rule) =>
          `- ${rule.title}\n  Why active: ${rule.reason}`
        ).join('\n')}`
      );
    }

    sections.push(`[Environment]\n${this.buildEnvironmentLines(envelope.context).join('\n')}`);
    sections.push(`[Editor Context]\n${this.buildEditorLines(envelope.context).join('\n')}`);
    sections.push(`[Task]\n${envelope.task.renderedPrompt.trim()}`);
    return sections.join('\n\n');
  }

  private buildEnvironmentLines(context: ExecutionContextPayload): string[] {
    return [
      `- os: ${context.environment.os || '(none)'}`,
      `- shell: ${context.environment.shell || '(none)'}`,
      `- locale: ${context.environment.locale || '(none)'}`,
    ];
  }

  private buildEditorLines(context: ExecutionContextPayload): string[] {
    const contextLines = [
      `- project: ${context.editor.project || '(none)'}`,
      `- file: ${context.editor.file || '(none)'}`,
      `- language: ${context.editor.language || '(none)'}`,
      `- line: ${context.editor.line ?? 0}`,
      `- column: ${context.editor.column ?? 0}`,
    ];

    if (context.editor.selection?.trim()) {
      contextLines.push(`- selection: ${this.truncate(context.editor.selection.trim(), 200)}`);
    }

    return contextLines;
  }

  private indentBlock(value: string, spaces: number): string {
    const prefix = ' '.repeat(spaces);
    return value.split('\n').map((line) => `${prefix}${line}`).join('\n');
  }

  private truncate(value: string, maxLength: number): string {
    return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
  }

  private buildPolicyLines(policy: EffectivePolicy): string[] {
    const lines = [
      `- profile: ${policy.profileId ?? '(none)'}`,
      `- binding: ${policy.bindingSource ?? 'implicit'}`,
    ];

    if (policy.packId) {
      lines.push(`- pack: ${policy.packId}`);
    }
    if (policy.resolvedVersion || policy.declaredVersion) {
      lines.push(`- version: ${policy.resolvedVersion ?? policy.declaredVersion}`);
    }

    return lines;
  }
}
