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
  AgentCapabilities,
  SendResult,
  SendOptions,
  AGENT_EXTENSION_IDS,
  isExtensionAvailable,
} from '../types/agent';
import { ExecutionBehavior } from '../types/execution';

// Output channel for logging
let logChannel: vscode.OutputChannel;

/**
 * Initialize the agent service with an output channel for logging
 */
export function initAgentService(channel: vscode.OutputChannel): void {
  logChannel = channel;
}

/**
 * Log message to output channel
 */
function log(message: string): void {
  if (logChannel) {
    logChannel.appendLine(`[AgentService] ${message}`);
  }
}

export function getSupportedExecutionBehaviors(
  capabilities: AgentCapabilities
): ExecutionBehavior[] {
  const behaviors: ExecutionBehavior[] = [];

  if (capabilities.canAutoSubmit) {
    behaviors.push('send');
  }

  if (capabilities.canAppendInput) {
    behaviors.push('append');
  }

  if (capabilities.canFillInput) {
    behaviors.push('overwrite');
  }

  if (capabilities.canInsertInput) {
    behaviors.push('insert');
  }

  return behaviors;
}

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
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
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
// File Adapter
// ============================================================================

/**
 * FileAdapter - Saves prompt to a file
 */
export class FileAdapter implements AgentAdapter {
  readonly name = 'Save to File';
  readonly type: AgentType = 'file';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return true; // Always available
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    const config = vscode.workspace.getConfiguration('pbp');
    const outputDir = config.get<string>('outputDirectory', '.prompts/');
    const fileName = `prompt-${new Date().getTime()}.txt`;
    
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('No workspace folder found.');
      return { success: false, reason: 'command_failed', message: 'No workspace folder found.' };
    }

    const folderUri = vscode.workspace.workspaceFolders[0].uri;
    const outputUri = vscode.Uri.joinPath(folderUri, outputDir);
    const fileUri = vscode.Uri.joinPath(outputUri, fileName);
    
    await vscode.workspace.fs.createDirectory(outputUri);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(prompt));
    
    vscode.window.showInformationMessage(`Prompt saved to ${fileUri.fsPath}`);
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('file');
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
    canCreateTask: true,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: true,
    canUseStructuredContext: false,
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
 * Roo Code API interface (subset of @roo-code/types)
 */
interface RooCodeAPI {
  startNewTask(message: string | { task: string; newTab?: boolean }, images?: string[]): Promise<void>;
  sendMessage(message: string): Promise<void>;
  pressPrimaryButton(): Promise<void>;
  pressSecondaryButton(): Promise<void>;
}

/**
 * RooCodeAdapter - Integration with Roo Code extension
 * Uses the Roo Code extension API for direct task creation without dialogs
 */
