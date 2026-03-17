import * as vscode from 'vscode';

const zh_cn_dict: Record<string, string> = {
    'Refresh Prompts': '刷新提示词',
    'Create New Prompt': '新建提示词',
    'Edit Prompt': '编辑提示词',
    'Delete Prompt': '删除提示词',
    'Run Prompt': '运行提示词',
    'Open Settings': '打开设置',
    'Refresh Rules': '刷新规则',
    'Add Rule': '添加规则',
    'Delete Rule': '删除规则',
    'Prompt by Prompt is activating...': 'Prompt by Prompt 正在激活...',
    'Prompt by Prompt is now active': 'Prompt by Prompt 现已激活',
    'Failed to create prompt': '创建提示词失败',
    'Failed to update prompt': '更新提示词失败',
    'Failed to delete prompt': '删除提示词失败',
    'Are you sure you want to delete': '您确定要删除',
    'Delete': '删除',
    'Cancel': '取消',
    'Select a prompt to run': '选择要运行的提示词',
    'No prompt selected': '未选择提示词',
    'Select rule file to create': '选择要创建的规则文件',
    'Created': '已创建',
    'Deleted': '已删除',
    'Select agent to send prompt': '选择发生提示词的人工智能代理',
    'Send Prompt To...': '发送至...',
    'Prompt sent successfully to': '提示词成功发送至',
    'Failed to send prompt': '提示词发送失败',
    'User cancelled variable input, aborting prompt execution': '用户取消了变量输入，放弃执行提示词',
    'The rendered prompt is empty. Please check your template and variables.': '生成的提示词为空，请检查您的模板与变量。',
    'Preview': '预览',
    'Copy': '复制',
    'Copy to clipboard': '复制到剪贴板',
    'Prompt copied to clipboard!': '提示词已复制到剪贴板！',
    'Run': '运行',
    'Direct send': '直接发送',
    '⚠️ Requires manual paste': '⚠️ 需要手动粘贴',
    'Global Rules': '全局规则',
    'Workspace Rules': '工作区规则',
    'Workspace Rule:': '工作区规则:',
    'No workspace open to create rule file.': '未打开工作区，无法创建规则文件。',
    'already exists.': '已存在。',
};

export function t(key: string, ...args: any[]): string {
    const lang = vscode.env.language.toLowerCase();
    let text = key;

    if (lang === 'zh-cn' || lang === 'zh-tw' || lang === 'zh') {
        text = zh_cn_dict[key] || key;
    }

    if (args.length > 0) {
        return text.replace(/{(\d+)}/g, (match, number) => {
            return typeof args[number] !== 'undefined' ? args[number] : match;
        });
    }
    
    return text;
}