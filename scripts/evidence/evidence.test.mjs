import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const scripts = resolve('scripts/evidence');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fixture = () => mkdtempSync(join(tmpdir(), 'evidence-utils-'));
const run = (script, args, cwd) => spawnSync(process.execPath, [join(scripts, script), ...args], { cwd, encoding: 'utf8' });

test('release identity records source and runtime metadata and requires a clean tree', () => {
  const cwd = fixture();
  execFileSync('git', ['init', '-q'], { cwd });
  writeFileSync(join(cwd, 'tracked.txt'), 'tracked');
  execFileSync('git', ['add', 'tracked.txt'], { cwd });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture'], { cwd });
  const lock = '{"lockfileVersion":3,"packages":{}}\n';
  writeFileSync(join(cwd, 'package-lock.json'), lock);
  execFileSync('git', ['-c', 'core.autocrlf=false', 'add', 'package-lock.json'], { cwd });
  execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'lock'], { cwd });
  const output = join(tmpdir(), `release-identity-${process.pid}.json`);
  const result = run('release-identity.mjs', ['--output', output, '--require-clean'], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  const data = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(data.gitSha, execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim());
  assert.equal(data.gitStatus, 'clean');
  assert.equal(data.nodeVersion, process.version);
  assert.equal(data.packageLockSha256, sha256(lock));
  assert.match(data.utcTimestamp, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/);
  assert.match(data.npmVersion, /^\d+\.\d+\.\d+/);
  writeFileSync(join(cwd, 'tracked.txt'), 'changed');
  const dirty = run('release-identity.mjs', ['--output', output, '--require-clean'], cwd);
  assert.notEqual(dirty.status, 0);
});

