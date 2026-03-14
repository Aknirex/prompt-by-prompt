/**
 * Prompt by Prompt - VS Code Extension Entry Point
 * 
 * Main extension module that initializes all services and registers commands
 */

import * as vscode from 'vscode';
import { PromptManager } from './services/promptManager';
import { ContextEngine } from './services/contextEngine';
import { LLMService } from './services/llmAdapter';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';
import { GeneratorPanel } from './providers/generatorPanel';
import { ExtensionConfig, PromptTemplate, LLMConfig } from './types/prompt';

let promptManager: PromptManager;
let contextEngine: ContextEngine;
let llmService: LLMService;
let treeProvider: PromptsTreeProvider;
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;

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
 * Get LLM config from extension config
 */
function getLLMConfig(extensionConfig: ExtensionConfig): LLMConfig {
  const provider = extensionConfig.defaultModel;
  
  const config: LLMConfig = {
    provider,
    model: '',
    temperature: 0.7,
    maxTokens: 2000
  };
  
  switch (provider) {
    case 'ollama':
      config.model = extensionConfig.ollamaModel;
      config.endpoint = extensionConfig.ollamaEndpoint;
      break;
    case 'openai':
      config.model = extensionConfig.openaiModel;
      config.apiKey = extensionConfig.openaiApiKey;
      break;
    case 'claude':
      config.model = extensionConfig.claudeModel;
      config.apiKey = extensionConfig.claudeApiKey;
      break;
    case 'groq':
      config.model = extensionConfig.groqModel;
      config.apiKey = extensionConfig.groqApiKey;
      break;
  }
  
  return config;
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
  llmService = new LLMService();
  treeProvider = new PromptsTreeProvider();
  
  // Initialize prompt manager
  await promptManager.initialize();
  
  // Set initial prompts in tree view
  treeProvider.setPrompts(promptManager.getAllPrompts());
  
  // Listen for prompt changes
  promptManager.onDidChange(() => {
    treeProvider.setPrompts(promptManager.getAllPrompts());
  });
  
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
          debugLog(`Arg is PromptItem, extracting prompt`);
          prompt = (arg as { prompt: PromptTemplate }).prompt;
        } else if ('id' in arg && 'template' in arg) {
          // It's already a PromptTemplate
          debugLog(`Arg is PromptTemplate`);
          prompt = arg as PromptTemplate;
        }
      }
      
      if (!prompt) {
        // Show quick pick to select a prompt
        debugLog(`No prompt found, showing quick pick`);
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
      
      await executePrompt(prompt, config);
    }),
    
    // Open settings
    vscode.commands.registerCommand('pbp.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'pbp');
    })
  ];
  
  // Add to subscriptions
  context.subscriptions.push(treeView, ...commands);
  
  console.log('Prompt by Prompt is now active');
}

/**
 * Execute a prompt
 */
async function executePrompt(prompt: PromptTemplate, config: ExtensionConfig): Promise<void> {
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
  
  // Show preview
  debugLog(`Showing preview dialog...`);
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
    debugLog(`User cancelled, exiting`);
    return;
  }
  
  // Get LLM config
  const llmConfig = getLLMConfig(config);
  debugLog(`LLM config - provider: ${llmConfig.provider}, model: ${llmConfig.model}`);
  debugLog(`LLM config - endpoint: ${llmConfig.endpoint}, apiKey exists: ${!!llmConfig.apiKey}`);
  
  // Override with prompt-specific parameters if available
  if (prompt.parameters) {
    if (prompt.parameters.model) {
      llmConfig.model = prompt.parameters.model;
    }
    if (prompt.parameters.temperature !== undefined) {
      llmConfig.temperature = prompt.parameters.temperature;
    }
    if (prompt.parameters.max_tokens !== undefined) {
      llmConfig.maxTokens = prompt.parameters.max_tokens;
    }
  }
  
  // Create generator panel
  const panel = GeneratorPanel.createOrShow(extensionContext.extensionUri);
  panel.startStreaming(prompt.name);
  
  // Execute with streaming
  try {
    const response = await llmService.generate(
      renderedPrompt,
      llmConfig,
      (chunk: string) => {
        panel.appendChunk(chunk);
      }
    );
    
    if (response.status === 'success') {
      panel.complete(response);
    } else {
      panel.showError(response.error || 'Unknown error');
      vscode.window.showErrorMessage(`Prompt failed: ${response.error}`);
    }
  } catch (error) {
    panel.showError(String(error));
    vscode.window.showErrorMessage(`Prompt failed: ${error}`);
  }
}

/**
 * Extension deactivation
 */
export function deactivate(): void {
  promptManager?.dispose();
}
