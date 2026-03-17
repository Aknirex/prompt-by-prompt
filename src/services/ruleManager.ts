/**
 * Rule Manager Service
 * Manages project-level rule files (.clinerules, .cursorrules, etc.)
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
}

export const KNOWN_RULE_FILES = [
    'AGENTS.md',
    '.clinerules',
    '.cursorrules',
    '.windsurfrules',
    '.aiderrules',
    '.codeiumrules',
    '.cursorrules',
    '.windsurfrules'
];

export class RuleManager {
    private onDidChangeRules: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeRules.event;
    private ruleFiles: RuleFile[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.initialize();
    }

    private setupWatcher() {
        if (vscode.workspace.workspaceFolders) {
            const watcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(
                    vscode.workspace.workspaceFolders[0],
                    '{AGENTS.md,.clinerules,.cursorrules,.windsurfrules,.aiderrules,.codeiumrules}'
                )
            );

            watcher.onDidCreate(() => this.scanRuleFiles());
            watcher.onDidChange(() => this.scanRuleFiles());
            watcher.onDidDelete(() => this.scanRuleFiles());

            this.context.subscriptions.push(watcher);
        }

        try {
            const globalWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(this.context.globalStorageUri, 'global-rules.md')
            );
            globalWatcher.onDidCreate(() => this.scanRuleFiles());
            globalWatcher.onDidChange(() => this.scanRuleFiles());
            globalWatcher.onDidDelete(() => this.scanRuleFiles());
            this.context.subscriptions.push(globalWatcher);
        } catch (e) {
            console.error('Failed to setup global watcher', e);
        }
    }

    public async initialize() {
        await this.scanRuleFiles();
        this.setupWatcher();
    }

    public async scanRuleFiles(): Promise<RuleFile[]> {
        this.ruleFiles = [];

        if (vscode.workspace.workspaceFolders) {
            const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

            for (const fileName of KNOWN_RULE_FILES) {
                const filePath = path.join(rootPath, fileName);
                if (fs.existsSync(filePath)) {
                    try {
                        const content = await fs.promises.readFile(filePath, 'utf-8');
                        this.ruleFiles.push({ name: fileName, path: filePath, content, isGlobal: false });
                    } catch (e) {
                        console.error(`Error reading ${fileName}`, e);
                    }
                }
            }
        }

        // Global rules setup
        try {
            const globalStoragePath = this.context.globalStorageUri.fsPath;
            if (!fs.existsSync(globalStoragePath)) {
                fs.mkdirSync(globalStoragePath, { recursive: true });
            }
            const globalRulePath = path.join(globalStoragePath, 'global-rules.md');
            if (!fs.existsSync(globalRulePath)) {
                fs.writeFileSync(globalRulePath, '', 'utf-8');
            }
            const content = await fs.promises.readFile(globalRulePath, 'utf-8');
            this.ruleFiles.push({ name: 'global-rules.md', path: globalRulePath, content, isGlobal: true });
        } catch (e) {
            console.error('Error reading global rules', e);
        }

        this.onDidChangeRules.fire();
        return this.ruleFiles;
    }    public getRuleFiles(): RuleFile[] {
        return this.ruleFiles;
    }

    public getWorkspaceRules(): RuleFile[] {
        return this.ruleFiles.filter(r => !r.isGlobal);
    }

    public getGlobalRules(): RuleFile[] {
        return this.ruleFiles.filter(r => r.isGlobal);
    }

    public async createRuleFile(fileName: string, template: string = ''): Promise<void> {
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
        } catch (e) {
            vscode.window.showErrorMessage(`${t('Failed to create prompt').replace('prompt', '')}${fileName}: ${e}`);
        }
    }

    public async deleteRuleFile(uri: vscode.Uri): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `${t('Are you sure you want to delete')} ${path.basename(uri.fsPath)}?`,
            { modal: true },
            t('Delete')
        );
        if (confirm === t('Delete')) {
            try {
                await vscode.workspace.fs.delete(uri);
                vscode.window.showInformationMessage(`${t('Deleted')} ${path.basename(uri.fsPath)}`);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to delete ${path.basename(uri.fsPath)}: ${e}`);
            }
        }
    }
}
