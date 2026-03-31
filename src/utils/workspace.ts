import * as path from 'path';
import * as vscode from 'vscode';

export function getWorkspaceFolders(): readonly vscode.WorkspaceFolder[] {
  return vscode.workspace.workspaceFolders ?? [];
}

export function getWorkspaceFolderForUri(uri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  const folders = getWorkspaceFolders();
  if (folders.length === 0) {
    return undefined;
  }

  if (!uri) {
    return folders[0];
  }

  const targetPath = path.resolve(uri.fsPath);
  let bestMatch: vscode.WorkspaceFolder | undefined;
  let bestLength = -1;

  for (const folder of folders) {
    const folderPath = path.resolve(folder.uri.fsPath);
    const relativePath = path.relative(folderPath, targetPath);
    const isInsideFolder =
      relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));

    if (!isInsideFolder) {
      continue;
    }

    if (folderPath.length > bestLength) {
      bestMatch = folder;
      bestLength = folderPath.length;
    }
  }

  return bestMatch ?? folders[0];
}

export function getWorkspaceRootForUri(uri?: vscode.Uri): string | undefined {
  return getWorkspaceFolderForUri(uri)?.uri.fsPath;
}
