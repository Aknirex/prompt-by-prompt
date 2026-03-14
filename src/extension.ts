/**
 * Prompt by Prompt - VS Code Extension Entry Point
 * 
 * Main extension module that initializes all services and registers commands
 */

import * as vscode from 'vscode';
import { PromptManager } from './services/promptManager';
import { ContextEngine } from './services/contextEngine';
import { AgentService } from './services/agentService';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';
import { ExtensionConfig, PromptTemplate } from './types/prompt';
import { AgentType } from './types/agent';

// Global service instances
let promptManager: PromptManager;
let contextEngine: ContextEngine;
let agentService: AgentService;
let treeProvider: PromptsTreeProvider;
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

// State keys
const STATE_KEY_LAST_AGENT = 'pbp.lastAgent';

/**
 * Debug logging utility
 */
function debugLog(message: string): void {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  if (outputChannel) {
    outputChannel.appendLine(logMessage);
  }
}

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('pbp');
  
  return {
    defaultModel: config.get('defaultModel') || 'ollama',
    ollamaEndpoint: config.get('ollamaEndpoint') || 'http://localhost:11434',
    ollamaModel: config.get('ollamaModel') || 'llama3.2',
    openaiApiKey: config.get('openaiApiKey') || '',
    openaiModel: config.get('openaiModel') || 'gpt-4o-mini',
    claudeApiKey: config.get('claudeApiKey') || '',
    claudeModel: config.get('claudeModel') || 'claude-3-5-sonnet-20241022',
    groqApiKey: config.get('groqApiKey') || '',
    groqModel: config.get('groqModel') || 'llama-3.3-70b-versatile',
    promptsDir: config.get('promptsDir') || '.prompts'
  };
}

/**
 * Get agent configuration
 */
function getAgentConfig(): { defaultAgent: AgentType; rememberLastAgent: boolean } {
  const config = vscode.workspace.getConfiguration('pbp');
  return {
    defaultAgent: (config.get('defaultAgent') || 'clipboard') as AgentType,
    rememberLastAgent: config.get('rememberLastAgent') ?? true
  };
}

/**
 * Update status bar with current agent
 */
