import * as vscode from 'vscode';
import { PromptTemplate, PromptVariable } from '../types/prompt';
import { AIProvider, AIService, DEFAULT_GENERATOR_SYSTEM_PROMPT } from '../services/aiService';
import { ContextEngine } from '../services/contextEngine';
import { t } from '../utils/i18n';
import { PreviewRequestData, buildPreviewVariables, normalizeDraft, parseDraftYaml, serializeDraft } from './promptEditorState';
import { buildPromptEditorHtml, PromptEditorStrings } from './promptEditorHtml';

export interface PromptEditorResult {
  name: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables?: PromptVariable[];
  target: 'workspace' | 'global';
}

export class PromptEditorPanel {
  public static currentPanel: PromptEditorPanel | undefined;
  public static readonly viewType = 'pbp.promptEditor';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _context: vscode.ExtensionContext;
  private readonly _aiService: AIService;
  private readonly _contextEngine: ContextEngine;
  private readonly _builtinVariables: string[];
  private readonly _defaultTarget: 'workspace' | 'global';
  private _existingPrompt: PromptTemplate | undefined;
  private _onSave: ((result: PromptEditorResult) => void) | undefined;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    context: vscode.ExtensionContext,
    existingPrompt?: PromptTemplate,
    defaultTarget: 'workspace' | 'global' = 'global',
    onSave?: (result: PromptEditorResult) => void
  ): PromptEditorPanel {
    const column = vscode.window.activeTextEditor?.viewColumn;

    if (PromptEditorPanel.currentPanel) {
      PromptEditorPanel.currentPanel._panel.reveal(column);
      PromptEditorPanel.currentPanel._existingPrompt = existingPrompt;
      PromptEditorPanel.currentPanel._onSave = onSave;
      PromptEditorPanel.currentPanel._update();
      return PromptEditorPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      PromptEditorPanel.viewType,
      existingPrompt ? t('Edit: {0}', existingPrompt.name) : t('New Prompt'),
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    PromptEditorPanel.currentPanel = new PromptEditorPanel(panel, context, existingPrompt, defaultTarget, onSave);
    return PromptEditorPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    existingPrompt?: PromptTemplate,
    defaultTarget: 'workspace' | 'global' = 'global',
    onSave?: (result: PromptEditorResult) => void
  ) {
    this._panel = panel;
    this._context = context;
    this._existingPrompt = existingPrompt;
    this._defaultTarget = defaultTarget;
    this._onSave = onSave;
    this._aiService = new AIService(context);
    this._contextEngine = new ContextEngine();
    this._builtinVariables = this._contextEngine.getBuiltinVariables();

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'save':
          this._onSave?.(message.data);
          this._panel.dispose();
          break;
        case 'saveFromYaml':
          await this._handleSaveFromYaml(message.data);
          break;
        case 'cancel':
          this._panel.dispose();
          break;
        case 'generate':
          await this._handleGenerate(message.data);
          break;
        case 'preview':
          await this._handlePreview(message.data);
          break;
        case 'syncYaml':
          this._panel.webview.postMessage({ command: 'syncYamlResult', yaml: serializeDraft(message.data) });
          break;
        case 'applyYaml':
          await this._handleApplyYaml(message.data);
          break;
      }
    }, null, this._disposables);
  }

  private async _handleGenerate(data: { description: string; provider: AIProvider; model: string }): Promise<void> {
    if (!data.description.trim()) {
      this._panel.webview.postMessage({ command: 'generateResult', error: t('Please enter a description for the prompt you want to generate.') });
      return;
    }

    this._panel.webview.postMessage({ command: 'generateStart' });
    const systemPrompt = (this._context.globalState.get('pbp.generatorSystemPrompt') as string) || DEFAULT_GENERATOR_SYSTEM_PROMPT;
    const result = await this._aiService.generatePrompt({ userDescription: data.description, systemPrompt, provider: data.provider, model: data.model });

    if (result.success && (result.draft || result.prompt)) {
      const draft = normalizeDraft(result.draft ?? {
        name: '',
        description: data.description,
        category: 'General',
        tags: [],
        template: result.prompt ?? '',
      });
      this._panel.webview.postMessage({ command: 'generateResult', draft });
      await this._handlePreview({ template: draft.template, variables: draft.variables });
      return;
    }

    this._panel.webview.postMessage({ command: 'generateResult', error: result.error || t('Failed to generate prompt') });
  }

  private async _handlePreview(data: PreviewRequestData): Promise<void> {
    try {
      const template = data.template || '';
      const variables = data.variables || [];
      const context = await this._contextEngine.extractContext();
      const preview = await this._contextEngine.renderTemplate(
        { id: 'preview', name: 'Preview', description: '', category: '', tags: [], version: '1.0.0', template, variables },
        context,
        buildPreviewVariables(this._contextEngine, this._builtinVariables, template, variables)
      );
      this._panel.webview.postMessage({ command: 'previewResult', preview });
    } catch (error) {
      this._panel.webview.postMessage({ command: 'previewResult', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async _handleSaveFromYaml(data: { yamlText: string; target: 'workspace' | 'global' }): Promise<void> {
    try {
      const parsed = parseDraftYaml(data.yamlText);
      this._onSave?.({ ...parsed, target: data.target });
      this._panel.dispose();
    } catch (error) {
      this._panel.webview.postMessage({ command: 'saveError', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async _handleApplyYaml(data: { yamlText: string }): Promise<void> {
    try {
      const parsed = parseDraftYaml(data.yamlText);
      this._panel.webview.postMessage({ command: 'applyYamlResult', data: parsed });
    } catch (error) {
      this._panel.webview.postMessage({ command: 'applyYamlResult', error: error instanceof Error ? error.message : String(error) });
    }
  }

  private _update(): void {
    const prompt = this._existingPrompt;
    const config = vscode.workspace.getConfiguration('pbp');
    const defaultProvider = (config.get('defaultModel') || 'ollama') as AIProvider;
    const initialYamlDraft = serializeDraft({
      name: prompt?.name || '',
      description: prompt?.description || '',
      category: prompt?.category || '',
      tags: prompt?.tags || [],
      template: prompt?.template || '',
      variables: prompt?.variables,
    });

    const strings: PromptEditorStrings = {
      defaultLabel: t('Default'),
      previewBasedOnForm: t('Preview is based on the last form state. Apply YAML to the form to refresh the rendered preview from YAML edits.'),
      refreshingPreview: t('Refreshing preview...'),
      previewUnavailable: t('Preview unavailable right now.'),
      previewStillReflects: t('Preview still reflects the form state. Apply YAML to form to preview YAML edits.'),
      previewUsesContext: t('Preview uses current editor context plus schema defaults.'),
      yamlRefreshed: t('YAML refreshed from the current form state.'),
      yamlApplied: t('YAML applied to the shared form state.'),
      failedToSaveYaml: t('Failed to save YAML prompt definition.'),
      nameRequired: t('Name is required'),
      templateRequired: t('Template is required'),
      noSchemaVariables: t('No schema variables defined yet. Add variables here when the prompt needs user input beyond built-in editor context.'),
      variableName: t('Variable Name'),
      description: t('Description'),
      type: t('Type'),
      defaultValue: t('Default Value'),
      placeholder: t('Placeholder'),
      enumValues: t('Enum Values'),
      required: t('Required'),
      multiline: t('Multiline'),
      remove: t('Remove'),
      whatShouldUserProvide: t('What should the user provide?'),
      optional: t('Optional'),
      shownDuringInput: t('Shown during input collection'),
    };

    this._panel.webview.html = buildPromptEditorHtml({
      prompt,
      providers: this._aiService.getAvailableProviders(),
      defaultProvider,
      builtinVariables: this._builtinVariables,
      strings,
      defaultTarget: this._defaultTarget,
      initialYamlDraft,
    });
  }

  public dispose(): void {
    PromptEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }
}
