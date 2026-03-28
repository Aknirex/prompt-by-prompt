import * as vscode from 'vscode';
import { PromptRepository } from './core/prompt/PromptRepository';
import { PromptRenderer } from './core/prompt/PromptRenderer';
import { RuleScanner } from './core/rule/RuleScanner';
import { RuleResolver } from './core/rule/RuleResolver';
import { RuleProjector } from './core/rule/RuleProjector';
import { PolicyBindingResolver } from './core/policy/PolicyBindingResolver';
import { TeamPackLoader } from './core/policy/TeamPackLoader';
import { TeamPolicySync } from './core/team/TeamPolicySync';
import { ContextExtractor } from './core/context/ContextExtractor';
import { EnvelopeBuilder } from './core/execution/EnvelopeBuilder';
import { ExecutionHistory } from './core/execution/ExecutionHistory';
import { ExecutionPlanner } from './core/execution/ExecutionPlanner';
import { DispatchRouter } from './core/execution/DispatchRouter';
import { AIGeneratorService } from './core/ai/AIGeneratorService';
import { VscodeStateStore } from './vscode/VscodeStateStore';
import { VscodeConfigReader } from './vscode/VscodeConfigReader';
import { VscodeLogger } from './vscode/VscodeLogger';
import { VscodeEditorContext } from './vscode/VscodeEditorContext';
import { VscodeGitRunner } from './vscode/VscodeGitRunner';
import { AgentRegistry } from './vscode/agents/AgentRegistry';
import { GlobalStateKeys } from './state/StateKeys';

export interface Services {
  promptRepo: PromptRepository;
  promptRenderer: PromptRenderer;
  ruleScanner: RuleScanner;
  ruleResolver: RuleResolver;
  ruleProjector: RuleProjector;
  policyBinding: PolicyBindingResolver;
  teamPackLoader: TeamPackLoader;
  teamSync: TeamPolicySync;
  contextExtractor: ContextExtractor;
  envelopeBuilder: EnvelopeBuilder;
  executionHistory: ExecutionHistory;
  executionPlanner: ExecutionPlanner;
  dispatchRouter: DispatchRouter;
  agentRegistry: AgentRegistry;
  aiGenerator: AIGeneratorService;
  stateStore: VscodeStateStore;
  config: VscodeConfigReader;
  logger: VscodeLogger;
}

export function createServices(context: vscode.ExtensionContext): Services {
  const logger = new VscodeLogger();
  const stateStore = new VscodeStateStore(context);
  const config = new VscodeConfigReader();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const globalStoragePath = context.globalStorageUri.fsPath;

  const promptRepo = new PromptRepository(globalStoragePath, workspaceRoot);
  const promptRenderer = new PromptRenderer();

  const ruleScanner = new RuleScanner();
  const ruleResolver = new RuleResolver();
  const ruleProjector = new RuleProjector();

  const policyBinding = new PolicyBindingResolver(workspaceRoot, config);
  const teamPackLoader = new TeamPackLoader();
  const git = new VscodeGitRunner();
  const teamSync = new TeamPolicySync(globalStoragePath, git);

  const editorContextSource = new VscodeEditorContext();
  const contextExtractor = new ContextExtractor(editorContextSource);

  const envelopeBuilder = new EnvelopeBuilder();
  const executionHistory = new ExecutionHistory(stateStore, GlobalStateKeys.EXECUTION_HISTORY);

  const agentRegistry = new AgentRegistry();

  const executionPlanner = new ExecutionPlanner(
    executionHistory,
    {
      getSupportedBehaviors: (t) => agentRegistry.getSupportedBehaviors(t),
      isAvailable: (t) => agentRegistry.isAvailable(t),
      getAvailableAgentTypes: () => agentRegistry.getAvailableAgentTypes(),
    },
    {
      selectionMode: config.executionSelectionMode as 'last-execution' | 'initial-recommendation' | 'ask-every-time',
      defaultAgent: config.defaultAgent,
      defaultBehavior: config.defaultBehavior,
    }
  );

  const dispatchRouter = new DispatchRouter(agentRegistry);

  const aiGenerator = new AIGeneratorService(
    stateStore,
    () => ({
      defaultProvider: config.generatorProvider as import('./core/ai/AIProviderRegistry').AIProvider,
      defaultModel: config.generatorModel,
      systemPrompt: stateStore.getGlobal<string>(GlobalStateKeys.GENERATOR_SYSTEM_PROMPT) ?? '',
    })
  );

  return {
    promptRepo, promptRenderer,
    ruleScanner, ruleResolver, ruleProjector,
    policyBinding, teamPackLoader, teamSync,
    contextExtractor,
    envelopeBuilder, executionHistory, executionPlanner, dispatchRouter,
    agentRegistry,
    aiGenerator,
    stateStore, config, logger,
  };
}
