/**
 * Prompt by Prompt - VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import { PromptManager } from './services/promptManager';
import { ContextEngine } from './services/contextEngine';
import { AgentService, initAgentService } from './services/agentService';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';
import { RulesTreeProvider } from './providers/rulesTreeProvider';
import { PromptEditorPanel, PromptEditorResult } from './providers/promptEditorPanel';
import { SettingsPanel } from './providers/settingsPanel';
import { ExtensionConfig, PromptTemplate } from './types/prompt';
import { t } from './utils/i18n';
import { RuleManager } from './services/ruleManager';
import { ExecutionService } from './services/executionService';

let promptManager: PromptManager;
let contextEngine: ContextEngine;
let agentService: AgentService;
let treeProvider: PromptsTreeProvider;
let rulesTreeProvider: RulesTreeProvider;
let ruleManager: RuleManager;
let executionService: ExecutionService;
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;

function log(message: string): void {
  outputChannel?.appendLine(message);
}

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
    promptsDir: config.get('promptsDir') || '.prompts',
  };
}

function getDefaultPromptTarget(): 'workspace' | 'global' {
  const config = vscode.workspace.getConfiguration('pbp');
  return config.get<'workspace' | 'global'>('defaultTarget') || 'global';
}

function extractPromptFromArgument(value: unknown): PromptTemplate | undefined {
  if (!value) {
    return undefined;
  }

  const candidate = value as PromptTemplate & { prompt?: PromptTemplate };
  if (candidate.prompt?.id) {
    return candidate.prompt;
  }

  return candidate.id ? candidate : undefined;
}

async function pickPromptIfNeeded(value?: unknown): Promise<PromptTemplate | undefined> {
  const explicitPrompt = extractPromptFromArgument(value);
  if (explicitPrompt) {
    return explicitPrompt;
  }

  const prompts = promptManager.getAllPrompts();
  if (prompts.length === 0) {
    vscode.window.showWarningMessage('No prompts available.');
    return undefined;
  }

  const items = prompts.map((prompt) => ({
    label: prompt.name,
    description: prompt.description,
    prompt,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select a prompt to run'),
    title: 'Prompt by Prompt',
  });

  return selected?.prompt;
}

async function openPromptEditor(
  existingPrompt: PromptTemplate | undefined,
  onSave: (result: PromptEditorResult) => Promise<void>
): Promise<void> {
  PromptEditorPanel.createOrShow(
    extensionContext.extensionUri,
    extensionContext,
    existingPrompt,
    getDefaultPromptTarget(),
    async (result) => {
      await onSave(result);
    }
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Prompt by Prompt');
  outputChannel.appendLine('Prompt by Prompt is activating...');

  initAgentService(outputChannel);
  extensionContext = context;

  const config = getConfig();
  promptManager = new PromptManager(context, config);
  contextEngine = new ContextEngine();
  agentService = new AgentService();
  ruleManager = new RuleManager(context);
  executionService = new ExecutionService(context, contextEngine, agentService, ruleManager, log);
  treeProvider = new PromptsTreeProvider();
  rulesTreeProvider = new RulesTreeProvider(ruleManager);

  await promptManager.initialize();
  await ruleManager.scanRuleFiles();

  treeProvider.setPrompts(promptManager.getAllPrompts());
  rulesTreeProvider.refresh();

  promptManager.onDidChange(() => {
    treeProvider.setPrompts(promptManager.getAllPrompts());
  });

  context.subscriptions.push(
    vscode.extensions.onDidChange(() => {
      agentService.invalidateCache();
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('pbp.uiLanguage')) {
        treeProvider.refresh();
        rulesTreeProvider.refresh();
      }

      if (event.affectsConfiguration('pbp.promptsDir')) {
        await promptManager.refresh();
      }
    })
  );

  const treeView = vscode.window.createTreeView('pbp.promptsView', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  const rulesTreeView = vscode.window.createTreeView('pbp.rulesView', {
    treeDataProvider: rulesTreeProvider,
    showCollapseAll: true,
  });

  const commands = [
    vscode.commands.registerCommand('pbp.openSettings', () => {
      SettingsPanel.createOrShow(extensionContext.extensionUri, extensionContext);
    }),

    vscode.commands.registerCommand('pbp.runPrompt', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (prompt) {
        await executionService.runPrompt(prompt);
      }
    }),

    vscode.commands.registerCommand('pbp.runPromptWithPicker', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (prompt) {
        await executionService.runPrompt(prompt, { forcePicker: true });
      }
    }),

    vscode.commands.registerCommand('pbp.previewPrompt', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (prompt) {
        await executionService.previewPrompt(prompt);
      }
    }),

    vscode.commands.registerCommand('pbp.rerunLastTarget', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (prompt) {
        await executionService.rerunLastTarget(prompt);
      }
    }),

    vscode.commands.registerCommand('pbp.refreshRules', async () => {
      await ruleManager.scanRuleFiles();
      rulesTreeProvider.refresh();
      vscode.window.showInformationMessage(t('Rules refreshed'));
    }),

    vscode.commands.registerCommand('pbp.refreshPrompts', async () => {
      await promptManager.refresh();
      vscode.window.showInformationMessage(t('Prompts refreshed'));
    }),

    vscode.commands.registerCommand('pbp.createPrompt', async () => {
      await openPromptEditor(undefined, async (result) => {
        try {
          await promptManager.createPrompt(
            {
              name: result.name,
              description: result.description,
              category: result.category,
              template: result.template,
              tags: result.tags,
              variables: result.variables,
            },
            result.target
          );

          vscode.window.showInformationMessage(`Prompt "${result.name}" created`);
        } catch (error) {
          vscode.window.showErrorMessage(`${t('Failed to create prompt')}: ${error}`);
        }
      });
    }),

    vscode.commands.registerCommand('pbp.editPrompt', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (!prompt) {
        vscode.window.showErrorMessage(t('No prompt selected'));
        return;
      }

      if (prompt.source === 'workspace' && prompt.filePath) {
        const document = await vscode.workspace.openTextDocument(prompt.filePath);
        await vscode.window.showTextDocument(document);
        return;
      }

      await openPromptEditor(prompt, async (result) => {
        try {
          await promptManager.updatePrompt(prompt.id, {
            name: result.name,
            description: result.description,
            category: result.category,
            template: result.template,
            tags: result.tags,
            variables: result.variables,
          });

          vscode.window.showInformationMessage(`Prompt "${result.name}" updated`);
        } catch (error) {
          vscode.window.showErrorMessage(`${t('Failed to update prompt')}: ${error}`);
        }
      });
    }),

    vscode.commands.registerCommand('pbp.deletePrompt', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (!prompt) {
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `${t('Are you sure you want to delete')} "${prompt.name}"?`,
        t('Delete'),
        t('Cancel')
      );

      if (confirm !== t('Delete')) {
        return;
      }

      const deleted = await promptManager.deletePrompt(prompt.id);
      if (deleted) {
        vscode.window.showInformationMessage(`Prompt "${prompt.name}" deleted`);
      } else {
        vscode.window.showErrorMessage(t('Failed to delete prompt'));
      }
    }),

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
        rulesTreeProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('pbp.createGlobalRule', async () => {
      const fileName = await vscode.window.showInputBox({
        prompt: t('Enter global rule file name (e.g. general-rules)'),
        placeHolder: 'my-global-rule',
      });

      if (fileName) {
        await ruleManager.createGlobalRule(fileName);
        rulesTreeProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('pbp.setActiveGlobalRule', async (item: { rule?: { isGlobal?: boolean; path?: string; name?: string } }) => {
      if (item?.rule?.isGlobal && item.rule.path) {
        await ruleManager.setActiveGlobalRule(item.rule.path);
        rulesTreeProvider.refresh();
        vscode.window.showInformationMessage(`"${item.rule.name}" ${t('set as active global rule.')}`);
      }
    }),

    vscode.commands.registerCommand('pbp.deleteRule', async (item: { rule?: { path?: string } }) => {
      if (!item?.rule?.path) {
        vscode.window.showErrorMessage(t('Invalid rule item'));
        return;
      }

      await ruleManager.deleteRuleFile(vscode.Uri.file(item.rule.path));
      rulesTreeProvider.refresh();
    }),
  ];

  context.subscriptions.push(treeView, rulesTreeView, ...commands);
  outputChannel.appendLine('Prompt by Prompt is now active');
}

export function deactivate(): void {
  promptManager?.dispose();
  outputChannel?.dispose();
}
