import { PromptTemplate, PromptVariable } from '../../types/prompt';
import { GeneratedPromptDraft } from '../../core/ai/AIGeneratorService';

export type HostToWebview =
  | { type: 'load'; prompt: PromptTemplate; builtinVariables: string[]; target: 'workspace' | 'global' }
  | { type: 'aiDraftReady'; draft: GeneratedPromptDraft }
  | { type: 'previewReady'; text: string }
  | { type: 'error'; message: string };

export type WebviewToHost =
  | { type: 'save'; prompt: SavePayload }
  | { type: 'requestAiDraft'; description: string; provider?: string; model?: string }
  | { type: 'requestPreview'; template: string; variables?: PromptVariable[] }
  | { type: 'run'; promptId: string }
  | { type: 'ready' };

export interface SavePayload {
  name: string;
  description: string;
  category: string;
  tags: string[];
  template: string;
  variables?: PromptVariable[];
  target: 'workspace' | 'global';
}
