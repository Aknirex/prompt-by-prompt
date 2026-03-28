import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TeamPolicySourceConfig, TeamPolicySourceState } from '../../types/teamPolicy';
import { IGitRunner } from './IGitRunner';

const execFileAsync = promisify(execFile);

export class TeamPolicySync {
  private static readonly syncLocks = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly globalStoragePath: string,
    private readonly git: IGitRunner
  ) {}

  async resolveSourcePath(
    source: TeamPolicySourceConfig,
    stateOut: TeamPolicySourceState[]
  ): Promise<string | undefined> {
    if (source.type === 'local-folder') {
      return this.resolveLocalFolder(source, stateOut);
    }
    return this.resolveGitSource(source, stateOut);
  }

  getConfiguredSources(globalState: unknown): TeamPolicySourceConfig[] {
    if (!Array.isArray(globalState)) return [];
    return globalState as TeamPolicySourceConfig[];
  }

  private resolveLocalFolder(
    source: TeamPolicySourceConfig,
    stateOut: TeamPolicySourceState[]
  ): string | undefined {
    const folderPath = source.packPath ?? source.path;
    if (!folderPath || !fs.existsSync(folderPath)) {
      stateOut.push({
        sourceId: source.id,
        type: source.type,
        status: 'error',
        lastSyncError: `Local folder not found: ${folderPath}`,
      });
      return undefined;
    }
    stateOut.push({
      sourceId: source.id,
      type: source.type,
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
    });
    return folderPath;
  }

  private async resolveGitSource(
    source: TeamPolicySourceConfig,
    stateOut: TeamPolicySourceState[]
  ): Promise<string | undefined> {
    const existing = TeamPolicySync.syncLocks.get(source.id);
    if (existing) return existing;

    const lock = this.syncGitSource(source, stateOut);
    TeamPolicySync.syncLocks.set(source.id, lock);
    try {
      return await lock;
    } finally {
      TeamPolicySync.syncLocks.delete(source.id);
    }
  }

  private async syncGitSource(
    source: TeamPolicySourceConfig,
    stateOut: TeamPolicySourceState[]
  ): Promise<string | undefined> {
    const cacheDir = path.join(this.globalStoragePath, 'team-policy-cache', source.id);
    const packPath = source.packPath ? path.join(cacheDir, source.packPath) : cacheDir;

    try {
      if (!fs.existsSync(cacheDir)) {
        await this.git.clone(source.url!, cacheDir);
      } else {
        await this.git.pull(cacheDir);
      }

      const sha = await this.git.resolveCommitSha(cacheDir);
      stateOut.push({
        sourceId: source.id,
        type: source.type,
        status: 'synced',
        lastSyncedAt: new Date().toISOString(),
      });

      return packPath;
    } catch (err) {
      const msg = this.classifyError(err);
      stateOut.push({
        sourceId: source.id,
        type: source.type,
        status: 'error',
        lastSyncError: msg,
      });
      return undefined;
    }
  }

  private classifyError(error: unknown): string {
    const msg = String(error).toLowerCase();
    if (msg.includes('authentication failed') || msg.includes('permission denied'))
      return 'Authentication failed. Check repository access.';
    if (msg.includes('repository not found') || msg.includes('not found'))
      return 'Repository not found. Check the source URL.';
    if (msg.includes('could not resolve host') || msg.includes('failed to connect'))
      return 'Network error while reaching the repository.';
    if (msg.includes('ff-only') || msg.includes('fast-forward'))
      return 'Sync could not fast-forward. Reconnect the source to refresh.';
    if (msg.includes('not a git repository'))
      return 'The synced cache is not a valid Git repository.';
    return 'Git sync failed.';
  }
}
