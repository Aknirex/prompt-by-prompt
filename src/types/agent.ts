/**
 * Agent Types - Type definitions for agent adapters
 * 
 * This module defines the types for integrating with various VS Code agent extensions
 * like Cline, Roo Code, GitHub Copilot Chat, and Continue.
 */

import * as vscode from 'vscode';
import { ExecutionBehavior } from './execution';

// ============================================================================
// Agent Type Definitions
// ============================================================================

/**
 * Supported agent types
 */
export type AgentType = 'cline' | 'roo-code' | 'copilot' | 'continue' | 'gemini' | 'tongyi' | 'cursor' | 'kilo-code' | 'codex' | 'clipboard' | 'file';

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
  canCreateTask: boolean;
  canFillInput: boolean;
  canAppendInput: boolean;
  canInsertInput: boolean;
  canAutoSubmit: boolean;
  canUseStructuredContext: boolean;
}

/**
 * Options for sending a prompt
 */
export interface SendOptions {
  openPanel?: boolean;
  behavior?: ExecutionBehavior;
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
  gemini: 'Google.geminicodeassist',
  tongyi: 'Alibaba-Cloud.TONGYI-Lingma-2022',
  cursor: 'cursor.cursor-ai',
  'kilo-code': 'kilo.kilo-code',
  codex: 'openai.openai-codex',
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