function updateStatusBar(): void {
  const agentConfig = getAgentConfig();
  let currentAgent = agentConfig.defaultAgent;
  
  if (agentConfig.rememberLastAgent) {
    const lastAgent = extensionContext.globalState.get<AgentType>(STATE_KEY_LAST_AGENT);
    if (lastAgent) {
      currentAgent = lastAgent;
    }
  }
  
  const adapter = agentService.getAdapter(currentAgent);
  if (adapter) {
    statusBarItem.text = `$(${adapter.getIcon().id}) ${adapter.name}`;
    statusBarItem.show();
  } else {
    statusBarItem.hide();
  }
}

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Create output channel first
  outputChannel = vscode.window.createOutputChannel('Prompt by Prompt');
  outputChannel.appendLine('Prompt by Prompt is activating...');
  console.log('Prompt by Prompt is activating...');
  
  // Store extension context globally
  extensionContext = context;
  
  const config = getConfig();
  
  // Initialize services
  promptManager = new PromptManager(context, config);
  contextEngine = new ContextEngine();
  agentService = new AgentService();
  treeProvider = new PromptsTreeProvider();
  
  // Initialize prompt manager
  await promptManager.initialize();
  
  // Set initial prompts in tree view
  treeProvider.setPrompts(promptManager.getAllPrompts());
  
  // Listen for prompt changes
  promptManager.onDidChange(() => {
    treeProvider.setPrompts(promptManager.getAllPrompts());
  });
  
  // Listen for extension changes (install/uninstall) to invalidate agent cache
  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      agentService.invalidateCache();
      debugLog('Extension change detected, agent cache invalidated');
      updateStatusBar();
    })
  );
  
  // Create status bar item for current agent
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'pbp.selectAgent';
  statusBarItem.tooltip = 'Click to change agent';
  context.subscriptions.push(statusBarItem);
  
  // Register command to select agent from status bar
  context.subscriptions.push(
    vscode.commands.registerCommand('pbp.selectAgent', async () => {
      const agentType = await selectAgent();
      if (agentType) {
        const agentConfig = getAgentConfig();
        if (agentConfig.rememberLastAgent) {
          await extensionContext.globalState.update(STATE_KEY_LAST_AGENT, agentType);
        }
        updateStatusBar();
      }
    })
  );
  
  // Initialize status bar
  updateStatusBar();
  
  // Register tree view
  const treeView = vscode.window.createTreeView('pbp.promptsView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  
  // Register commands
  const commands = [
    // Refresh prompts
    vscode.commands.registerCommand('pbp.refreshPrompts', async () => {
      await promptManager.refresh();
      vscode.window.showInformationMessage('Prompts refreshed');
    }),
    
    // Create new prompt
    vscode.commands.registerCommand('pbp.createPrompt', async () => {
      const name = await vscode.window.showInputBox({
        prompt: 'Enter prompt name',
        placeHolder: 'My Prompt'
      });
      
      if (!name) {
        return;
      }
      
      const description = await vscode.window.showInputBox({
        prompt: 'Enter prompt description',
        placeHolder: 'Description of what this prompt does'
      }) || '';
      
      const category = await vscode.window.showQuickPick(
        ['Development', 'Code Analysis', 'Code Generation', 'Documentation', 'Testing', 'Data', 'General'],
        { placeHolder: 'Select category' }
      ) || 'General';
      
      const template = await vscode.window.showInputBox({
        prompt: 'Enter prompt template (use {{variable}} for variables)',
        placeHolder: 'You are a helpful assistant. {{selection}}'
      }) || '';
      
      try {
        await promptManager.createPrompt({
          name,
          description,
          category,
          template,
          tags: []
        });
        
        vscode.window.showInformationMessage(`Prompt "${name}" created`);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create prompt: ${error}`);
      }
    }),
    
    // Edit prompt
    vscode.commands.registerCommand('pbp.editPrompt', async (prompt: PromptTemplate) => {
      if (!prompt || !prompt.filePath) {
        vscode.window.showErrorMessage('Cannot edit this prompt');
        return;
      }
      
      const document = await vscode.workspace.openTextDocument(prompt.filePath);
      await vscode.window.showTextDocument(document);
    }),
    
    // Delete prompt
    vscode.commands.registerCommand('pbp.deletePrompt', async (prompt: PromptTemplate) => {
      if (!prompt) {
        return;
      }
      
      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete "${prompt.name}"?`,
        'Delete',
        'Cancel'
      );
      
      if (confirm === 'Delete') {
        const deleted = await promptManager.deletePrompt(prompt.id);
        if (deleted) {
          vscode.window.showInformationMessage(`Prompt "${prompt.name}" deleted`);
        } else {
          vscode.window.showErrorMessage('Failed to delete prompt');
        }
      }
    }),
    
    // Run prompt
    vscode.commands.registerCommand('pbp.runPrompt', async (arg: unknown) => {
      debugLog(`pbp.runPrompt called with arg type: ${typeof arg}`);
      debugLog(`arg keys: ${arg && typeof arg === 'object' ? Object.keys(arg).join(', ') : 'N/A'}`);
      
      let prompt: PromptTemplate | undefined;
      
      // Check if arg is a PromptItem (from tree view) or PromptTemplate
      if (arg && typeof arg === 'object') {
        // Check if it's a PromptItem with a prompt property
        if ('prompt' in arg) {
          debugLog('Arg is PromptItem, extracting prompt');
          prompt = (arg as { prompt: PromptTemplate }).prompt;
        } else if ('id' in arg && 'template' in arg) {
          // It's already a PromptTemplate
          debugLog('Arg is PromptTemplate');
          prompt = arg as PromptTemplate;
        }
      }
      
      if (!prompt) {
        // Show quick pick to select a prompt
        debugLog('No prompt found, showing quick pick');
        const prompts = promptManager.getAllPrompts();
        const selected = await vscode.window.showQuickPick(
          prompts.map(p => ({ label: p.name, description: p.description, prompt: p })),
          { placeHolder: 'Select a prompt to run' }
        );
        
        if (!selected) {
          return;
        }
        
        prompt = selected.prompt;
      }
      
      await executePrompt(prompt);
    }),
    
    // Open settings
    vscode.commands.registerCommand('pbp.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'pbp');
    })
  ];
  
  // Add to subscriptions
  context.subscriptions.push(treeView, ...commands);
  
  outputChannel.appendLine('Prompt by Prompt is now active');
  console.log('Prompt by Prompt is now active');
}

/**
 * Select an agent using QuickPick
 */
