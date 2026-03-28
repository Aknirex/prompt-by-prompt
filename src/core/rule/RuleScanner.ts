import * as fs from 'fs';
import * as path from 'path';
import { RuleFile, RuleFormat, RuleScope } from '../../types/rule';
import { parseRuleDocument } from '../../utils/ruleFrontmatter';

export const KNOWN_RULE_FILENAMES = [
  'AGENTS.md',
  '.clinerules',
  '.cursorrules',
  '.windsurfrules',
  '.aiderrules',
  '.codeiumrules',
];

export class RuleScanner {
  async scanWorkspace(workspaceRoot: string): Promise<RuleFile[]> {
    const results: RuleFile[] = [];
    for (const filename of KNOWN_RULE_FILENAMES) {
      const filePath = path.join(workspaceRoot, filename);
      if (!fs.existsSync(filePath)) continue;
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        results.push(this.buildRecord(filename, filePath, content, 'workspace'));
      } catch {
        // skip unreadable files
      }
    }
    return results;
  }

  async scanGlobalDir(globalRulesDir: string): Promise<RuleFile[]> {
    if (!fs.existsSync(globalRulesDir)) return [];
    const files = fs.readdirSync(globalRulesDir).filter(f => f.endsWith('.md'));
    const results: RuleFile[] = [];
    for (const file of files) {
      const filePath = path.join(globalRulesDir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        results.push(this.buildRecord(file, filePath, content, 'global'));
      } catch {
        // skip
      }
    }
    return results;
  }

  async scanTeamPackDir(rulesDir: string, packId: string, packVersion?: string): Promise<RuleFile[]> {
    if (!fs.existsSync(rulesDir)) return [];
    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.md'));
    const results: RuleFile[] = [];
    for (const file of files) {
      const filePath = path.join(rulesDir, file);
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const record = this.buildRecord(file, filePath, content, 'team-pack');
        results.push({ ...record, packId, packVersion, readOnly: true } as RuleFile & { readOnly: boolean });
      } catch {
        // skip
      }
    }
    return results;
  }

  private buildRecord(filename: string, filePath: string, content: string, scope: RuleScope): RuleFile {
    const parsed = parseRuleDocument(content);
    const fm = parsed.metadata;
    const name = fm.title ?? filename.replace(/^\.|\.[^.]+$/g, '');
    const format: RuleFormat = filePath.endsWith('.md') ? 'markdown' : 'plain';
    return {
      id: filePath,
      name,
      path: filePath,
      scope,
      origin: scope,
      format,
      content: parsed.body,
      title: fm.title,
      canonicalKey: fm.canonicalKey,
      priority: fm.priority ?? 0,
      required: fm.required ?? false,
      kind: fm.kind,
      category: fm.category,
      preferenceKey: fm.preferenceKey,
      preferenceValue: fm.preferenceValue,
    };
  }
}
