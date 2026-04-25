import { PromptDefinition, PromptLibraryItem, PromptMetadata, PromptSaveTarget, PromptStorageRef } from '../domain/prompt';

export interface PromptRepositoryDiagnostic {
  repositoryId: string;
  severity: 'warning' | 'error';
  message: string;
}

export interface PromptRepository {
  readonly id: string;
  readonly label: string;
  list(): Promise<PromptLibraryItem[]>;
}

export interface WritablePromptRepository extends PromptRepository {
  save(prompt: PromptDefinition, target: PromptSaveTarget): Promise<PromptLibraryItem>;
  delete(storage: PromptStorageRef): Promise<void>;
  updateMetadata?(storage: PromptStorageRef, metadata: PromptMetadata): Promise<PromptLibraryItem>;
}

