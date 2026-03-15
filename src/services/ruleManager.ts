/**
 * Rule Manager Service
 * Manages project-level rule files (.clinerules, .cursorrules, etc.)
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface RuleFile {
    name: string;
    path: string;
    content: string;
}

export const KNOWN_RULE_FILES = ['.clinerules', '.cursorrules', '.windsurfrules', 'AGENTS.md'];

export class RuleManager {
    private onDidChangeRules: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChange = this.onDidChangeRules.event;
    private ruleFiles: RuleFile[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this.initialize();
    }

    private setupWatcher() {
        if (!vscode.workspace.workspaceFolders) return;
        
        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                vscode.workspace.workspaceFolders[0],
                '{.clinerules,.cursorrules,.windsurfrules,AGENTS.md}'
            )
        );

        watcher.onDidCreate(() => this.scanRuleFiles());
        watcher.onDidChange(() => this.scanRuleFiles());
        watcher.onDidDelete(() => this.scanRuleFiles());
        
        this.context.subscriptions.push(watcher);
    }

    public async initialize() {
        await this.scanRuleFiles();
        this.setupWatcher();
    }

    public async scanRuleFiles(): Promise<RuleFile[]> {
        this.ruleFiles = [];
        
        if (!vscode.workspace.workspaceFolders) {
            this.onDidChangeRules.fire();
            return this.ruleFiles;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;

        for (const fileName of KNOWN_RULE_FILES) {
            const filePath = path.join(rootPath, fileName);
            if (fs.existsSync(filePath)) {
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8');
                    this.ruleFiles.push({ name: fileName, path: filePath, content });
                } catch (e) {
                    console.error(`Error reading ${fileName}`, e);
                }
            }
        }

        this.onDidChangeRules.fire();
        return this.ruleFiles;
    }

    public getRuleFiles(): RuleFile[] {
        return this.ruleFiles;
    }

    public async createRuleFile(fileName: string, template: string = ''): Promise<void> {
        if (!vscode.workspace.workspaceFolders) {
            vscode.window.showErrorMessage('No workspace open to create rule file.');
            return;
        }

        const rootPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const filePath = path.join(rootPath, fileName);

        if (fs.existsSync(filePath)) {
            vscode.window.showInformationMessage(`${fileName} already exists.`);
            return;
        }

        try {
            await fs.promises.writeFile(filePath, template, 'utf-8');
            vscode.window.showInformationMessage(`Created ${fileName}`);
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to create ${fileName}: ${e}`);
        }
    }

    public async deleteRuleFile(uri: vscode.Uri): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `Are you sure you want to delete ${path.basename(uri.fsPath)}?`,
            { modal: true },
            'Delete'
        );
        if (confirm === 'Delete') {
            try {
                await vscode.workspace.fs.delete(uri);
                vscode.window.showInformationMessage(`Deleted ${path.basename(uri.fsPath)}`);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to delete ${path.basename(uri.fsPath)}: ${e}`);
            }
        }
    }
}
