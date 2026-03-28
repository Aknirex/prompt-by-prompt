import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import { PromptTemplate } from '../../types/prompt';

const PROMPTS_DIR = '.prompts';
const GLOBAL_PROMPTS_DIR = 'prompts';

export class PromptRepository {
  private readonly onChangeCbs: Array<() => void> = [];

  constructor(
    private readonly globalStoragePath: string,
    private readonly workspaceRoot: string | undefined
  ) {}

  onDidChange(cb: () => void): void {
    this.onChangeCbs.push(cb);
  }

  private fire(): void {
    for (const cb of this.onChangeCbs) cb();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  async loadAll(): Promise<PromptTemplate[]> {
    const results: PromptTemplate[] = [];
    for (const p of await this.loadGlobal()) results.push(p);
    for (const p of await this.loadWorkspace()) results.push(p);
    return results;
  }

  async loadWorkspace(): Promise<PromptTemplate[]> {
    if (!this.workspaceRoot) return [];
    const dir = path.join(this.workspaceRoot, PROMPTS_DIR);
    return this.loadFromDir(dir, 'workspace');
  }

  async loadGlobal(): Promise<PromptTemplate[]> {
    const dir = path.join(this.globalStoragePath, GLOBAL_PROMPTS_DIR);
    return this.loadFromDir(dir, 'global');
  }

  async loadFromDir(dir: string, source: PromptTemplate['source']): Promise<PromptTemplate[]> {
    if (!fs.existsSync(dir)) return [];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml') || f.endsWith('.yml'));
    const results: PromptTemplate[] = [];
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const parsed = yaml.load(content) as Partial<PromptTemplate>;
        if (parsed && parsed.id && parsed.name) {
          results.push({
            id: parsed.id,
            name: parsed.name,
            description: parsed.description ?? '',
            category: parsed.category ?? '',
            tags: parsed.tags ?? [],
            version: parsed.version ?? '1.0.0',
            template: parsed.template ?? '',
            variables: parsed.variables,
            parameters: parsed.parameters,
            author: parsed.author,
            source,
            filePath,
            readOnly: false,
          });
        }
      } catch {
        // skip malformed files
      }
    }
    return results;
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  async save(prompt: PromptTemplate): Promise<PromptTemplate> {
    const dir = this.resolveDir(prompt);
    await fs.promises.mkdir(dir, { recursive: true });

    if (!prompt.id) prompt = { ...prompt, id: uuidv4() };

    const filename = this.sanitize(prompt.name) + '.yaml';
    const filePath = path.join(dir, filename);

    // Handle rename: delete old file if path changed
    if (prompt.filePath && prompt.filePath !== filePath && fs.existsSync(prompt.filePath)) {
      await fs.promises.unlink(prompt.filePath);
    }

    const saved = { ...prompt, filePath };
    await fs.promises.writeFile(filePath, this.toYaml(saved), 'utf8');
    this.fire();
    return saved;
  }

  async delete(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
    this.fire();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveDir(prompt: PromptTemplate): string {
    if (prompt.source === 'workspace' && this.workspaceRoot) {
      return path.join(this.workspaceRoot, PROMPTS_DIR);
    }
    return path.join(this.globalStoragePath, GLOBAL_PROMPTS_DIR);
  }

  private toYaml(prompt: PromptTemplate): string {
    const { filePath: _fp, source: _src, readOnly: _ro, packId: _pi, packVersion: _pv, ...rest } = prompt;
    return yaml.dump(rest, { indent: 2, lineWidth: -1, quotingType: '"', forceQuotes: false });
  }

  private sanitize(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }
}
