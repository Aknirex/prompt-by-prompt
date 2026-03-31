import * as vscode from 'vscode';
import { KNOWN_RULE_FILES } from '../services/ruleManager';
import { RuleFile } from '../types/rule';
import { t } from '../utils/i18n';
import { normalizeRuleDraft, parseDraftYaml, RuleEditorDraft, RuleEditorFilePayload, serializeDraft } from './ruleEditorState';
import { buildRuleEditorHtml } from './ruleEditorHtml';

export class RuleEditorPanel {
  public static currentPanel: RuleEditorPanel | undefined;
  public static readonly viewType = 'pbp.ruleEditor';

  private readonly _panel: vscode.WebviewPanel;
  private _draft: RuleEditorDraft;
  private _isEditing: boolean;
  private _onSave: ((result: RuleEditorFilePayload) => void) | undefined;
  private readonly _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    existingRule: RuleFile | undefined,
    onSave?: (result: RuleEditorFilePayload) => void,
    options?: { initialFileName?: string }
  ): RuleEditorPanel {
    const column = vscode.window?.activeTextEditor?.viewColumn;
    const initialFileName = options?.initialFileName;
    const selectedFileName = existingRule ? existingRule.name : (initialFileName || KNOWN_RULE_FILES[0] || 'AGENTS.md');

    if (RuleEditorPanel.currentPanel) {
      RuleEditorPanel.currentPanel._panel.reveal(column);
      RuleEditorPanel.currentPanel._draft = normalizeRuleDraft({
        fileName: selectedFileName,
        title: existingRule?.title ?? '',
        kind: existingRule?.kind ?? 'instruction',
        priority: existingRule?.priority ?? 100,
        required: existingRule?.required ?? false,
        body: existingRule?.content ?? '',
      });
      RuleEditorPanel.currentPanel._isEditing = Boolean(existingRule);
      RuleEditorPanel.currentPanel._onSave = onSave;
      RuleEditorPanel.currentPanel._panel.title = existingRule ? t('Edit Rule: {0}', existingRule.name) : t('New Rule');
      RuleEditorPanel.currentPanel._update();
      return RuleEditorPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      RuleEditorPanel.viewType,
      existingRule ? t('Edit Rule: {0}', existingRule.name) : t('New Rule'),
      column || vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    const draft = normalizeRuleDraft({
      fileName: selectedFileName,
      title: existingRule?.title ?? '',
      kind: existingRule?.kind ?? 'instruction',
      priority: existingRule?.priority ?? 100,
      required: existingRule?.required ?? false,
      body: existingRule?.content ?? '',
    });

    RuleEditorPanel.currentPanel = new RuleEditorPanel(panel, draft, Boolean(existingRule), onSave);
    return RuleEditorPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    draft: RuleEditorDraft,
    isEditing: boolean,
    onSave?: (result: RuleEditorFilePayload) => void
  ) {
    this._panel = panel;
    this._draft = draft;
    this._isEditing = isEditing;
    this._onSave = onSave;

    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case 'save':
          this._onSave?.(this.buildPayload(message.data));
          this._panel.dispose();
          break;
        case 'saveFromYaml':
          this._onSave?.(this.buildPayload({
            fileName: message.data?.fileName,
            content: message.data?.yamlText ?? '',
          }));
          this._panel.dispose();
          break;
        case 'cancel':
          this._panel.dispose();
          break;
        case 'syncYaml':
          this._panel.webview.postMessage({ command: 'syncYamlResult', yaml: serializeDraft(normalizeRuleDraft(message.data)) });
          break;
        case 'applyYaml':
          this._handleApplyYaml(message.data);
          break;
      }
    }, null, this._disposables);
  }

  private buildPayload(data: Partial<RuleEditorDraft> & { fileName?: string; content?: string; }): RuleEditorFilePayload {
    const normalized = normalizeRuleDraft({ ...this._draft, ...data });
    return {
      fileName: this.normalizeFileName(normalized.fileName),
      content: data.content ?? serializeDraft(normalized),
    };
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
    this._panel.webview.html = buildRuleEditorHtml({
      draft: this._draft,
      initialYamlDraft: serializeDraft(this._draft),
      isEditing: this._isEditing,
      fileNameOptions: Array.from(new Set([
        ...KNOWN_RULE_FILES,
        this._draft.fileName,
      ])),
    });
  }

  public dispose(): void {
    RuleEditorPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
  }

  private normalizeFileName(fileName: string): string {
    const trimmed = fileName.trim();
    if (!trimmed) {
      return 'new-rule.md';
    }

    if (trimmed.startsWith('.') && !trimmed.includes('.', 1)) {
      return trimmed;
    }

    if (trimmed.includes('.')) {
      return trimmed;
    }

    return `${trimmed}.md`;
  }
}
