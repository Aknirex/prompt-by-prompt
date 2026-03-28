import * as vscode from 'vscode';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { IEditorContextSource } from '../core/context/IEditorContextSource';
import { EditorContext } from '../types/prompt';

const execFileAsync = promisify(execFile);

export class VscodeEditorContext implements IEditorContextSource {
  private get editor(): vscode.TextEditor | undefined {
    return vscode.window.activeTextEditor;
  }

  getSelection(): string {
    const editor = this.editor;
    if (!editor) return '';
    const sel = editor.selection;
    if (!sel.isEmpty) return editor.document.getText(sel);
    return editor.document.lineAt(sel.active.line).text;
  }

  getFilePath(): string | undefined {
    const editor = this.editor;
    if (!editor) return undefined;
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) return path.relative(ws, editor.document.uri.fsPath);
    return editor.document.uri.fsPath;
  }

  getFileContent(): string | undefined {
    return this.editor?.document.getText();
  }

  getLanguage(): string | undefined {
    return this.editor?.document.languageId;
  }

  getProjectName(): string | undefined {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws) return path.basename(ws);
    const fp = this.editor?.document.uri.fsPath;
    if (fp) return path.basename(path.dirname(fp));
    return undefined;
  }

  async getGitDiff(): Promise<string> {
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!ws) return '';
    try {
      const { stdout } = await execFileAsync('git', ['diff', '--cached'], { cwd: ws });
      if (stdout.trim()) return stdout.trim();
      const { stdout: unstaged } = await execFileAsync('git', ['diff'], { cwd: ws });
      return unstaged.trim();
    } catch {
      return '';
    }
  }

  getCursorPosition(): { line: number; column: number } | undefined {
    const editor = this.editor;
    if (!editor) return undefined;
    const pos = editor.selection.active;
    return { line: pos.line + 1, column: pos.character + 1 };
  }

  async extractContext(): Promise<EditorContext> {
    return {
      selection: this.getSelection(),
      filepath: this.getFilePath() ?? '',
      file_content: this.getFileContent() ?? '',
      lang: this.getLanguage() ?? '',
      project_name: this.getProjectName() ?? '',
      git_commit_diff: await this.getGitDiff(),
      line_number: this.getCursorPosition()?.line,
      column_number: this.getCursorPosition()?.column,
    };
  }
}
