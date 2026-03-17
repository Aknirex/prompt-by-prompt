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
import { RulesTreeProvider } from './providers/rulesTreeProvider';
import { PromptEditorPanel, PromptEditorResult } from './providers/promptEditorPanel';
import { SettingsPanel } from './providers/settingsPanel';
import { ExtensionConfig, PromptTemplate } from './types/prompt';
import { AgentType } from './types/agent';
import { t } from './utils/i18n';
import { RuleManager, KNOWN_RULE_FILES } from './services/ruleManager';

// Global service instances
let promptManager: PromptManager;
let contextEngine: ContextEngine;
let agentService: AgentService;
let treeProvider: PromptsTreeProvider;
let rulesTreeProvider: RulesTreeProvider;
let ruleManager: RuleManager;
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;

// State keys
const STATE_KEY_LAST_AGENT = 'pbp.lastAgent';

/**
 * Log message to output channel
 */
function log(message: string): void {
  if (outputChannel) {
    outputChannel.appendLine(message);
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
  
  // Initialize services
  const config = getConfig();
  
  promptManager = new PromptManager(context, config);
  contextEngine = new ContextEngine();
  agentService = new AgentService();
  ruleManager = new RuleManager(context);
  treeProvider = new PromptsTreeProvider();
  rulesTreeProvider = new RulesTreeProvider(ruleManager);
  
  // Wait for prompt manager to load
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
  
  const rulesTreeView = vscode.window.createTreeView('pbp.rulesView', {
    treeDataProvider: rulesTreeProvider,
    showCollapseAll: true
  });
  
  // Register commands
  const commands = [
    // Open Settings
    vscode.commands.registerCommand('pbp.openSettings', () => {
      SettingsPanel.createOrShow(extensionContext.extensionUri, extensionContext);
    }),

    // Run Prompt
    vscode.commands.registerCommand('pbp.runPrompt', async (item: any) => {
      if (item && item.prompt) {
        await executePrompt(item.prompt);
      }
    }),

    // Refresh Rules
    vscode.commands.registerCommand('pbp.refreshRules', async () => {
      await ruleManager.scanRuleFiles();
      vscode.window.showInformationMessage(t('Rules refreshed'));
    }),

    // Refresh prompts
    vscode.commands.registerCommand('pbp.refreshPrompts', async () => {
      await promptManager.refresh();
      vscode.window.showInformationMessage(t('Prompts refreshed'));
    }),
    
    // Create new prompt - use editor panel
    vscode.commands.registerCommand('pbp.createPrompt', async () => {
      PromptEditorPanel.createOrShow(
        extensionContext.extensionUri,
        extensionContext,
        undefined,
        async (result: PromptEditorResult) => {
          try {
            await promptManager.createPrompt({
              name: result.name,
              description: result.description,
              category: result.category,
              template: result.template,
              tags: result.tags,
              variables: result.variables
            }, result.target);
            
            vscode.window.showInformationMessage(`Prompt "${result.name}" created`);
          } catch (error) {
            vscode.window.showErrorMessage(`${t('Failed to create prompt')}: ${error}`);
          }
        }
      );
    }),
    
    // Edit prompt - use editor panel for global prompts, open file for workspace prompts
    vscode.commands.registerCommand('pbp.editPrompt', async (prompt: PromptTemplate) => {
      if (!prompt) {
        vscode.window.showErrorMessage(t('No prompt selected'));
        return;
      }
      
      // For workspace prompts with file path, open the file directly
      if (prompt.source === 'workspace' && prompt.filePath) {
        const document = await vscode.workspace.openTextDocument(prompt.filePath);
        await vscode.window.showTextDocument(document);
        return;
      }
      
      // For global prompts or prompts without file path, use the editor panel
      PromptEditorPanel.createOrShow(
        extensionContext.extensionUri,
        extensionContext,
        prompt,
        async (result: PromptEditorResult) => {
          try {
            await promptManager.updatePrompt(prompt.id, {
              name: result.name,
              description: result.description,
              category: result.category,
              template: result.template,
              tags: result.tags,
              variables: result.variables
            });
            
            vscode.window.showInformationMessage(`Prompt "${result.name}" updated`);
          } catch (error) {
            vscode.window.showErrorMessage(`${t('Failed to update prompt')}: ${error}`);
          }
        }
      );
    }),
    
    // Delete prompt
    vscode.commands.registerCommand('pbp.deletePrompt', async (item: any) => {
      if (item && item.prompt) {
        const prompt = item.prompt;
        
        const confirm = await vscode.window.showWarningMessage(
          `${t('Are you sure you want to delete')} "${prompt.name}"?`,
          t('Delete'),
          t('Cancel')
        );
        
        if (confirm === t('Delete')) {
          const deleted = await promptManager.deletePrompt(prompt.id);
          if (deleted) {
            vscode.window.showInformationMessage(`Prompt "${prompt.name}" deleted`);
          } else {
            vscode.window.showErrorMessage(t('Failed to delete prompt'));
          }
        }
      }
    }),

    // Workspace rule
    vscode.commands.registerCommand('pbp.createWorkspaceRule', async () => {
      const config = vscode.workspace.getConfiguration('pbp');
      const defaultRuleFile = config.get<string>('defaultRuleFile') || 'ask';
      const options = ['AGENTS.md', '.clinerules', '.cursorrules', '.windsurfrules', '.aiderrules', '.codeiumrules'];

      let selected: string | undefined;
      if (defaultRuleFile === 'ask' || !options.includes(defaultRuleFile)) {
        selected = await vscode.window.showQuickPick(options, { placeHolder: t('Select rule file to create') });
      } else {
        selected = defaultRuleFile;
      }

      if (selected) {
        await ruleManager.createRuleFile(selected);
      }
    }),

    // Global rule
    vscode.commands.registerCommand('pbp.createGlobalRule', async () => {
      const fileName = await vscode.window.showInputBox({
        prompt: t('Enter global rule file name (e.g. general-rules)'),
        placeHolder: 'my-global-rule'
      });
      if (fileName) {
        await ruleManager.createGlobalRule(fileName);
      }
    }),

    // Set Active Global Rule
    vscode.commands.registerCommand('pbp.setActiveGlobalRule', async (item: any) => {
      // Find internal type
      const ruleItem = item as any;
      if (ruleItem && ruleItem.rule && ruleItem.rule.isGlobal) {
        await ruleManager.setActiveGlobalRule(ruleItem.rule.path);
        vscode.window.showInformationMessage(`"${ruleItem.rule.name}" ${t('set as active global rule.')}`);
      }
    }),

    // Delete rule
    vscode.commands.registerCommand('pbp.deleteRule', async (item: any) => {
      if (item && item.rule) {
        await ruleManager.deleteRuleFile(vscode.Uri.file(item.rule.path));
      } else {
        vscode.window.showErrorMessage(t('Invalid rule item'));
      }
    })
  ];
  
  // Add to subscriptions
  context.subscriptions.push(treeView, rulesTreeView, ...commands);
  
  outputChannel.appendLine('Prompt by Prompt is now active');
  console.log('Prompt by Prompt is now active');
}

/**
 * Select an agent using QuickPick
 */
async function selectAgent(): Promise<AgentType | undefined> {
  const agentConfig = getAgentConfig();
  const availableAgents = await agentService.getAvailableAgents();
  
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
        ? t('Direct send')
        : t('Copy to clipboard'),
      detail: adapter.capabilities.requiresConfirmation
        ? t('⚠️ Requires manual paste')
        : undefined,
      agentType: type,
    };
  });
  
  // Determine default selection
  let _defaultAgent = agentConfig.defaultAgent;
  if (agentConfig.rememberLastAgent) {
    const lastAgent = extensionContext.globalState.get<AgentType>(STATE_KEY_LAST_AGENT);
    if (lastAgent && availableAgents.includes(lastAgent)) {
      _defaultAgent = lastAgent;
    }
  }
  
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select agent to send prompt'),
    title: t('Send Prompt To...'),
  });
  
  return (selected as AgentQuickPickItem | undefined)?.agentType;
}

