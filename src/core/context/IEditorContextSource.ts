export interface IEditorContextSource {
  getSelection(): string;
  getFilePath(): string | undefined;
  getFileContent(): string | undefined;
  getLanguage(): string | undefined;
  getProjectName(): string | undefined;
  getGitDiff(): Promise<string>;
  getCursorPosition(): { line: number; column: number } | undefined;
}
