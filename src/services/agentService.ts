/**
 * Agent Service - Manages agent adapters and provides unified interface
 * 
 * This service manages the available agent adapters and provides
 * caching for availability checks.
 */

import * as vscode from 'vscode';
import {
  AgentType,
  AgentAdapter,
  SendResult,
  SendOptions,
  AGENT_EXTENSION_IDS,
  isExtensionAvailable,
} from '../types/agent';

// ============================================================================
// Clipboard Adapter (Always available fallback)
// ============================================================================

/**
 * ClipboardAdapter - Universal fallback that copies prompt to clipboard
 */
export class ClipboardAdapter implements AgentAdapter {
  readonly name = 'Copy to Clipboard';
  readonly type: AgentType = 'clipboard';
  readonly capabilities = {
    canSendDirectly: false,
    canOpenPanel: false,
    requiresConfirmation: true,
  };

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied to clipboard!');
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('clipboard');
  }
}

// ============================================================================
// Cline Adapter
// ============================================================================

/**
 * ClineAdapter - Integration with Cline extension
 */
export class ClineAdapter implements AgentAdapter {
  readonly name = 'Cline';
  readonly type: AgentType = 'cline';
  readonly capabilities = {
    canSendDirectly: true,
    canOpenPanel: true,
    requiresConfirmation: false,
  };

  // Multiple command candidates with different argument formats
  private static readonly CANDIDATE_INVOCATIONS: Array<{
    cmd: string;
    args: (p: string) => unknown[];
  }> = [
    { cmd: 'cline.newTask', args: (p: string) => [p] },
    { cmd: 'cline.newTask', args: (p: string) => [{ task: p }] },
    { cmd: 'claude-dev.newTask', args: (p: string) => [p] },
    { cmd: 'claude-dev.newTask', args: (p: string) => [{ task: p }] },
  ];

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.cline);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    for (const { cmd, args } of ClineAdapter.CANDIDATE_INVOCATIONS) {
      try {
        await vscode.commands.executeCommand(cmd, ...args(prompt));
        return { success: true };
      } catch {
        // Try next candidate
        continue;
      }
    }
    // Fallback to clipboard
    return this.fallbackToClipboard(prompt);
  }

  private async fallbackToClipboard(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Could not send to Cline directly. Prompt copied to clipboard!'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('robot');
  }
}

// ============================================================================
// Roo Code Adapter
// ============================================================================

/**
 * RooCodeAdapter - Integration with Roo Code extension
 */
export class RooCodeAdapter implements AgentAdapter {
  readonly name = 'Roo Code';
  readonly type: AgentType = 'roo-code';
  readonly capabilities = {
    canSendDirectly: true,
    canOpenPanel: true,
    requiresConfirmation: false,
  };

  private static readonly CANDIDATE_INVOCATIONS: Array<{
    cmd: string;
    args: (p: string) => unknown[];
  }> = [
    { cmd: 'roo-cline.newTask', args: (p: string) => [p] },
    { cmd: 'roo-cline.newTask', args: (p: string) => [{ task: p }] },
    { cmd: 'rooveterinaryinc.roo-cline.newTask', args: (p: string) => [p] },
  ];

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS['roo-code']);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    for (const { cmd, args } of RooCodeAdapter.CANDIDATE_INVOCATIONS) {
      try {
        await vscode.commands.executeCommand(cmd, ...args(prompt));
        return { success: true };
      } catch {
        continue;
      }
    }
    return this.fallbackToClipboard(prompt);
  }

  private async fallbackToClipboard(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Could not send to Roo Code directly. Prompt copied to clipboard!'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('robot');
  }
}

// ============================================================================
// Copilot Adapter
// ============================================================================

/**
 * CopilotAdapter - Integration with GitHub Copilot Chat
 */