/**
 * Execute a prompt
 */
async function executePrompt(prompt: PromptTemplate): Promise<void> {
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
      // Use default value if available, otherwise empty string
      const defaultValue = variable.default?.toString() || '';
      value = await vscode.window.showInputBox({
        prompt: variable.description,
        placeHolder: defaultValue,
        value: defaultValue,
        validateInput: (_input) => {
          // Allow empty input - don't block
          return null;
        }
      });
    }
    
    // If user cancelled the input (pressed Escape), abort the whole operation
    if (value === undefined) {
      log('User cancelled variable input, aborting prompt execution');
      return;
    }
    
    // Use the value (even if empty) or default
    customVariables[variable.name] = value || variable.default?.toString() || '';
  }
  
  // Render template
  let renderedPrompt = await contextEngine.renderTemplate(prompt, editorContext, customVariables);

  // Apply rules
  const rulesConfig: string[] = [];
  const activeGlobalRule = ruleManager.getActiveGlobalRule();
  if (activeGlobalRule && activeGlobalRule.content.trim()) {
    rulesConfig.push(`${t('Global Rules')}\n${activeGlobalRule.content.trim()}`);
  }
  
  rulesConfig.push(
    ...ruleManager.getWorkspaceRules().map(r => `${t('Workspace Rule:')} ${r.name}\n${r.content.trim()}`)
  );

  if (rulesConfig.length > 0) {
    renderedPrompt += `\n\n---\n${rulesConfig.join('\n\n')}`;
  }

  // Check if rendered prompt is empty
  if (!renderedPrompt || !renderedPrompt.trim()) {
    vscode.window.showWarningMessage(t('The rendered prompt is empty. Please check your template and variables.'));
    return;
  }
  
  log(`Rendered prompt (${renderedPrompt.length} chars): ${renderedPrompt.substring(0, 100)}...`);
  
  // Show preview option with more actions
  const action = await vscode.window.showInformationMessage(
    `Run prompt "${prompt.name}"?`,
    t('Run'),
    t('Preview'),
    t('Copy'),
    t('Cancel')
  );
  
  if (action === t('Preview')) {
    // Show preview in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: renderedPrompt,
      language: 'markdown'
    });
    await vscode.window.showTextDocument(doc);
    return;
  }
  
  if (action === t('Copy')) {
    // Copy to clipboard directly
    await vscode.env.clipboard.writeText(renderedPrompt);
    vscode.window.showInformationMessage(t('Prompt copied to clipboard!'));
    return;
  }
  
  if (action !== t('Run')) {
    return;
  }
  
  // Select agent
  const agentType = await selectAgent();
  if (!agentType) {
    log('No agent selected, aborting');
    return;
  }
  
  // Save last used agent
  const agentConfig = getAgentConfig();
  if (agentConfig.rememberLastAgent) {
    await extensionContext.globalState.update(STATE_KEY_LAST_AGENT, agentType);
  }
  
  log(`Sending prompt to agent: ${agentType}`);
  
  // Send to agent
  const result = await agentService.sendToAgent(renderedPrompt, agentType);
  
  if (!result.success) {
    vscode.window.showErrorMessage(`${t('Failed to send prompt')}: ${result.message}`);
  } else {
    log(`Prompt sent successfully to ${agentType}`);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  promptManager?.dispose();
  outputChannel?.dispose();
}
