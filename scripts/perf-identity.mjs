import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SOURCE_FILE = /\.(?:ts|tsx|mts|mjs|js|cjs|json|md|css|html|yml|yaml)$/i;

/** 未提交工作树也必须能唯一追溯测量对象；忽略截图等大二进制产物。 */
export function measurementIdentity() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--short'], { encoding: 'utf8' });
  const diff = execFileSync('git', ['diff', '--no-ext-diff', 'HEAD', '--'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const untracked = execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter((file) => SOURCE_FILE.test(file))
    .sort();
  const hash = createHash('sha256').update(diff);
  for (const file of untracked) {
    hash.update(`\nUNTRACKED ${file}\n`).update(readFileSync(file));
  }
  return { commit, dirty: status.trim().length > 0, contentSha256: hash.digest('hex') };
}
