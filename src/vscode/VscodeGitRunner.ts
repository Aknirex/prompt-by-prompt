import { execFile } from 'child_process';
import { promisify } from 'util';
import { IGitRunner } from '../core/team/IGitRunner';

const execFileAsync = promisify(execFile);

export class VscodeGitRunner implements IGitRunner {
  async clone(url: string, targetDir: string): Promise<void> {
    await execFileAsync('git', ['clone', '--depth=1', url, targetDir]);
  }

  async pull(repoDir: string): Promise<void> {
    await execFileAsync('git', ['pull', '--ff-only'], { cwd: repoDir });
  }

  async resolveCommitSha(repoDir: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: repoDir });
    return stdout.trim();
  }
}
