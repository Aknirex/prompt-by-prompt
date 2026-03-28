import * as vscode from 'vscode';
import { createServices } from './container';
import { registerPromptCommands } from './commands/promptCommands';
import { registerRuleCommands } from './commands/ruleCommands';
import { registerTeamPolicyCommands } from './commands/teamPolicyCommands';
import { registerExecutionCommands } from './commands/executionCommands';
import { registerProjectionCommands } from './commands/projectionCommands';
import { registerSettingsCommands } from './commands/settingsCommands';
import { PromptsTreeProvider } from './providers/promptsTreeProvider';
import { RulesTreeProvider } from './providers/rulesTreeProvider';
import { TeamPoliciesTreeProvider } from './providers/teamPoliciesTreeProvider';
import { migrateIfNeeded } from './core/prompt/PromptMigration';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const svc = createServices(context);

  // Run legacy migration on first activation after upgrade
  await migrateIfNeeded(svc.stateStore, svc.promptRepo, context.extensionPath);

  // Tree providers
  const promptsTree = new PromptsTreeProvider(svc.promptRepo);
  const rulesTree = new RulesTreeProvider();
  const teamTree = new TeamPoliciesTreeProvider();

  // Register views with error handling for view container initialization issues
  const registerViews = () => {
    try {
      context.subscriptions.push(
        vscode.window.createTreeView('pbp.promptsView', { treeDataProvider: promptsTree, showCollapseAll: true }),
        vscode.window.createTreeView('pbp.rulesView', { treeDataProvider: rulesTree, showCollapseAll: true }),
        vscode.window.createTreeView('pbp.teamPoliciesView', { treeDataProvider: teamTree, showCollapseAll: true }),
      );
    } catch (error) {
      // If view container is not ready, retry after a short delay
      svc.logger.log('View container not ready, retrying...');
      setTimeout(registerViews, 100);
    }
  };

  // Initial registration attempt
  registerViews();

  await promptsTree.reload();

  // Commands
  registerPromptCommands(context, svc);
  registerRuleCommands(context, svc);
  registerTeamPolicyCommands(context, svc);
  registerExecutionCommands(context, svc);
  registerProjectionCommands(context, svc);
  registerSettingsCommands(context, svc);

  svc.logger.log('Prompt by Prompt is now active');
}

export function deactivate(): void {
  // Disposables are cleaned up via context.subscriptions
}
