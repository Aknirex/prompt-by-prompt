/**
 * Prompt by Prompt - VS Code Extension Entry Point
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PromptManager } from './services/promptManager';
import { ContextEngine } from './services/contextEngine';
import { AgentService, initAgentService } from './services/agentService';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';
import { RulesTreeProvider } from './providers/rulesTreeProvider';
import { TeamPoliciesTreeProvider } from './providers/teamPoliciesTreeProvider';
import { PromptEditorPanel, PromptEditorResult } from './providers/promptEditorPanel';
import { RuleEditorPanel } from './providers/ruleEditorPanel';
import { SettingsPanel } from './providers/settingsPanel';
import { ExtensionConfig, PromptTemplate, PromptVariable } from './types/prompt';
import { RuleFile } from './types/rule';
import { t } from './utils/i18n';
import { RuleManager } from './services/ruleManager';
import { ExecutionService } from './services/executionService';
import { TeamPolicyService } from './services/teamPolicyService';
import { RuleProjectionService } from './services/ruleProjectionService';
import { getWorkspaceFolderForUri, getWorkspaceFolders } from './utils/workspace';

async function showExecutionPreview(prompt: PromptTemplate, forcePicker = false): Promise<void> {
  const preview = await executionService.previewPrompt(prompt, { forcePicker });
  if (!preview) {
    return;
  }

  const document = await vscode.workspace.openTextDocument({
    language: 'markdown',
    content: preview.previewText,
  });
  await vscode.window.showTextDocument(document, { preview: true });
}

let promptManager: PromptManager;
let contextEngine: ContextEngine;
let agentService: AgentService;
let treeProvider: PromptsTreeProvider;
let rulesTreeProvider: RulesTreeProvider;
let teamPoliciesTreeProvider: TeamPoliciesTreeProvider;
let ruleManager: RuleManager;
let executionService: ExecutionService;
let ruleProjectionService: RuleProjectionService;
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;
let teamPolicySyncTimer: NodeJS.Timeout | undefined;
let teamPolicyService: TeamPolicyService;
let teamPolicyStatusBarItem: vscode.StatusBarItem | undefined;

function log(message: string): void {
  outputChannel?.appendLine(message);
}

function logManifestDiagnostics(): void {
  const extension = vscode.extensions.getExtension('aknirex.prompt-by-prompt');
  const manifest = extension?.packageJSON as
    | {
        version?: string;
        contributes?: {
          viewsContainers?: unknown;
          views?: unknown;
          commands?: unknown;
        };
      }
    | undefined;

  log('[Diagnostics] activate() reached');
  log(`[Diagnostics] extensionPath: ${extension?.extensionPath || extensionContext.extensionPath}`);
  log(`[Diagnostics] extensionUri: ${extensionContext.extensionUri.toString()}`);
  log(`[Diagnostics] package version: ${manifest?.version || 'unknown'}`);
  log(`[Diagnostics] viewsContainers: ${JSON.stringify(manifest?.contributes?.viewsContainers ?? null)}`);
  log(`[Diagnostics] views: ${JSON.stringify(manifest?.contributes?.views ?? null)}`);
  log('[Diagnostics] custom activity bar container enabled');
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
    vscode.window.showWarningMessage(t('No prompts available.'));
    return undefined;
  }

  const items = prompts.map((prompt) => ({
    label: prompt.name,
    description: prompt.description,
    prompt,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: t('Select a prompt to run'),
    title: t('Prompt by Prompt'),
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

async function openRuleEditor(
  existingRule: RuleFile | undefined,
  onSave: (result: { fileName: string; content: string }) => Promise<void>,
  initialFileName?: string
): Promise<void> {
  RuleEditorPanel.createOrShow(
    extensionContext.extensionUri,
    existingRule,
    async (result) => {
      await onSave(result);
    },
    initialFileName ? { initialFileName } : undefined
  );
}

async function refreshTeamPolicies(options?: { silent?: boolean }): Promise<void> {
  await teamPolicyService.refresh();
  await Promise.all([promptManager.refresh(), ruleManager.scanRuleFiles()]);
  treeProvider.setPrompts(promptManager.getAllPrompts());
  rulesTreeProvider.refresh();
  teamPoliciesTreeProvider.refresh();
  updateTeamPolicyStatusBar();
  await refreshProjectedRuleFile({ silent: true });

  if (!options?.silent) {
    const sourceStates = teamPolicyService.readPersistedSourceStates();
    const failedStates = sourceStates.filter((state) => state.status === 'error');
    if (failedStates.length > 0) {
      const message = `Shared library sync finished with ${failedStates.length} issue(s): ${failedStates.map((state) => `${state.sourceId}: ${state.lastSyncError || 'unknown error'}`).join('; ')}`;
      log(`[TeamPolicySync] ${message}`);
      vscode.window.showWarningMessage(message);
    } else {
      vscode.window.showInformationMessage(t('Shared libraries synced'));
    }
  } else {
    const failedStates = teamPolicyService.readPersistedSourceStates().filter((state) => state.status === 'error');
    if (failedStates.length > 0) {
      log(`[TeamPolicySync] Background sync issues: ${failedStates.map((state) => `${state.sourceId}: ${state.lastSyncError || 'unknown error'}`).join('; ')}`);
    }
  }
}

async function refreshProjectedRuleFile(options?: { silent?: boolean }): Promise<void> {
  if (!ruleProjectionService?.shouldAutoRefresh()) {
    return;
  }

  try {
    const result = await ruleProjectionService.rebuildProjectedRuleFile({ silent: options?.silent });
    if (!options?.silent && result.written && result.path) {
      vscode.window.showInformationMessage(`Projected rule file rebuilt at ${result.path}`);
    }
  } catch (error) {
    log(`[RuleProjection] ${String(error)}`);
    if (!options?.silent) {
      vscode.window.showWarningMessage(`Failed to rebuild projected rule file: ${String(error)}`);
    }
  }
}

function getSourceStateFromItem(value: unknown): { sourceState?: { sourceId?: string; type?: string } } | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  return value as { sourceState?: { sourceId?: string; type?: string } };
}

function resolveWorkspaceRootForCopy(): string | undefined {
  return getWorkspaceFolderForUri(vscode.window.activeTextEditor?.document.uri)?.uri.fsPath
    ?? getWorkspaceFolders()[0]?.uri.fsPath;
}

function resolveUniqueFilePath(rootPath: string, fileName: string): string {
  const parsed = path.parse(fileName);
  let candidate = fileName;
  let suffix = 1;

  while (fs.existsSync(path.join(rootPath, candidate))) {
    candidate = `${parsed.name}-${suffix}${parsed.ext}`;
    suffix += 1;
  }

  return path.join(rootPath, candidate);
}

function updateTeamPolicyStatusBar(): void {
  if (!teamPolicyStatusBarItem) {
    return;
  }

  const sourceStates = teamPolicyService.readPersistedSourceStates();
  if (sourceStates.length === 0) {
    teamPolicyStatusBarItem.text = '$(sync-ignored) Shared Libraries';
    teamPolicyStatusBarItem.tooltip = 'No shared library sources configured';
    teamPolicyStatusBarItem.backgroundColor = undefined;
    return;
  }

  const failedStates = sourceStates.filter((state) => state.status === 'error');
  if (failedStates.length > 0) {
    const healthyCount = sourceStates.length - failedStates.length;
    teamPolicyStatusBarItem.text = `$(warning) Shared Libraries ${healthyCount}/${sourceStates.length}`;
    teamPolicyStatusBarItem.tooltip = `Sync issues: ${failedStates.map((state) => `${state.sourceId}: ${state.lastSyncError || 'unknown error'}`).join('; ')}`;
    teamPolicyStatusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    return;
  }

  const latestSync = sourceStates
    .map((state) => state.lastSyncedAt)
    .filter((value): value is string => typeof value === 'string')
    .sort();
  const latestSyncValue = latestSync.length > 0 ? latestSync[latestSync.length - 1] : undefined;
  teamPolicyStatusBarItem.text = `$(sync) Shared Libraries ${sourceStates.length}`;
  teamPolicyStatusBarItem.tooltip = latestSyncValue
    ? `Shared libraries synced. Last sync: ${latestSyncValue}`
    : 'Shared libraries synced';
  teamPolicyStatusBarItem.backgroundColor = undefined;
}

async function connectTeamPolicySource(): Promise<void> {
  const type = await vscode.window.showQuickPick([
    { label: 'Git Sync Source', value: 'git', description: 'Recommended for shared libraries that live in Git' },
    { label: 'Local Folder', value: 'local-folder', description: 'Read a shared library folder directly from disk' },
  ], {
    placeHolder: 'Select a shared library source type',
    title: 'Connect Shared Source',
  });

  if (!type) {
    return;
  }

  const locationPrompt = type.value === 'git'
    ? 'Enter the Git repository URL for the shared library'
    : 'Enter the local folder path for the shared library';
  const location = await vscode.window.showInputBox({
    prompt: locationPrompt,
    placeHolder: type.value === 'git' ? 'https://git.example.com/shared-libraries.git' : 'C:\\shared-library-pack',
    ignoreFocusOut: true,
  });

  if (!location) {
    return;
  }

  const sourceId = await vscode.window.showInputBox({
    prompt: 'Choose a short source ID used for the local sync cache',
    value: location
      .split(/[\\/]/)
      .filter(Boolean)
      .pop()
      ?.replace(/\.git$/i, '')
      ?.toLowerCase()
      ?.replace(/[^a-z0-9]+/g, '-') || 'shared-library-source',
    ignoreFocusOut: true,
  });

  if (!sourceId) {
    return;
  }

  const candidateSource = type.value === 'git'
    ? { id: sourceId, type: 'git' as const, url: location, trust: 'trusted' as const }
    : { id: sourceId, type: 'local-folder' as const, path: location, trust: 'trusted' as const };
  const validation = await teamPolicyService.validateSource(candidateSource);
  if (!validation.ok) {
    vscode.window.showWarningMessage(`Unable to connect shared library source: ${validation.message}`);
    return;
  }

  const config = vscode.workspace.getConfiguration('pbp');
  const existingSources = config.get<unknown[]>('teamPolicySources', []);
  const nextSources = [
    ...existingSources.filter((entry) => !(entry && typeof entry === 'object' && (entry as { id?: string }).id === sourceId)),
    candidateSource,
  ];

  await config.update('teamPolicySources', nextSources, vscode.ConfigurationTarget.Global);
  await refreshTeamPolicies();
  vscode.window.showInformationMessage(`Shared library source "${sourceId}" connected.`);
}

async function copySharedLibraryRuleToWorkspace(value?: unknown): Promise<void> {
  const candidate = value as {
    rule?: { ruleId?: string; sourceFile?: string };
    pack?: { name?: string; sourcePath?: string };
  } | undefined;

  if (!candidate?.rule?.ruleId || !candidate.pack?.sourcePath) {
    vscode.window.showErrorMessage('Invalid shared library rule item.');
    return;
  }

  const sourceFile = candidate.rule.sourceFile || `${candidate.rule.ruleId}.md`;
  const sourcePath = path.join(candidate.pack.sourcePath, 'rules', sourceFile);
  if (!fs.existsSync(sourcePath)) {
    vscode.window.showWarningMessage(`Shared library rule source was not found at ${sourcePath}.`);
    return;
  }

  const rootPath = resolveWorkspaceRootForCopy();
  if (!rootPath) {
    vscode.window.showWarningMessage('Open a workspace before copying a shared rule.');
    return;
  }

  const content = await fs.promises.readFile(sourcePath, 'utf8');
  const destinationPath = resolveUniqueFilePath(rootPath, sourceFile);
  await fs.promises.writeFile(destinationPath, content, 'utf8');
  await ruleManager.scanRuleFiles();
  rulesTreeProvider.refresh();
  teamPoliciesTreeProvider.refresh();
  await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(destinationPath));
  vscode.window.showInformationMessage(`Shared rule copied to ${destinationPath}`);
}

async function copySharedLibraryPromptToWorkspace(value?: unknown): Promise<void> {
  const candidate = value as {
    prompt?: {
      id?: string;
      name?: string;
      description?: string;
      category?: string;
      tags?: string[];
      template?: string;
      variables?: unknown[];
      author?: string;
      version?: string;
    };
  } | undefined;

  if (!candidate?.prompt?.id || !candidate.prompt.name || !candidate.prompt.template) {
    vscode.window.showErrorMessage('Invalid shared library prompt item.');
    return;
  }

  const rootPath = resolveWorkspaceRootForCopy();
  if (!rootPath) {
    vscode.window.showWarningMessage('Open a workspace before copying a shared prompt.');
    return;
  }

  const created = await promptManager.createPrompt(
    {
      name: candidate.prompt.name,
      description: candidate.prompt.description || '',
      category: candidate.prompt.category || 'Shared Library',
      tags: candidate.prompt.tags || [],
      template: candidate.prompt.template,
      variables: candidate.prompt.variables as PromptVariable[] | undefined,
      author: candidate.prompt.author,
      version: candidate.prompt.version || '1.0.0',
    },
    'workspace'
  );

  if (created.filePath) {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(created.filePath));
  }

  vscode.window.showInformationMessage(`Shared prompt copied as "${created.name}".`);
}

function configureTeamPolicySync(context: vscode.ExtensionContext): void {
  if (teamPolicySyncTimer) {
    clearInterval(teamPolicySyncTimer);
    teamPolicySyncTimer = undefined;
  }

  const config = vscode.workspace.getConfiguration('pbp');
  const autoSync = config.get<boolean>('autoSyncTeamPolicies', false);
  const intervalMinutes = Math.max(1, config.get<number>('teamPolicySyncIntervalMinutes', 30));

  if (!autoSync) {
    return;
  }

  teamPolicySyncTimer = setInterval(() => {
    void refreshTeamPolicies({ silent: true });
  }, intervalMinutes * 60 * 1000);

  context.subscriptions.push({
    dispose: () => {
      if (teamPolicySyncTimer) {
        clearInterval(teamPolicySyncTimer);
        teamPolicySyncTimer = undefined;
      }
    },
  });
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Prompt by Prompt');
  outputChannel.appendLine('Prompt by Prompt is activating...');
  initAgentService(outputChannel);
  extensionContext = context;
  logManifestDiagnostics();

  const config = getConfig();
  teamPolicyService = new TeamPolicyService(context);
  promptManager = new PromptManager(context, config, teamPolicyService, true);
  contextEngine = new ContextEngine();
  agentService = new AgentService();
  ruleManager = new RuleManager(context, teamPolicyService, true);
  executionService = new ExecutionService(context, contextEngine, agentService, ruleManager, log);
  ruleProjectionService = new RuleProjectionService(context, ruleManager);
  treeProvider = new PromptsTreeProvider();
  rulesTreeProvider = new RulesTreeProvider(ruleManager);
  teamPoliciesTreeProvider = new TeamPoliciesTreeProvider(ruleManager);

  await teamPolicyService.refresh();
  await Promise.all([promptManager.initialize(), ruleManager.initialize()]);
  await refreshProjectedRuleFile({ silent: true });
  configureTeamPolicySync(context);
  teamPolicyStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 90);
  teamPolicyStatusBarItem.command = 'pbp.syncTeamPolicies';
  teamPolicyStatusBarItem.name = 'Prompt by Prompt Team Policies';
  teamPolicyStatusBarItem.show();

  treeProvider.setPrompts(promptManager.getAllPrompts());
  rulesTreeProvider.refresh();
  teamPoliciesTreeProvider.refresh();
  updateTeamPolicyStatusBar();

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
        teamPoliciesTreeProvider.refresh();
      }

      if (event.affectsConfiguration('pbp.promptsDir')) {
        await promptManager.refresh();
      }

      if (
        event.affectsConfiguration('pbp.teamPolicySources')
        || event.affectsConfiguration('pbp.autoSyncTeamPolicies')
        || event.affectsConfiguration('pbp.teamPolicySyncIntervalMinutes')
        || event.affectsConfiguration('pbp.passiveRuleProjection')
      ) {
        configureTeamPolicySync(context);
        await refreshTeamPolicies({ silent: true });
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

  const teamPoliciesTreeView = vscode.window.createTreeView('pbp.teamPoliciesView', {
    treeDataProvider: teamPoliciesTreeProvider,
    showCollapseAll: true,
  });

  const commands = [
    vscode.commands.registerCommand('pbp.openSettings', () => {
      SettingsPanel.createOrShow(extensionContext.extensionUri, extensionContext, agentService);
    }),

    vscode.commands.registerCommand('pbp.connectTeamPolicySource', async () => {
      await connectTeamPolicySource();
    }),

    vscode.commands.registerCommand('pbp.retryTeamPolicySourceSync', async (value?: unknown) => {
      const sourceId = getSourceStateFromItem(value)?.sourceState?.sourceId;
      await refreshTeamPolicies();
      if (sourceId) {
        vscode.window.showInformationMessage(`Retried sync for shared library source "${sourceId}".`);
      }
    }),

    vscode.commands.registerCommand('pbp.reconnectTeamPolicySource', async (value?: unknown) => {
      const sourceId = getSourceStateFromItem(value)?.sourceState?.sourceId;
      if (!sourceId) {
        vscode.window.showErrorMessage('Invalid shared library source item.');
        return;
      }

      const confirm = await vscode.window.showWarningMessage(
        `Reconnect "${sourceId}"? This clears its local sync cache and downloads the shared library source again.`,
        { modal: true },
        'Reconnect'
      );
      if (confirm !== 'Reconnect') {
        return;
      }

      await teamPolicyService.reconnectSource(sourceId);
      await refreshTeamPolicies();
      vscode.window.showInformationMessage(`Reconnected shared library source "${sourceId}".`);
    }),

    vscode.commands.registerCommand('pbp.copySharedLibraryRuleToWorkspace', async (value?: unknown) => {
      await copySharedLibraryRuleToWorkspace(value);
    }),

    vscode.commands.registerCommand('pbp.copySharedLibraryPromptToWorkspace', async (value?: unknown) => {
      await copySharedLibraryPromptToWorkspace(value);
    }),

    vscode.commands.registerCommand('pbp.showDiagnostics', async () => {
      logManifestDiagnostics();
      outputChannel.show(true);
      void vscode.window.showInformationMessage(t('Prompt by Prompt diagnostics written to the output channel.'));
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
        await showExecutionPreview(prompt);
      }
    }),

    vscode.commands.registerCommand('pbp.selectExecutionTarget', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (!prompt) {
        return;
      }

      const preset = await executionService.selectExecutionTarget(prompt);
      if (!preset) {
        return;
      }

      vscode.window.showInformationMessage(
        t(
          'Execution target for "{0}" saved as {1}.',
          prompt.name,
          `${preset.target.kind === 'agent' ? preset.target.agentType : preset.target.kind}${preset.behavior ? ` (${preset.behavior})` : ''}`
        )
      );
    }),

    vscode.commands.registerCommand('pbp.rerunLastTarget', async (value?: unknown) => {
      const prompt = await pickPromptIfNeeded(value);
      if (prompt) {
        await executionService.rerunLastTarget(prompt);
      }
    }),

    vscode.commands.registerCommand('pbp.refreshRules', async () => {
      await refreshTeamPolicies({ silent: true });
      vscode.window.showInformationMessage(t('Rules refreshed'));
    }),

    vscode.commands.registerCommand('pbp.syncTeamPolicies', async () => {
      await refreshTeamPolicies();
    }),

    vscode.commands.registerCommand('pbp.rebuildProjectedRuleFile', async () => {
      try {
        const result = await ruleProjectionService.rebuildProjectedRuleFile();
        if (!result.written) {
          const reason = result.reason === 'disabled'
            ? 'Passive rule projection is disabled in settings.'
            : 'No rule file was generated.';
          vscode.window.showInformationMessage(reason);
          return;
        }

        vscode.window.showInformationMessage(`Projected rule file rebuilt at ${result.path}`);
      } catch (error) {
        vscode.window.showWarningMessage(`Failed to rebuild projected rule file: ${String(error)}`);
      }
    }),

    vscode.commands.registerCommand('pbp.openProjectedRuleFile', async () => {
      const projectedPath = ruleProjectionService.getProjectedRuleFilePath();
      if (!projectedPath) {
        vscode.window.showInformationMessage('Passive rule projection is disabled in settings.');
        return;
      }

      try {
        const document = await vscode.workspace.openTextDocument(projectedPath);
        await vscode.window.showTextDocument(document);
      } catch {
        vscode.window.showWarningMessage(`Projected rule file was not found at ${projectedPath}. Rebuild it first.`);
      }
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

          vscode.window.showInformationMessage(t('Prompt "{0}" created', result.name));
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

      if (prompt.source === 'team-pack') {
        if (prompt.filePath) {
          const document = await vscode.workspace.openTextDocument(prompt.filePath);
          await vscode.window.showTextDocument(document, { preview: true });
          return;
        }

        vscode.window.showInformationMessage(t('Shared library prompts are read-only right now. Run them directly or copy them into workspace/global later.'));
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

          vscode.window.showInformationMessage(t('Prompt "{0}" updated', result.name));
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

      if (prompt.source === 'team-pack') {
        vscode.window.showInformationMessage(t('Shared library prompts cannot be deleted.'));
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
        vscode.window.showInformationMessage(t('Prompt "{0}" deleted', prompt.name));
      } else {
        vscode.window.showErrorMessage(t('Failed to delete prompt'));
      }
    }),

    vscode.commands.registerCommand('pbp.createWorkspaceRule', async () => {
      const config = vscode.workspace.getConfiguration('pbp');
      const defaultRuleFile = config.get<string>('defaultRuleFile') || 'ask';
      const knownRules = ['AGENTS.md', '.clinerules', '.cursorrules', '.windsurfrules', '.aiderrules', '.codeiumrules'];
      const initialFileName = defaultRuleFile !== 'ask' && knownRules.includes(defaultRuleFile)
        ? defaultRuleFile
        : undefined;

      await openRuleEditor(undefined, async (result) => {
        try {
          await ruleManager.createGlobalRule(result.fileName, result.content);
          rulesTreeProvider.refresh();
          teamPoliciesTreeProvider.refresh();
          await refreshProjectedRuleFile({ silent: true });
          vscode.window.showInformationMessage(t('Rule "{0}" created', result.fileName));
        } catch (error) {
          vscode.window.showErrorMessage(`${t('Failed to create rule')}: ${error}`);
        }
      }, initialFileName);
    }),

    vscode.commands.registerCommand('pbp.createGlobalRule', async () => {
      await openRuleEditor(undefined, async (result) => {
        try {
          await ruleManager.createGlobalRule(result.fileName, result.content);
          rulesTreeProvider.refresh();
          teamPoliciesTreeProvider.refresh();
          await refreshProjectedRuleFile({ silent: true });
          vscode.window.showInformationMessage(t('Rule "{0}" created', result.fileName));
        } catch (error) {
          vscode.window.showErrorMessage(`${t('Failed to create rule')}: ${error}`);
        }
      });
    }),

    vscode.commands.registerCommand('pbp.editRule', async (item: { rule?: RuleFile }) => {
      const rule = item?.rule;
      if (!rule?.path) {
        vscode.window.showErrorMessage(t('Invalid rule item'));
        return;
      }

      if (rule.scope !== 'workspace' && rule.scope !== 'global') {
        vscode.window.showInformationMessage(t('Shared library rules are read-only.'));
        return;
      }

      await openRuleEditor(rule, async (result) => {
        try {
          await ruleManager.updateRuleFile(rule, result.fileName, result.content);
          rulesTreeProvider.refresh();
          teamPoliciesTreeProvider.refresh();
          await refreshProjectedRuleFile({ silent: true });
          vscode.window.showInformationMessage(t('Rule "{0}" updated', result.fileName));
        } catch (error) {
          vscode.window.showErrorMessage(`${t('Failed to update rule')}: ${error}`);
        }
      });
    }),

    vscode.commands.registerCommand('pbp.setActiveGlobalRule', async (item: { rule?: { isGlobal?: boolean; path?: string; name?: string } }) => {
      if (item?.rule?.path) {
        await ruleManager.setActiveGlobalRule(item.rule.path);
        rulesTreeProvider.refresh();
        teamPoliciesTreeProvider.refresh();
        await refreshProjectedRuleFile({ silent: true });
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
      teamPoliciesTreeProvider.refresh();
      await refreshProjectedRuleFile({ silent: true });
    }),
  ];

  context.subscriptions.push(treeView, rulesTreeView, teamPoliciesTreeView, ...commands);
  if (teamPolicyStatusBarItem) {
    context.subscriptions.push(teamPolicyStatusBarItem);
  }
  outputChannel.appendLine('Prompt by Prompt is now active');
}

export function deactivate(): void {
  if (teamPolicySyncTimer) {
    clearInterval(teamPolicySyncTimer);
    teamPolicySyncTimer = undefined;
  }
  promptManager?.dispose();
  teamPolicyStatusBarItem?.dispose();
  outputChannel?.dispose();
}
