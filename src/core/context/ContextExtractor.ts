import { EditorContext } from '../../types/prompt';
import { PromptTemplate } from '../../types/prompt';
import { PromptRenderer } from '../prompt/PromptRenderer';
import { IEditorContextSource } from './IEditorContextSource';

export class ContextExtractor {
  private readonly renderer: PromptRenderer;

  constructor(private readonly source: IEditorContextSource) {
    this.renderer = new PromptRenderer();
  }

  async extractContext(): Promise<EditorContext> {
    const [gitDiff] = await Promise.all([this.source.getGitDiff()]);
    return {
      selection: this.source.getSelection(),
      filepath: this.source.getFilePath() ?? '',
      file_content: this.source.getFileContent() ?? '',
      lang: this.source.getLanguage() ?? '',
      project_name: this.source.getProjectName() ?? '',
      git_commit_diff: gitDiff,
      line_number: this.source.getCursorPosition()?.line,
      column_number: this.source.getCursorPosition()?.column,
    };
  }

  renderPrompt(prompt: PromptTemplate, context: EditorContext, variables: Record<string, string>): string {
    return this.renderer.renderPrompt(prompt, context, variables);
  }

  getCustomVariables(prompt: PromptTemplate) {
    return this.renderer.getCustomVariables(prompt);
  }
}
