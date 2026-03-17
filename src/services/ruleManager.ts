/**
 * Rule Manager Service
 * Manages project-level rule files (.clinerules, .cursorrules, etc.)
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
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
            const globalRulesDir = path.join(this.context.globalStorageUri.fsPath, 'global-rules');
            const globalWatcher = vscode.workspace.createFileSystemWatcher(
                new vscode.RelativePattern(globalRulesDir, '*.md')
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
            const globalRulesDir = path.join(globalStoragePath, 'global-rules');
            if (!fs.existsSync(globalRulesDir)) {
                fs.mkdirSync(globalRulesDir, { recursive: true });
            }

            // Migrate old global-rules.md
            const oldGlobalRulePath = path.join(globalStoragePath, 'global-rules.md');
            if (fs.existsSync(oldGlobalRulePath)) {
                const migratedPath = path.join(globalRulesDir, 'default-rules.md');
                if (!fs.existsSync(migratedPath)) {
                    fs.renameSync(oldGlobalRulePath, migratedPath);
                    this.context.globalState.update('pbp.activeGlobalRule', migratedPath);
                }
            }

            const files = fs.readdirSync(globalRulesDir).filter(f => f.endsWith('.md'));
            
            if (files.length === 0) {
                // Generate default global rule if none exist
                const defaultName = 'default-rules.md';
                const defaultPath = path.join(globalRulesDir, defaultName);
                const platform = os.platform();
                const isZh = vscode.env.language.startsWith('zh');
                
                // Fallback basic shell inference
                const shellFallback = platform === 'win32' ? 'powershell (or cmd)' : 'bash/zsh';
                const defaultShell = vscode.env.shell || process.env.SHELL || process.env.COMSPEC || shellFallback;
                
                let defaultContent = "";
                if (isZh) {
                    const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
                    defaultContent = `# 默认全局规则\n\n- **系统环境**: ${osName}\n- **默认终端**: ${defaultShell}\n\n## 指令与行为要求\n1. 请使用**简体中文**与我进行交互。\n2. 在提供终端指令时，必须确保指令能在上述系统的默认终端中正常执行。\n3. 直接给出解决方案，不要废话。`;
                } else {
                    const osName = platform === 'win32' ? 'Windows' : platform === 'darwin' ? 'macOS' : 'Linux';
                    defaultContent = `# Default Global Rule\n\n- **OS**: ${osName}\n- **Default Shell**: ${defaultShell}\n\n## Requirements\n1. Please communicate in English.\n2. Ensure all terminal commands generated are fully compatible with the Default Shell on the current OS.\n3. Provide direct solutions without unnecessary explanation.`;
                }
                
                fs.writeFileSync(defaultPath, defaultContent, 'utf-8');
                this.context.globalState.update('pbp.activeGlobalRule', defaultPath);
                files.push(defaultName);
            }

            let activeRulePath = this.context.globalState.get<string>('pbp.activeGlobalRule');
            
            // If no active rule or active rule deleted, pick the first one
            if (!activeRulePath || !fs.existsSync(activeRulePath)) {
                if (files.length > 0) {
                    activeRulePath = path.join(globalRulesDir, files[0]);
                    this.context.globalState.update('pbp.activeGlobalRule', activeRulePath);
                }
            }

            for (const file of files) {
                const filePath = path.join(globalRulesDir, file);
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const isActive = filePath === activeRulePath;
                this.ruleFiles.push({ name: file, path: filePath, content, isGlobal: true, isActive });
            }
            
        } catch (e) {
            console.error('Error reading global rules', e);
        }

        this.onDidChangeRules.fire();
        return this.ruleFiles;
    }

    public getRuleFiles(): RuleFile[] {
        return this.ruleFiles;
    }

    public getWorkspaceRules(): RuleFile[] {
        return this.ruleFiles.filter(r => !r.isGlobal);
    }

    public getGlobalRules(): RuleFile[] {
        return this.ruleFiles.filter(r => r.isGlobal);
    }
    
    public getActiveGlobalRule(): RuleFile | undefined {
        return this.ruleFiles.find(r => r.isGlobal && r.isActive);
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
        if (!fs.existsSync(globalRulesDir)) {
            fs.mkdirSync(globalRulesDir, { recursive: true });
        }
        const filePath = path.join(globalRulesDir, fileName);
        if (fs.existsSync(filePath)) {
            vscode.window.showInformationMessage(`${fileName} ${t('already exists.')}`);
            return;
        }
        
        fs.writeFileSync(filePath, `# ${fileName}\n\n`, 'utf-8');
        vscode.window.showInformationMessage(`Global rule ${fileName} created.`);
        await this.setActiveGlobalRule(filePath); // auto activate newly created rule
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
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
