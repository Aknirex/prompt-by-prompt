import { ExecutionEnvelope, ExecutionTarget, ExecutionBehavior } from '../../types/execution';
import { AgentType } from '../../types/agent';
import { AgentRegistry } from '../../vscode/agents/AgentRegistry';
import { SendResult } from '../../types/agent';

export class DispatchRouter {
  constructor(private readonly agents: AgentRegistry) {}

  async dispatch(
    dispatchText: string,
    target: ExecutionTarget,
    behavior?: ExecutionBehavior
  ): Promise<SendResult> {
    if (target.kind === 'clipboard') {
      return this.agents.sendToAgent(dispatchText, 'clipboard');
    }
    if (target.kind === 'file') {
      return this.agents.sendToAgent(dispatchText, 'file');
    }
    return this.agents.sendToAgent(dispatchText, target.agentType, { behavior });
  }

  buildDispatchText(envelope: ExecutionEnvelope, target: ExecutionTarget): string {
    const { task, policy } = envelope;

    const parts: string[] = [task.renderedPrompt];

    if (policy.guardrails.length > 0) {
      parts.push('\n---\n**Guardrails**');
      for (const g of policy.guardrails) parts.push(`- ${g.text}`);
    }

    if (policy.rules.length > 0) {
      parts.push('\n---\n**Active Rules**');
      for (const r of policy.rules) {
        parts.push(`### ${r.title}`);
        if (r.body.trim()) parts.push(r.body.trim());
      }
    }

    return parts.join('\n');
  }

  buildPreviewText(envelope: ExecutionEnvelope, target: ExecutionTarget, behavior?: ExecutionBehavior): string {
    const lines: string[] = [
      '# Execution Preview',
      '',
      `**Target**: ${this.describeTarget(target)}`,
      `**Behavior**: ${behavior ?? 'default'}`,
      `**Binding**: ${envelope.policy.bindingSource ?? 'implicit'}`,
      '',
      '## Rendered Prompt',
      '',
      envelope.task.renderedPrompt,
    ];

    if (envelope.policy.guardrails.length > 0) {
      lines.push('', '## Guardrails');
      for (const g of envelope.policy.guardrails) lines.push(`- ${g.text}`);
    }

    if (envelope.policy.rules.length > 0) {
      lines.push('', '## Active Rules');
      for (const r of envelope.policy.rules) {
        lines.push(`### ${r.title}`);
        if (r.body.trim()) lines.push(r.body.trim());
      }
    }

    if (envelope.policy.conflicts.length > 0) {
      lines.push('', '## Conflicts');
      for (const c of envelope.policy.conflicts) lines.push(`- ${c.message}`);
    }

    if (envelope.metadata.notes.length > 0) {
      lines.push('', '## Notes');
      for (const n of envelope.metadata.notes) lines.push(`- ${n}`);
    }

    return lines.join('\n');
  }

  private describeTarget(target: ExecutionTarget): string {
    if (target.kind === 'clipboard') return 'Clipboard';
    if (target.kind === 'file') return 'File';
    return target.agentType;
  }
}
