import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as path from 'path';
import * as vscode from 'vscode';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { AgentType } from '../types/agent';
import {
  RuleIdentity,
  SharedLibrarySummary,
  TeamPolicyPack,
  TeamPolicySourceConfig,
  TeamPolicySourceState,
  TeamPolicySourceTrust,
} from '../types/teamPolicy';
import { PromptTemplate } from '../types/prompt';
import { parseRuleDocument } from '../utils/ruleFrontmatter';

const execFileAsync = promisify(execFile);
const SOURCE_STATES_KEY = 'pbp.teamPolicySourceStates';

interface TeamPolicyPackManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
}

interface PromptFile extends Partial<PromptTemplate> {
  recommendedTargets?: string[];
}

export class TeamPolicyService {
  private static readonly syncLocks = new Map<string, Promise<string | undefined>>();
  private packs: TeamPolicyPack[] = [];
  private sourceStates: TeamPolicySourceState[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  public async refresh(): Promise<TeamPolicyPack[]> {
    const loadedPacks: TeamPolicyPack[] = [];
    const sourceStates: TeamPolicySourceState[] = [];
    for (const source of this.getConfiguredSources()) {
      const sourcePath = await this.resolveSourcePath(source, sourceStates);
      if (!sourcePath || !fs.existsSync(sourcePath)) {
        continue;
      }

      const pack = await this.loadPackFromFolder(source, sourcePath);
      if (pack) {
        loadedPacks.push(pack);
      } else {
        sourceStates.push({
          sourceId: source.id,
          type: source.type,
          status: 'error',
          lastSyncError: 'Pack manifest not found or invalid.',
        });
      }
    }

    const dedupedSourceStates = Array.from(
      new Map(sourceStates.map((state) => [state.sourceId, state])).values()
    );
    this.packs = loadedPacks;
    this.sourceStates = dedupedSourceStates;
    await this.context.globalState.update(SOURCE_STATES_KEY, dedupedSourceStates);
    return this.packs;
  }

  public getInstalledPacks(): TeamPolicyPack[] {
    return this.packs;
  }

  public getLibrarySummaries(): SharedLibrarySummary[] {
    return this.packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      version: pack.version,
      description: pack.description,
      sourceId: pack.sourceId,
      sourcePath: pack.sourcePath,
      requestedVersion: pack.requestedVersion,
      resolvedVersion: pack.resolvedVersion,
      updatedAt: pack.updatedAt,
      ruleCount: pack.rules.length,
      promptCount: pack.prompts.length,
      status: pack.status,
      trust: pack.trust,
    }));
  }

  public getPackById(packId: string): TeamPolicyPack | undefined {
    return this.packs.find((pack) => pack.id === packId);
  }

  public getSourceStates(): TeamPolicySourceState[] {
    return this.sourceStates;
  }

  public readPersistedSourceStates(): TeamPolicySourceState[] {
    return this.context.globalState.get<TeamPolicySourceState[]>(SOURCE_STATES_KEY, []);
  }

  public async reconnectSource(sourceId: string): Promise<void> {
    const cacheRoot = path.join(this.context.globalStorageUri.fsPath, 'team-policy-sources');
    const checkoutPath = path.join(cacheRoot, this.sanitizeSourceId(sourceId));
    if (fs.existsSync(checkoutPath)) {
      await fs.promises.rm(checkoutPath, { recursive: true, force: true });
    }

    await this.context.globalState.update(`${SOURCE_STATES_KEY}.lastError.${sourceId}`, undefined);
  }

  public async validateSource(source: TeamPolicySourceConfig): Promise<{ ok: true } | { ok: false; message: string }> {
    const validationStates: TeamPolicySourceState[] = [];
    const sourcePath = await this.resolveSourcePath(source, validationStates);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { ok: false, message: validationStates[0]?.lastSyncError || 'Source path could not be resolved.' };
    }

    const packJsonPath = path.join(sourcePath, 'pack.json');
    if (!fs.existsSync(packJsonPath)) {
      return { ok: false, message: 'pack.json was not found at the shared library root.' };
    }

    try {
      const manifest = JSON.parse(await fs.promises.readFile(packJsonPath, 'utf8')) as TeamPolicyPackManifest;
      if (!manifest.id || !manifest.name || !manifest.version) {
        return { ok: false, message: 'pack.json is invalid. Expected id, name, and version.' };
      }

      return { ok: true };
    } catch (error) {
      return { ok: false, message: `Failed to read pack.json: ${String(error)}` };
    }
  }

  private getConfiguredSources(): TeamPolicySourceConfig[] {
    const config = vscode.workspace.getConfiguration('pbp');
    const rawSources = config.get<unknown[]>('teamPolicySources', []);
    const sources: TeamPolicySourceConfig[] = [];

    for (const rawSource of rawSources) {
      if (typeof rawSource === 'string') {
        sources.push({
          id: rawSource,
          type: 'local-folder',
          path: rawSource,
          trust: 'trusted',
        });
        continue;
      }

      if (!rawSource || typeof rawSource !== 'object') {
        continue;
      }

      const candidate = rawSource as Record<string, unknown>;
      const type = candidate.type === 'git' ? 'git' : 'local-folder';
      const configuredPath = typeof candidate.path === 'string'
        ? candidate.path
        : typeof candidate.rootPath === 'string'
          ? candidate.rootPath
          : undefined;
      const configuredUrl = typeof candidate.url === 'string' ? candidate.url : undefined;

      if (type === 'git' && !configuredUrl && !configuredPath) {
        continue;
      }

      if (type === 'local-folder' && !configuredPath) {
        continue;
      }

      sources.push({
        id: typeof candidate.id === 'string' ? candidate.id : (configuredUrl || configuredPath || 'team-policy-source'),
        type,
        path: configuredPath,
        url: configuredUrl,
        packPath: typeof candidate.packPath === 'string' ? candidate.packPath : undefined,
        trust: this.normalizeTrust(candidate.trust),
        requestedVersion: typeof candidate.requestedVersion === 'string' ? candidate.requestedVersion : undefined,
        resolvedVersion: typeof candidate.resolvedVersion === 'string' ? candidate.resolvedVersion : undefined,
      });
    }

    return sources;
  }

  private normalizeTrust(value: unknown): TeamPolicySourceTrust {
    return value === 'untrusted' || value === 'revoked' ? value : 'trusted';
  }

  private async resolveSourcePath(
    source: TeamPolicySourceConfig,
    sourceStates: TeamPolicySourceState[]
  ): Promise<string | undefined> {
    if (source.type === 'git') {
      const checkoutPath = await this.ensureGitCheckout(source, sourceStates);
      if (!checkoutPath) {
        return undefined;
      }

      return source.packPath ? path.join(checkoutPath, source.packPath) : checkoutPath;
    }

    if (!source.path) {
      sourceStates.push({
        sourceId: source.id,
        type: source.type,
        status: 'error',
        lastSyncError: 'Local folder path is missing.',
      });
      return undefined;
    }

    sourceStates.push({
      sourceId: source.id,
      type: source.type,
      status: 'synced',
      lastSyncedAt: new Date().toISOString(),
    });
    return source.packPath ? path.join(source.path, source.packPath) : source.path;
  }

  private async loadPackFromFolder(source: TeamPolicySourceConfig, folderPath: string): Promise<TeamPolicyPack | undefined> {
    const packJsonPath = path.join(folderPath, 'pack.json');
    if (!fs.existsSync(packJsonPath)) {
      return undefined;
    }

    try {
      const manifest = JSON.parse(await fs.promises.readFile(packJsonPath, 'utf8')) as TeamPolicyPackManifest;
      if (!manifest.id || !manifest.name || !manifest.version) {
        return undefined;
      }

      const rules = await this.loadRules(folderPath, manifest.id, manifest.version);
      const prompts = await this.loadPrompts(folderPath, manifest.id, manifest.version);
      const stats = await fs.promises.stat(packJsonPath);
      const resolvedVersion = source.type === 'git'
        ? await this.readGitResolvedVersion(folderPath)
        : (source.resolvedVersion ?? manifest.version);

      return {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description,
        sourceId: source.id,
        sourcePath: folderPath,
        requestedVersion: source.requestedVersion,
        resolvedVersion,
        updatedAt: stats.mtime.toISOString(),
        rules,
        prompts,
        status: source.trust === 'revoked' ? 'disabled' : 'active',
        trust: source.trust ?? 'trusted',
      };
    } catch (error) {
      console.error(`Failed to load shared library pack from ${folderPath}`, error);
      return undefined;
    }
  }

  private async loadRules(folderPath: string, packId: string, packVersion: string): Promise<RuleIdentity[]> {
    const rulesDir = path.join(folderPath, 'rules');
    if (!fs.existsSync(rulesDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(rulesDir, { withFileTypes: true });
    const rules: RuleIdentity[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.md')) {
        continue;
      }

      const filePath = path.join(rulesDir, entry.name);
      const content = await fs.promises.readFile(filePath, 'utf8');
      const parsed = parseRuleDocument(content);
      const fallbackRuleId = path.basename(entry.name, path.extname(entry.name));
      const ruleId = parsed.metadata.ruleId ?? fallbackRuleId;
      rules.push({
        ruleId,
        canonicalKey: parsed.metadata.canonicalKey ?? `team-pack:${packId}:${ruleId}`,
        packId,
        packVersion,
        sourceFile: entry.name,
      });
    }

    return rules;
  }

  private async loadPrompts(folderPath: string, packId: string, packVersion: string): Promise<TeamPolicyPack['prompts']> {
    const promptsDir = path.join(folderPath, 'prompts');
    if (!fs.existsSync(promptsDir)) {
      return [];
    }

    const entries = await fs.promises.readdir(promptsDir, { withFileTypes: true });
    const prompts: TeamPolicyPack['prompts'] = [];

    for (const entry of entries) {
      if (!entry.isFile() || (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml'))) {
        continue;
      }

      try {
        const promptPath = path.join(promptsDir, entry.name);
        const parsed = yaml.load(await fs.promises.readFile(promptPath, 'utf8')) as PromptFile | undefined;
        if (!parsed?.name || !parsed.template) {
          continue;
        }

        prompts.push({
          id: parsed.id || `${packId}:${path.basename(entry.name, path.extname(entry.name))}`,
          name: parsed.name,
          description: parsed.description,
          template: parsed.template,
          variables: parsed.variables,
          category: parsed.category || 'Shared Library',
          tags: parsed.tags || [],
          source: 'team-pack',
          packId,
          packVersion,
          sourceFile: entry.name,
          recommendedTargets: this.normalizeAgentList(parsed.recommendedTargets),
          readOnly: true,
        });
      } catch (error) {
        console.error(`Failed to load shared library prompt ${entry.name}`, error);
      }
    }

    return prompts;
  }

  private normalizeAgentList(values: string[] | undefined): AgentType[] | undefined {
    if (!values || values.length === 0) {
      return undefined;
    }

    return values.filter((value): value is AgentType => typeof value === 'string');
  }

  private async ensureGitCheckout(
    source: TeamPolicySourceConfig,
    sourceStates: TeamPolicySourceState[]
  ): Promise<string | undefined> {
    const cacheRoot = path.join(this.context.globalStorageUri.fsPath, 'team-policy-sources');
    await fs.promises.mkdir(cacheRoot, { recursive: true });
    const checkoutPath = path.join(cacheRoot, this.sanitizeSourceId(source.id));
    const lockKey = `${source.id}:${source.url ?? source.path ?? ''}`;

    const existingLock = TeamPolicyService.syncLocks.get(lockKey);
    if (existingLock) {
      return existingLock;
    }

    const syncPromise = this.syncGitCheckout(source, checkoutPath)
      .then((resolvedPath) => {
        sourceStates.push(resolvedPath
          ? {
              sourceId: source.id,
              type: source.type,
              status: 'synced',
              lastSyncedAt: new Date().toISOString(),
            }
          : {
              sourceId: source.id,
              type: source.type,
              status: 'error',
              lastSyncError: this.context.globalState.get<string>(`${SOURCE_STATES_KEY}.lastError.${source.id}`) || 'Git source sync failed.',
            });
        return resolvedPath;
      })
      .finally(() => {
        TeamPolicyService.syncLocks.delete(lockKey);
      });
    TeamPolicyService.syncLocks.set(lockKey, syncPromise);
    return syncPromise;
  }

  private async syncGitCheckout(source: TeamPolicySourceConfig, checkoutPath: string): Promise<string | undefined> {
    const remoteUrl = source.url ?? source.path;
    if (!remoteUrl) {
      return undefined;
    }

    try {
      const hasCheckout = fs.existsSync(checkoutPath) && fs.existsSync(path.join(checkoutPath, '.git'));
      if (!hasCheckout) {
        if (fs.existsSync(checkoutPath)) {
          await fs.promises.rm(checkoutPath, { recursive: true, force: true });
        }

        await execFileAsync('git', ['clone', '--depth', '1', remoteUrl, checkoutPath], {
          cwd: this.context.globalStorageUri.fsPath,
        });
      } else {
        const currentRemoteUrl = await this.readGitRemoteUrl(checkoutPath);
        if (currentRemoteUrl && currentRemoteUrl !== remoteUrl) {
          await fs.promises.rm(checkoutPath, { recursive: true, force: true });
          await execFileAsync('git', ['clone', '--depth', '1', remoteUrl, checkoutPath], {
            cwd: this.context.globalStorageUri.fsPath,
          });
          return checkoutPath;
        }

        await execFileAsync('git', ['pull', '--ff-only', 'origin'], {
          cwd: checkoutPath,
        });
      }

      await this.context.globalState.update(`${SOURCE_STATES_KEY}.lastError.${source.id}`, undefined);
      return checkoutPath;
    } catch (error) {
      console.error(`Failed to sync git shared library source ${source.id}`, error);
      await this.context.globalState.update(`${SOURCE_STATES_KEY}.lastError.${source.id}`, this.classifyGitSyncError(error));
      return undefined;
    }
  }

  private async readGitRemoteUrl(checkoutPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
        cwd: checkoutPath,
      });
      return stdout.trim() || undefined;
    } catch (error) {
      console.error(`Failed to read git remote url for ${checkoutPath}`, error);
      return undefined;
    }
  }

  private async readGitResolvedVersion(folderPath: string): Promise<string | undefined> {
    try {
      const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
        cwd: folderPath,
      });
      return stdout.trim() || undefined;
    } catch (error) {
      console.error(`Failed to resolve git commit for ${folderPath}`, error);
      return undefined;
    }
  }

  private sanitizeSourceId(sourceId: string): string {
    return sourceId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'team-policy-source';
  }

  private classifyGitSyncError(error: unknown): string {
    const message = String(error).toLowerCase();

    if (message.includes('authentication failed') || message.includes('could not read username') || message.includes('permission denied')) {
      return 'Authentication failed. Check repository access and credentials.';
    }

    if (message.includes('repository not found') || message.includes('not found')) {
      return 'Repository not found. Check the shared library source URL.';
    }

    if (message.includes('could not resolve host') || message.includes('failed to connect')) {
      return 'Network error while reaching the repository.';
    }

    if (message.includes('ff-only') || message.includes('fast-forward')) {
      return 'Sync could not fast-forward. Reconnect the source to refresh its cache.';
    }

    if (message.includes('not a git repository')) {
      return 'The synced cache is not a valid Git repository.';
    }

    return 'Git sync failed.';
  }
}
