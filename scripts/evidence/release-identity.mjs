import { createHash } from 'node:crypto';
import { execFileSync, execSync } from 'node:child_process';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function outputPath(args) {
  const index = args.indexOf('--output');
  if (index < 0 || !args[index + 1] || args.filter((arg) => arg === '--output').length !== 1) {
    throw new Error('Usage: release-identity.mjs --output FILE [--require-clean]');
  }
  if (args.some((arg, position) => position !== index && position !== index + 1 && arg !== '--require-clean')) {
    throw new Error('Unknown argument');
  }
  const target = resolve(args[index + 1]);
  try {
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Output must be a regular file without links');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return target;
}

function main() {
  const args = process.argv.slice(2);
  const target = outputPath(args);
  const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const gitStatus = git('status', '--porcelain=v1', '--untracked-files=all') ? 'dirty' : 'clean';
  if (args.includes('--require-clean') && gitStatus !== 'clean') {
    throw new Error('Git tree is dirty');
  }
  const lockHash = createHash('sha256').update(readFileSync('package-lock.json')).digest('hex');
  const data = {
    gitSha: git('rev-parse', 'HEAD'),
    gitStatus,
    nodeVersion: process.version,
    npmVersion: execSync('npm --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(),
    packageLockSha256: lockHash,
    utcTimestamp: new Date().toISOString(),
  };
  writeFileSync(target, `${JSON.stringify(data, null, 2)}\n`, { flag: 'w' });
}

try {
  main();
} catch (error) {
  process.stderr.write(`release-identity: ${error.message}\n`);
  process.exitCode = 1;
}
