import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function parseArgs(args) {
  const lockIndex = args.indexOf('--lockfile');
  const outIndex = args.indexOf('--output');
  if (lockIndex < 0 || outIndex < 0 || !args[lockIndex + 1] || !args[outIndex + 1] ||
      args.length !== 4 || args.filter((arg) => arg === '--lockfile').length !== 1 ||
      args.filter((arg) => arg === '--output').length !== 1) {
    throw new Error('Usage: dependency-inventory.mjs --lockfile FILE --output FILE');
  }
  const lockfile = resolve(args[lockIndex + 1]);
  const output = resolve(args[outIndex + 1]);
  if (lockfile === output) throw new Error('Output cannot replace lockfile');
  if (!lstatSync(lockfile).isFile()) throw new Error('Lockfile must be a regular file');
  try {
    const stat = lstatSync(output);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Output must be a regular file without links');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { lockfile, output };
}

function packageName(path, entry) {
  if (typeof entry.name === 'string') return entry.name;
  const suffix = path.split('node_modules/').at(-1);
  return path.includes('node_modules/') ? suffix : path.split('/').at(-1) || null;
}

function resolvedHost(resolved) {
  if (typeof resolved !== 'string' || !/^https?:\/\//i.test(resolved)) return null;
  return new URL(resolved).hostname.toLowerCase();
}

function main() {
  const { lockfile, output } = parseArgs(process.argv.slice(2));
  const lock = JSON.parse(readFileSync(lockfile, 'utf8'));
  if (lock.lockfileVersion !== 3 || !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) {
    throw new Error('Only package-lock v3 with packages is supported');
  }
  const entries = Object.entries(lock.packages).map(([path, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid package entry');
    return {
      path,
      name: packageName(path, entry),
      version: entry.version ?? null,
      license: entry.license ?? null,
      resolvedHost: resolvedHost(entry.resolved),
      integrity: entry.integrity ?? null,
      dev: entry.dev === true,
      optional: entry.optional === true,
      os: entry.os ?? null,
      cpu: entry.cpu ?? null,
      libc: entry.libc ?? null,
      hasInstallScript: entry.hasInstallScript === true,
      workspaceLink: entry.link === true && typeof entry.resolved === 'string' && !/^[a-z][a-z0-9+.-]*:/i.test(entry.resolved),
    };
  });
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  writeFileSync(output, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'w' });
}

try {
  main();
} catch (error) {
  process.stderr.write('dependency-inventory: failed\n');
  process.exitCode = 1;
}
