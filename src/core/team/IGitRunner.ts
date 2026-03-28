export interface IGitRunner {
  clone(url: string, targetDir: string): Promise<void>;
  pull(repoDir: string): Promise<void>;
  resolveCommitSha(repoDir: string): Promise<string>;
}
