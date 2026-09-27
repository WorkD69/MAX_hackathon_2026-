import { createHash } from 'node:crypto';
import { createReadStream, lstatSync, writeFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

function parseArgs(args) {
  const index = args.indexOf('--output');
  if (index < 0 || !args[index + 1] || args.filter((arg) => arg === '--output').length !== 1) {
    throw new Error('Usage: artifact-manifest.mjs --output FILE -- FILE...');
  }
  const inputs = args.filter((arg, position) => position !== index && position !== index + 1 && arg !== '--');
  if (inputs.length === 0 || inputs.some((arg) => arg.startsWith('--'))) throw new Error('Explicit files are required');
  const output = resolve(args[index + 1]);
  try {
    const stat = lstatSync(output);
    if (!stat.isFile() || stat.nlink !== 1) throw new Error('Output must be a regular file without links');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return { output, inputs };
}

async function hashFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  const { output, inputs } = parseArgs(process.argv.slice(2));
  const seen = new Set();
  const entries = [];
  for (const input of inputs) {
    const absolute = resolve(input);
    if (absolute === output) throw new Error('Manifest cannot include its own output');
    if (seen.has(absolute)) throw new Error('Duplicate input file');
    seen.add(absolute);
    const stat = lstatSync(absolute);
    if (!stat.isFile()) throw new Error('Input must be a regular file');
    entries.push({
      path: relative(process.cwd(), absolute).split(sep).join('/'),
      size: stat.size,
      sha256: await hashFile(absolute),
    });
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  writeFileSync(output, `${JSON.stringify(entries, null, 2)}\n`, { flag: 'w' });
}

main().catch((error) => {
  process.stderr.write('artifact-manifest: failed\n');
  process.exitCode = 1;
});
