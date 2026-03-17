/**
 * Agent Types - Type definitions for agent adapters
 * 
 * This module defines the types for integrating with various VS Code agent extensions
 * like Cline, Roo Code, GitHub Copilot Chat, and Continue.
 */

import * as vscode from 'vscode';

// ============================================================================
// Agent Type Definitions
// ============================================================================

/**
 * Supported agent types
 */
export type AgentType = 'cline' | 'roo-code' | 'copilot' | 'continue' | 'clipboard' | 'file';

/**
 * Result of sending a prompt to an agent
 */
export type SendResult =
  | { success: true }
  | { success: false; reason: 'unavailable' | 'command_failed' | 'timeout'; message: string };

/**
 * Capabilities of an agent adapter
 */
export interface AgentCapabilities {
  /** Whether the agent supports direct sending without user confirmation */
  canSendDirectly: boolean;
  
  /** Whether the agent can open its panel programmatically */
  canOpenPanel: boolean;
  
  /** Whether the agent requires user to manually paste/confirm */
  requiresConfirmation: boolean;
}

/**
 * Options for sending a prompt
 */
export interface SendOptions {
  /** Whether to open the agent panel */
  openPanel?: boolean;
  
  /** Whether to auto-submit the prompt (default: true) */
  autoSubmit?: boolean;
}

/**
 * Agent adapter interface
 * 
 * Each agent (Cline, Copilot, etc.) implements this interface to provide
 * a consistent way to send prompts.
 */
export interface AgentAdapter {
  /** Human-readable name of the agent */
  readonly name: string;
  
  /** Agent type identifier */
  readonly type: AgentType;
  
  /** Agent capabilities */
  readonly capabilities: AgentCapabilities;
  
  /**
   * Check if the agent is available (installed and activated)
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Send a prompt to the agent
   * @param prompt The rendered prompt text to send
   * @param options Optional send options
   * @returns Result indicating success or failure with reason
   */
  sendPrompt(prompt: string, options?: SendOptions): Promise<SendResult>;
  
  /**
   * Get the icon for this agent
   */
  getIcon(): vscode.ThemeIcon;
}

// ============================================================================
// Extension IDs
// ============================================================================

/**
 * Extension IDs for supported agents
 * Note: Case must match exactly with VS Code Marketplace
 */
export const AGENT_EXTENSION_IDS = {
  cline: 'saoudrizwan.claude-dev',
  'roo-code': 'RooVeterinaryInc.roo-cline',
  copilot: 'GitHub.copilot-chat',  // Note: Chat is in separate extension
  continue: 'continue.continue',
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an extension is available and optionally activate it
 */
export async function isExtensionAvailable(extensionId: string): Promise<boolean> {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) {
    return false;
  }
  
  if (!extension.isActive) {
    try {
      await extension.activate();
    } catch {
      return false;
    }
  }
  
  return true;
}
