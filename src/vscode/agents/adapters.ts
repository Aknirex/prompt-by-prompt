import * as vscode from 'vscode';
import { AgentAdapter, AgentType, SendResult, SendOptions, AGENT_EXTENSION_IDS, isExtensionAvailable } from '../../types/agent';
import { getSupportedExecutionBehaviors } from './agentCapabilities';

export class ClipboardAdapter implements AgentAdapter {
  readonly name = 'Copy to Clipboard';
  readonly type: AgentType = 'clipboard';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return true; }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied to clipboard!');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('clippy'); }
}

export class FileAdapter implements AgentAdapter {
  readonly name = 'Save to File';
  readonly type: AgentType = 'file';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return true; }
  async sendPrompt(prompt: string): Promise<SendResult> {
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file('prompt.md'),
      filters: { 'Markdown': ['md'], 'Text': ['txt'] },
    });
    if (!uri) return { success: false, reason: 'command_failed', message: 'Save cancelled' };
    await vscode.workspace.fs.writeFile(uri, Buffer.from(prompt, 'utf8'));
    vscode.window.showInformationMessage(`Prompt saved to ${uri.fsPath}`);
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('save'); }
}

export class ClineAdapter implements AgentAdapter {
  readonly name = 'Cline';
  readonly type: AgentType = 'cline';
  readonly capabilities = {
    canCreateTask: true, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: true, canUseStructuredContext: false,
  };
  private static readonly CANDIDATES = [
    { cmd: 'cline.newTask', args: (p: string) => [p] },
    { cmd: 'cline.newTask', args: (p: string) => [{ task: p }] },
    { cmd: 'claude-dev.newTask', args: (p: string) => [p] },
    { cmd: 'claude-dev.newTask', args: (p: string) => [{ task: p }] },
  ];
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.cline); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    for (const { cmd, args } of ClineAdapter.CANDIDATES) {
      try { await vscode.commands.executeCommand(cmd, ...args(prompt)); return { success: true }; }
      catch { continue; }
    }
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Could not send to Cline. Prompt copied to clipboard.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('robot'); }
}

interface RooCodeAPI {
  startNewTask(message: string | { task: string; newTab?: boolean }, images?: string[]): Promise<void>;
  sendMessage(message: string): Promise<void>;
}

export class RooCodeAdapter implements AgentAdapter {
  readonly name = 'Roo Code';
  readonly type: AgentType = 'roo-code';
  readonly capabilities = {
    canCreateTask: true, canFillInput: true, canAppendInput: true,
    canInsertInput: false, canAutoSubmit: true, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS['roo-code']); }
  async sendPrompt(prompt: string, options?: SendOptions): Promise<SendResult> {
    const ext = vscode.extensions.getExtension<RooCodeAPI>(AGENT_EXTENSION_IDS['roo-code']);
    if (ext) {
      if (!ext.isActive) await ext.activate();
      const api = ext.exports;
      if (api?.startNewTask) {
        if (options?.behavior === 'append') {
          await api.sendMessage?.(prompt);
        } else {
          await api.startNewTask(prompt);
        }
        return { success: true };
      }
    }
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Roo Code.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('hubot'); }
}

export class CopilotAdapter implements AgentAdapter {
  readonly name = 'GitHub Copilot Chat';
  readonly type: AgentType = 'copilot';
  readonly capabilities = {
    canCreateTask: false, canFillInput: true, canAppendInput: false,
    canInsertInput: true, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.copilot); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    try {
      await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage('Copilot Chat opened. Prompt copied — paste to send.');
      return { success: true };
    } catch {
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage('Prompt copied. Paste in Copilot Chat.');
      return { success: true };
    }
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('github'); }
}

export class ContinueAdapter implements AgentAdapter {
  readonly name = 'Continue';
  readonly type: AgentType = 'continue';
  readonly capabilities = {
    canCreateTask: false, canFillInput: true, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.continue); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    try {
      await vscode.commands.executeCommand('continue.focusContinueInput', prompt);
      return { success: true };
    } catch {
      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage('Prompt copied. Paste in Continue.');
      return { success: true };
    }
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('arrow-right'); }
}

export class CursorAdapter implements AgentAdapter {
  readonly name = 'Cursor';
  readonly type: AgentType = 'cursor';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.cursor); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Cursor.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('edit'); }
}

export class GeminiAdapter implements AgentAdapter {
  readonly name = 'Gemini Code Assist';
  readonly type: AgentType = 'gemini';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.gemini); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Gemini Code Assist.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('sparkle'); }
}

export class TongyiAdapter implements AgentAdapter {
  readonly name = 'Tongyi Lingma';
  readonly type: AgentType = 'tongyi';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.tongyi); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Tongyi Lingma.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('cloud'); }
}

export class KiloCodeAdapter implements AgentAdapter {
  readonly name = 'Kilo Code';
  readonly type: AgentType = 'kilo-code';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS['kilo-code']); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Kilo Code.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('code'); }
}

export class CodexAdapter implements AgentAdapter {
  readonly name = 'OpenAI Codex';
  readonly type: AgentType = 'codex';
  readonly capabilities = {
    canCreateTask: false, canFillInput: false, canAppendInput: false,
    canInsertInput: false, canAutoSubmit: false, canUseStructuredContext: false,
  };
  async isAvailable(): Promise<boolean> { return isExtensionAvailable(AGENT_EXTENSION_IDS.codex); }
  async sendPrompt(prompt: string): Promise<SendResult> {
    await vscode.env.clipboard.writeText(prompt);
    vscode.window.showInformationMessage('Prompt copied. Paste in Codex.');
    return { success: true };
  }
  getIcon(): vscode.ThemeIcon { return new vscode.ThemeIcon('hubot'); }
}