export class RooCodeAdapter implements AgentAdapter {
  readonly name = 'Roo Code';
  readonly type: AgentType = 'roo-code';
  readonly capabilities = {
    canCreateTask: true,
    canFillInput: true,
    canAppendInput: true,
    canInsertInput: false,
    canAutoSubmit: true,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS['roo-code']);
  }

  async sendPrompt(prompt: string, options?: SendOptions): Promise<SendResult> {
    const autoSubmit =
      options?.behavior !== 'append' &&
      options?.behavior !== 'overwrite' &&
      options?.behavior !== 'insert';
    
    log(`[RooCodeAdapter] sendPrompt called with autoSubmit: ${autoSubmit}`);
    
    // If not autoSubmit (append mode), use clipboard + focus approach
    if (!autoSubmit) {
      return this.appendToInput(prompt);
    }
    
    // Try to use the Roo Code extension API directly
    const extensionId = AGENT_EXTENSION_IDS['roo-code'];
    const extension = vscode.extensions.getExtension<RooCodeAPI>(extensionId);
    
    log(`[RooCodeAdapter] Extension ID: ${extensionId}`);
    log(`[RooCodeAdapter] Extension found: ${!!extension}`);
    log(`[RooCodeAdapter] Extension active: ${extension?.isActive}`);
    
    if (extension) {
      // Activate the extension if not already active
      if (!extension.isActive) {
        try {
          log('[RooCodeAdapter] Activating extension...');
          await extension.activate();
          log('[RooCodeAdapter] Extension activated');
        } catch (error) {
          log(`[RooCodeAdapter] Failed to activate extension: ${error}`);
        }
      }
      
      if (extension.isActive) {
        try {
          const api = extension.exports;
          log(`[RooCodeAdapter] API exports: ${JSON.stringify(Object.keys(api || {}))}`);
          log(`[RooCodeAdapter] startNewTask type: ${typeof api?.startNewTask}`);
          
          if (api && typeof api.startNewTask === 'function') {
            // First, open the Roo Code sidebar to ensure the UI is visible
            log('[RooCodeAdapter] Opening Roo Code sidebar...');
            await vscode.commands.executeCommand('roo-cline.SidebarProvider.focus');
            
            // Wait a moment for the sidebar to open
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Try object format first (newer API), then fall back to string format
            log(`[RooCodeAdapter] Calling startNewTask with prompt (object format): ${prompt.substring(0, 50)}...`);
            try {
              await api.startNewTask({ task: prompt, newTab: false });
              log('[RooCodeAdapter] startNewTask (object format) completed successfully');
              return { success: true };
            } catch (objError) {
              log(`[RooCodeAdapter] Object format failed, trying string format: ${objError}`);
              await api.startNewTask(prompt);
              log('[RooCodeAdapter] startNewTask (string format) completed successfully');
              return { success: true };
            }
          } else {
            log('[RooCodeAdapter] API or startNewTask not available');
          }
        } catch (error) {
          log(`[RooCodeAdapter] API call failed: ${error}`);
          // API call failed, fall through to command-based approach
        }
      }
    }
    
    // Fallback: try command-based approach (may show dialog)
    log('[RooCodeAdapter] Falling back to command-based approach');
    return this.fallbackToCommand(prompt);
  }

  /**
   * Append prompt to Roo Code input box without sending
   * Uses clipboard + paste simulation since Roo Code uses webview for its UI
   */
  private async appendToInput(prompt: string): Promise<SendResult> {
    log('[RooCodeAdapter] appendToInput: copying to clipboard and simulating paste');
    
    // First, copy prompt to clipboard
    await vscode.env.clipboard.writeText(prompt);
    log('[RooCodeAdapter] Prompt copied to clipboard');
    
    // Open and focus the Roo Code sidebar
    try {
      await vscode.commands.executeCommand('roo-cline.SidebarProvider.focus');
      log('[RooCodeAdapter] Sidebar focused');
      
      // Wait for the sidebar to open and render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to focus the input box specifically
      try {
        await vscode.commands.executeCommand('roo-cline.focusInput');
        log('[RooCodeAdapter] focusInput command executed');
      } catch (e) {
        log(`[RooCodeAdapter] focusInput command not available: ${e}`);
      }
      
      // Wait a bit more for input to be focused
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Simulate Ctrl+V paste using VS Code's executeCommand
      // The 'editor.action.clipboardPasteAction' command pastes from clipboard
      try {
        // Try the paste action command
        await vscode.commands.executeCommand('editor.action.clipboardPasteAction');
        log('[RooCodeAdapter] Paste action executed');
        return { success: true };
      } catch (pasteError) {
        log(`[RooCodeAdapter] Paste action failed: ${pasteError}`);
        
        // Show notification that prompt is in clipboard
        vscode.window.showInformationMessage(
          'Prompt copied to clipboard! Press Ctrl+V to paste in Roo Code input box.'
        );
        return { success: true };
      }
    } catch (error) {
      log(`[RooCodeAdapter] Failed to focus Roo Code: ${error}`);
      // Fallback: just copy to clipboard
      vscode.window.showInformationMessage(
        'Prompt copied to clipboard! Open Roo Code and press Ctrl+V to paste.'
      );
      return { success: true };
    }
  }

  private async fallbackToCommand(prompt: string): Promise<SendResult> {
    const candidateInvocations: Array<{
      cmd: string;
      args: (p: string) => unknown[];
    }> = [
      { cmd: 'roo-cline.newTask', args: (p: string) => [p] },
      { cmd: 'roo-cline.newTask', args: (p: string) => [{ task: p }] },
      { cmd: 'rooveterinaryinc.roo-cline.newTask', args: (p: string) => [p] },
    ];

    for (const { cmd, args } of candidateInvocations) {
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
    canCreateTask: true,
    canFillInput: true,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: true,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.copilot);
  }

  async sendPrompt(prompt: string, options?: SendOptions): Promise<SendResult> {
    const fillWithoutSubmit = options?.behavior === 'overwrite' || options?.behavior === 'append';

    try {
      await vscode.commands.executeCommand('workbench.action.chat.open', {
        query: prompt,
        isPartialQuery: fillWithoutSubmit,
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
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
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
// Cursor Adapter
// ============================================================================

/**
 * CursorAdapter - Integration with Cursor AI
 * Uses clipboard fallback since Cursor is VS Code based
 */
export class CursorAdapter implements AgentAdapter {
  readonly name = 'Cursor';
  readonly type: AgentType = 'cursor';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.cursor);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste in Cursor AI chat.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('symbol-keyword');
  }
}

// ============================================================================
// Kilo Code Adapter
// ============================================================================

/**
 * KiloCodeAdapter - Integration with Kilo Code
 */
export class KiloCodeAdapter implements AgentAdapter {
  readonly name = 'Kilo Code';
  readonly type: AgentType = 'kilo-code';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS['kilo-code']);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste in Kilo Code.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('code');
  }
}

// ============================================================================
// Codex Adapter
// ============================================================================

/**
 * CodexAdapter - Integration with OpenAI Codex
 */
export class CodexAdapter implements AgentAdapter {
  readonly name = 'OpenAI Codex';
  readonly type: AgentType = 'codex';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.codex);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste in Codex.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('hubot');
  }
}

// ============================================================================
// Gemini Adapter
// ============================================================================

/**
 * GeminiAdapter - Integration with Google Gemini Code Assist
 */
export class GeminiAdapter implements AgentAdapter {
  readonly name = 'Gemini Code Assist';
  readonly type: AgentType = 'gemini';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.gemini);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste in Gemini Code Assist.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('sparkle');
  }
}

// ============================================================================
// Tongyi Adapter
// ============================================================================

/**
 * TongyiAdapter - Integration with Alibaba Tongyi Lingma
 */
export class TongyiAdapter implements AgentAdapter {
  readonly name = 'Tongyi Lingma';
  readonly type: AgentType = 'tongyi';
  readonly capabilities = {
    canCreateTask: false,
    canFillInput: false,
    canAppendInput: false,
    canInsertInput: false,
    canAutoSubmit: false,
    canUseStructuredContext: false,
  };

  async isAvailable(): Promise<boolean> {
    return isExtensionAvailable(AGENT_EXTENSION_IDS.tongyi);
  }

  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage(
      'Prompt copied! Paste in Tongyi Lingma.'
    );
    return { success: true };
  }

  getIcon(): vscode.ThemeIcon {
    return new vscode.ThemeIcon('cloud');
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
      ['cursor', new CursorAdapter()],
      ['kilo-code', new KiloCodeAdapter()],
      ['codex', new CodexAdapter()],
      ['gemini', new GeminiAdapter()],
      ['tongyi', new TongyiAdapter()],
      ['file', new FileAdapter()],
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