async function selectAgent(): Promise<AgentType | undefined> {
  const agentConfig = getAgentConfig();
  const availableAgents = await agentService.getAvailableAgents();
  
  debugLog(`Available agents: ${availableAgents.join(', ')}`);
  
  if (availableAgents.length === 0) {
    // Should never happen since clipboard is always available
    vscode.window.showErrorMessage('No agents available');
    return undefined;
  }
  
  // If only clipboard is available, use it directly
  if (availableAgents.length === 1 && availableAgents[0] === 'clipboard') {
    return 'clipboard';
  }
  
  // Build QuickPick items with proper typing
  interface AgentQuickPickItem extends vscode.QuickPickItem {
    agentType: AgentType;
  }
  
  const items: AgentQuickPickItem[] = availableAgents.map(type => {
    const adapter = agentService.getAdapter(type)!;
    return {
      label: `$(${adapter.getIcon().id}) ${adapter.name}`,
      description: adapter.capabilities.canSendDirectly
        ? 'Direct send'
        : 'Copy to clipboard',
      detail: adapter.capabilities.requiresConfirmation
        ? '⚠️ Requires manual paste'
        : undefined,
      agentType: type,
    };
  });
  
  // Determine default selection
  let defaultAgent = agentConfig.defaultAgent;
  if (agentConfig.rememberLastAgent) {
    const lastAgent = extensionContext.globalState.get<AgentType>(STATE_KEY_LAST_AGENT);
    if (lastAgent && availableAgents.includes(lastAgent)) {
      defaultAgent = lastAgent;
    }
  }
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select agent to send prompt',
    title: 'Send Prompt To...',
  });
  
  return (selected as AgentQuickPickItem | undefined)?.agentType;
}

/**
 * Execute a prompt
 */
async function executePrompt(prompt: PromptTemplate): Promise<void> {
  debugLog(`executePrompt called`);
  debugLog(`prompt id: ${prompt?.id}`);
  debugLog(`prompt name: ${prompt?.name}`);
  debugLog(`prompt.template type: ${typeof prompt?.template}`);
  debugLog(`prompt.template value (first 200 chars): ${String(prompt?.template || '').substring(0, 200)}`);
  
  // Extract editor context
  const editorContext = await contextEngine.extractContext();
  
  // Check for missing variables
  const missingVariables = contextEngine.getMissingVariables(prompt, editorContext);
  
  // Collect missing variables from user
  const customVariables: Record<string, string> = {};
  
  for (const variable of missingVariables) {
    let value: string | undefined;
    
    if (variable.type === 'enum' && variable.values) {
      value = await vscode.window.showQuickPick(variable.values, {
        placeHolder: variable.description
      });
    } else {
      value = await vscode.window.showInputBox({
        prompt: variable.description,
        placeHolder: variable.default?.toString() || ''
      });
    }
    
    if (value) {
      customVariables[variable.name] = value;
    }
  }
  
  // Render template
  const renderedPrompt = await contextEngine.renderTemplate(prompt, editorContext, customVariables);
  debugLog(`Template rendered, length: ${renderedPrompt.length}`);
  
  // Show preview option
  debugLog('Showing preview dialog...');
  const preview = await vscode.window.showInformationMessage(
    `Run prompt "${prompt.name}"?`,
    'Run',
    'Preview',
    'Cancel'
  );
  debugLog(`User selected: ${preview}`);
  
  if (preview === 'Preview') {
    // Show preview in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: renderedPrompt,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
    return;
  }
  
  if (preview !== 'Run') {
    debugLog('User cancelled, exiting');
    return;
  }
  
  // Select agent
  const agentType = await selectAgent();
  if (!agentType) {
    debugLog('No agent selected, exiting');
    return;
  }
  
  // Save last used agent
  const agentConfig = getAgentConfig();
  if (agentConfig.rememberLastAgent) {
    await extensionContext.globalState.update(STATE_KEY_LAST_AGENT, agentType);
  }
  
  // Send to agent
  debugLog(`Sending to agent: ${agentType}`);
  const result = await agentService.sendToAgent(renderedPrompt, agentType);
  
  if (result.success) {
    debugLog('Prompt sent successfully');
  } else {
    debugLog(`Failed to send prompt: ${result.reason} - ${result.message}`);
    vscode.window.showErrorMessage(`Failed to send prompt: ${result.message}`);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  promptManager?.dispose();
  outputChannel?.dispose();
}