export class CopilotAdapter implements AgentAdapter {
  readonly name = 'GitHub Copilot';
  readonly type: AgentType = 'copilot';
  readonly capabilities = {
    canSendDirectly: true,
    canOpenPanel: true,
    requiresConfirmation: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.copilot);
  }

  async sendPrompt(prompt: string, options?: SendOptions): Promise<SendResult> {
    // Default autoSubmit to true
    const autoSubmit = options?.autoSubmit ?? true;

    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: prompt,
        isPartialQuery: !autoSubmit,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        reason: 'command_failed',
        message: String(error),
      };
    }
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('github');
  }
}

// ============================================================================
// Continue Adapter
// ============================================================================

/**
 * ContinueAdapter - Integration with Continue extension
 * Uses conservative approach: clipboard + focus panel
 */
export class ContinueAdapter implements AgentAdapter {
  readonly name = 'Continue';
  readonly type: AgentType = 'continue';
  readonly capabilities = {
    canSendDirectly: false,
    canOpenPanel: true,
    requiresConfirmation: true,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.continue);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    // Conservative implementation: copy to clipboard + try to focus
    await vscode.env.clipboard.writeText(prompt);

    try {
      await vscode.commands.executeCommand('continue.focusContinueInput');
    } catch {
      // Command may not exist, ignore
    }

    vscode.window.showInformationMessage(
      'Prompt copied! Press Ctrl+V to paste in Continue.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('debug-continue');
  }
}

// ============================================================================
// Agent Service
// ============================================================================

/**
 * AgentService - Manages agent adapters with caching
 */
export class AgentService {
  private adapters: Map<AgentType, AgentAdapter>;
  private availabilityCache = new Map<AgentType, boolean>();
  private cacheExpiry = 0;
  private readonly CACHE_TTL = 30_000; // 30 seconds

  constructor() {
    this.adapters = new Map<AgentType, AgentAdapter>([
      ['cline', new ClineAdapter()],
      ['roo-code', new RooCodeAdapter()],
      ['copilot', new CopilotAdapter()],
      ['continue', new ContinueAdapter()],
      ['clipboard', new ClipboardAdapter()],
    ]);
  }

  /**
   * Get all registered agent types
   */
  getAllAgentTypes(): AgentType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Get available agents (with caching)
   */
  async getAvailableAgents(): Promise<AgentType[]> {
    const now = Date.now();
    
    // Return cached result if still valid
    if (now < this.cacheExpiry) {
      return [...this.availabilityCache.entries()]
        .filter(([, available]) => available)
        .map(([type]) => type);
    }

    // Check all adapters concurrently
    const results = await Promise.allSettled(
      [...this.adapters.entries()].map(async ([type, adapter]) => {
        const available = await adapter.isAvailable();
        this.availabilityCache.set(type, available);
        return { type, available };
      })
    );

    this.cacheExpiry = now + this.CACHE_TTL;

    return results
      .filter(
        (
          r
        ): r is PromiseFulfilledResult<{ type: AgentType; available: boolean }> =>
          r.status === 'fulfilled' && r.value.available
      )
      .map((r) => r.value.type);
  }

  /**
   * Send prompt to a specific agent
   */
  async sendToAgent(
    prompt: string,
    agent: AgentType,
    options?: SendOptions
  ): Promise<SendResult> {
    const adapter = this.adapters.get(agent);
    if (!adapter) {
      return {
        success: false,
        reason: 'unavailable',
        message: `Unknown agent: ${agent}`,
      };
    }

    // Check availability first (bypasses cache for accuracy)
    const available = await adapter.isAvailable();
    if (!available) {
      return {
        success: false,
        reason: 'unavailable',
        message: `Agent ${adapter.name} is not available`,
      };
    }

    return adapter.sendPrompt(prompt, options);
  }

  /**
   * Get adapter by type
   */
  getAdapter(type: AgentType): AgentAdapter | undefined {
    return this.adapters.get(type);
  }

  /**
   * Invalidate the availability cache
   * Should be called when extensions are installed/uninstalled
   */
  invalidateCache(): void {
    this.cacheExpiry = 0;
    this.availabilityCache.clear();
  }
}
