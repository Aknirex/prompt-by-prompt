import * as path from 'path';
import * as vscode from 'vscode';
import { PromptRenderContext } from '../domain/promptRenderer';

export function createEmptyRenderContext(): PromptRenderContext {
  return {
    selection: '',
    filepath: '',
    file_content: '',
    lang: '',
    project_name: '',
    line_number: 0,
    column_number: 0,
  };
}

export function collectEditorContext(options: { includeFileContent: boolean }): PromptRenderContext {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return createEmptyRenderContext();
  }

  const document = editor.document;
  const selection = editor.selection;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  const workspaceRoot = workspaceFolder?.uri.fsPath;
  const currentLine = document.lineAt(selection.active.line).text;

  return {
    selection: selection.isEmpty ? currentLine : document.getText(selection),
    filepath: workspaceRoot ? path.relative(workspaceRoot, document.uri.fsPath) : document.uri.fsPath,
    file_content: options.includeFileContent ? document.getText() : '',
    lang: document.languageId,
    project_name: workspaceFolder?.name ?? (workspaceRoot ? path.basename(workspaceRoot) : ''),
    line_number: selection.active.line + 1,
    column_number: selection.active.character + 1,
  };
}

