import * as vscode from 'vscode';

export class VscodeStateStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getGlobal<T>(key: string): T | undefined {
    return this.context.globalState.get<T>(key);
  }

  async setGlobal(key: string, value: unknown): Promise<void> {
    await this.context.globalState.update(key, value);
  }

  getWorkspace<T>(key: string): T | undefined {
    return this.context.workspaceState.get<T>(key);
  }

  async setWorkspace(key: string, value: unknown): Promise<void> {
    await this.context.workspaceState.update(key, value);
  }

  async getSecret(key: string): Promise<string | undefined> {
    return this.context.secrets.get(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    await this.context.secrets.store(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    await this.context.secrets.delete(key);
  }

  get globalStoragePath(): string {
    return this.context.globalStorageUri.fsPath;
  }
}