test('artifact manifest sorts explicit files, hashes bytes, and is stable', () => {
  const cwd = fixture();
  mkdirSync(join(cwd, 'nested'));
  writeFileSync(join(cwd, 'z.txt'), 'secret-content-marker');
  writeFileSync(join(cwd, 'nested', 'a.bin'), Buffer.from([0, 1, 2]));
  const first = join(cwd, 'manifest-1.json');
  const second = join(cwd, 'manifest-2.json');
  for (const output of [first, second]) {
    const result = run('artifact-manifest.mjs', ['--output', output, '--', 'z.txt', 'nested/a.bin'], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
  assert.deepEqual(readFileSync(first), readFileSync(second));
  const data = JSON.parse(readFileSync(first, 'utf8'));
  assert.deepEqual(data, [
    { path: 'nested/a.bin', size: 3, sha256: sha256(Buffer.from([0, 1, 2])) },
    { path: 'z.txt', size: 21, sha256: sha256('secret-content-marker') },
  ]);
  assert.equal(readFileSync(first, 'utf8').includes('secret-content-marker'), false);
  const self = run('artifact-manifest.mjs', ['--output', first, '--', first], cwd);
  assert.notEqual(self.status, 0);
});

test('dependency inventory sorts lockfile v3 entries and separates workspace links', () => {
  const cwd = fixture();
  const lock = {
    name: 'fixture', lockfileVersion: 3,
    packages: {
      'node_modules/z': { version: '1.2.3', license: 'MIT', resolved: 'https://registry.example.org/z/-/z.tgz', integrity: 'sha512-example', dev: true, optional: true, os: ['linux'], cpu: ['x64'], libc: ['glibc'], hasInstallScript: true },
      'node_modules/@acme/a': { resolved: 'packages/a', link: true },
      'packages/a': { name: '@acme/a', version: '0.0.0' },
      '': { name: 'fixture', version: '1.0.0' },
    },
  };
  writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify(lock));
  const first = join(cwd, 'inventory-1.json');
  const second = join(cwd, 'inventory-2.json');
  for (const output of [first, second]) {
    const result = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', output], cwd);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  }
  assert.deepEqual(readFileSync(first), readFileSync(second));
  const data = JSON.parse(readFileSync(first, 'utf8'));
  assert.deepEqual(data.map((entry) => entry.path), ['', 'node_modules/@acme/a', 'node_modules/z', 'packages/a']);
  assert.equal(data[1].workspaceLink, true);
  assert.equal(data[1].resolvedHost, null);
  assert.equal(data[2].resolvedHost, 'registry.example.org');
  assert.equal(data[2].hasInstallScript, true);
  assert.equal(data[2].integrity, 'sha512-example');
  assert.deepEqual(data[2].os, ['linux']);
});

test('dependency inventory rejects other lockfile versions', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package-lock.json'), '{"lockfileVersion":2,"packages":{}}');
  const result = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', 'inventory.json'], cwd);
  assert.notEqual(result.status, 0);
});

test('dependency inventory covers the real lockfile and is byte stable', () => {
  const cwd = process.cwd();
  const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
  const output = join(fixture(), 'inventory.json');
  const result = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', output], cwd);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  const first = readFileSync(output);
  const repeat = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', output], cwd);
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.deepEqual(readFileSync(output), first);

  const entries = JSON.parse(first);
  assert.equal(entries.length, 204);
  assert.deepEqual(entries.map(({ path }) => path), Object.keys(lock.packages).sort());
  assert.equal(entries.filter(({ workspaceLink }) => workspaceLink).length, 5);
  assert.equal(entries.filter(({ resolvedHost }) => resolvedHost !== null).length, 193);
  assert.equal(entries.filter(({ license }) => license !== null).length, 193);
  assert.equal(entries.filter(({ integrity }) => integrity !== null).length, 193);
  assert.equal(entries.filter(({ optional }) => optional).length, 48);
  assert.equal(entries.filter(({ os }) => os !== null).length, 47);
  assert.equal(entries.filter(({ cpu }) => cpu !== null).length, 46);
  assert.equal(entries.filter(({ libc }) => libc !== null).length, 10);
  assert.equal(entries.filter(({ hasInstallScript }) => hasInstallScript).length, 1);
  for (const entry of entries) {
    const source = lock.packages[entry.path];
    assert.equal(entry.license, source.license ?? null);
    assert.equal(entry.integrity, source.integrity ?? null);
    assert.equal(entry.optional, source.optional === true);
    assert.deepEqual(entry.os, source.os ?? null);
    assert.deepEqual(entry.cpu, source.cpu ?? null);
    assert.deepEqual(entry.libc, source.libc ?? null);
    assert.equal(entry.hasInstallScript, source.hasInstallScript === true);
    if (source.link === true) {
      assert.equal(entry.workspaceLink, true);
      assert.equal(entry.resolvedHost, null);
    }
    if (typeof source.resolved === 'string' && /^https?:\/\//.test(source.resolved)) {
      assert.equal(entry.resolvedHost, new URL(source.resolved).hostname.toLowerCase());
      assert.equal(entry.workspaceLink, false);
    }
  }
});

test('dependency inventory errors do not expose malformed lockfile contents', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package-lock.json'), '{"private-value":"do-not-print"');
  const result = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', 'inventory.json'], cwd);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.includes('do-not-print'), false);
});

test('artifact manifest rejects an output hard link to an input', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'input.txt'), 'keep this file');
  linkSync(join(cwd, 'input.txt'), join(cwd, 'output.json'));
  const result = run('artifact-manifest.mjs', ['--output', 'output.json', '--', 'input.txt'], cwd);
  assert.notEqual(result.status, 0);
  assert.equal(readFileSync(join(cwd, 'input.txt'), 'utf8'), 'keep this file');
});

test('dependency inventory exposes only the resolved host, never URL credentials', () => {
  const cwd = fixture();
  writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({
    lockfileVersion: 3,
    packages: { 'node_modules/a': { resolved: 'https://user:password@registry.example.org/a.tgz' } },
  }));
  const result = run('dependency-inventory.mjs', ['--lockfile', 'package-lock.json', '--output', 'inventory.json'], cwd);
  assert.equal(result.status, 0, result.stderr);
  const content = readFileSync(join(cwd, 'inventory.json'), 'utf8');
  assert.equal(content.includes('password'), false);
  assert.equal(JSON.parse(content)[0].resolvedHost, 'registry.example.org');
});
