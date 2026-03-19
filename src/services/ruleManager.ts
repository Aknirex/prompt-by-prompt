/**
 * Rule Manager Service
 * Manages workspace and global rule files with explicit refresh only.
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { t } from '../utils/i18n';

export interface RuleFile {
    name: string;
    path: string;
    content: string;
    isGlobal?: boolean;
    isActive?: boolean;
}

export const KNOWN_RULE_FILES = [
    'AGENTS.md',
    '.clinerules',
    '.cursorrules',
    '.windsurfrules',
    '.aiderrules',
    '.codeiumrules'
];

export class RuleManager {
    private onDidChangeRules: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeRules.event;
    private ruleFiles: RuleFile[] = [];
    private isScanning = false;

    constructor(private readonly context: vscode.ExtensionContext) {
        this.initialize();
    }

    public async initialize() {
        await this.scanRuleFiles();
    }

    public async scanRuleFiles(): Promise<RuleFile[]> {
        if (this.isScanning) {
            return this.ruleFiles;
        }

        this.isScanning = true;

        try {
            const newRuleFiles: RuleFile[] = [];

            if (vscode.workspace.workspaceFolders) {
                const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

                for (const fileName of KNOWN_RULE_FILES) {
                    const filePath = path.join(rootPath, fileName);
                    if (!fs.existsSync(filePath)) {
                        continue;
                    }

                    try {
                        const content = await fs.promises.readFile(filePath, 'utf-8');
                        newRuleFiles.push({ name: fileName, path: filePath, content, isGlobal: false });
                    } catch (error) {
                        console.error(`Error reading ${fileName}`, error);
                    }
                }
            }

            const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
            const legacyGlobalRulePath = path.join(this.context.globalStorageUri.fsPath, 'global-rules.md');
            if (fs.existsSync(legacyGlobalRulePath)) {
                fs.mkdirSync(globalRulesDir, { recursive: true });
                const migratedPath = path.join(globalRulesDir, 'default-rules.md');
                if (!fs.existsSync(migratedPath)) {
                    fs.renameSync(legacyGlobalRulePath, migratedPath);
                    await this.context.globalState.update('pbp.activeGlobalRule', migratedPath);
                }
            }

            const globalRuleFiles = fs.existsSync(globalRulesDir)
                ? fs.readdirSync(globalRulesDir).filter(file => file.endsWith('.md'))
                : [];

            let activeRulePath = this.context.globalState.get<string>('pbp.activeGlobalRule');
            if ((!activeRulePath || !fs.existsSync(activeRulePath)) && globalRuleFiles.length > 0) {
                activeRulePath = path.join(globalRulesDir, globalRuleFiles[0]);
                await this.context.globalState.update('pbp.activeGlobalRule', activeRulePath);
            }

            for (const fileName of globalRuleFiles) {
                const filePath = path.join(globalRulesDir, fileName);
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    newRuleFiles.push({
                        name: fileName,
                        path: filePath,
                        content,
                        isGlobal: true,
                        isActive: filePath === activeRulePath,
                    });
                } catch (error) {
                    console.error(`Error reading global rule ${fileName}`, error);
                }
            }

            this.ruleFiles = newRuleFiles;
            this.onDidChangeRules.fire();
            return this.ruleFiles;
        } finally {
            this.isScanning = false;
        }
    }

    public getRuleFiles(): RuleFile[] {
        return this.ruleFiles;
    }

    public getWorkspaceRules(): RuleFile[] {
        return this.ruleFiles.filter(rule => !rule.isGlobal);
    }

    public getGlobalRules(): RuleFile[] {
        return this.ruleFiles.filter(rule => rule.isGlobal);
    }

    public getActiveGlobalRule(): RuleFile | undefined {
        return this.ruleFiles.find(rule => rule.isGlobal && rule.isActive);
    }

    public async setActiveGlobalRule(rulePath: string): Promise<void> {
        await this.context.globalState.update('pbp.activeGlobalRule', rulePath);
        await this.scanRuleFiles();
    }

    public async createGlobalRule(fileName: string): Promise<void> {
        if (!fileName.endsWith('.md')) {
            fileName += '.md';
        }

        const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
        fs.mkdirSync(globalRulesDir, { recursive: true });

        const filePath = path.join(globalRulesDir, fileName);
        if (fs.existsSync(filePath)) {
            vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
            return;
        }

        await fs.promises.writeFile(filePath, `# ${fileName}\n\n`, 'utf-8');
        vscode.window.showInformationMessage(`Global rule ${fileName} created.`);
        await this.setActiveGlobalRule(filePath);
        await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
    }

    public async createRuleFile(fileName: string, template = ''): Promise<void> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage(t('No workspace open to create rule file.'));
            return;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const filePath = path.join(rootPath, fileName);

        if (fs.existsSync(filePath)) {
            vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
            return;
        }

        try {
            await fs.promises.writeFile(filePath, template, 'utf-8');
            vscode.window.showInformationMessage(`${t('Created')} ${fileName}`);
            await this.scanRuleFiles();
        } catch (error) {
            vscode.window.showErrorMessage(`${t('Failed to create prompt').replace('prompt', '')}${fileName}: ${error}`);
        }
    }

    public async deleteRuleFile(uri: vscode.Uri): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `${t('Are you sure you want to delete')} ${path.basename(uri.fsPath)}?`,
            { modal: true },
            t('Delete')
        );

        if (confirm !== t('Delete')) {
            return;
        }

        try {
            await vscode.workspace.fs.delete(uri);
            vscode.window.showInformationMessage(`${t('Deleted')} ${path.basename(uri.fsPath)}`);
            await this.scanRuleFiles();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete ${path.basename(uri.fsPath)}: ${error}`);
        }
    }
}
