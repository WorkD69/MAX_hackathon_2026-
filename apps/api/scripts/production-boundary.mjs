// Only the team's test adapter is removed. Published dependencies are immutable.
import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = new URL('../dist-production/modules/max-adapter/', import.meta.url);
const factoryUrl = new URL('factory.js', output);
const barrelUrl = new URL('index.js', output);
let factory = await readFile(factoryUrl, 'utf8');
let barrel = await readFile(barrelUrl, 'utf8');

// tsc follows imports even when fake.ts is excluded as a root. Fail on seam drift
// rather than silently deleting another implementation or leaving a broken import.
function replaceOnce(text, pattern, replacement) {
  assert.equal([...text.matchAll(pattern)].length, 1, `production seam changed: ${pattern}`);
  return text.replace(pattern, replacement);
}
factory = replaceOnce(factory, /^import \{ FakeMaxAdapter \} from '\.\/fake\.js';\r?\n/gm, '');
factory = replaceOnce(factory, /(if \(config\.MAX_ADAPTER_MODE === 'fake'\)\s*)return new FakeMaxAdapter\(config\);/g,
  '$1throw new Error(\'MAX_ADAPTER_MODE_NOT_LIVE\');');
barrel = replaceOnce(barrel, /^export \* from '\.\/fake\.js';\r?\n/gm, '');
assert.match(factory, /return new RealMaxAdapter\(config, sendCoordinator, fetcher\);/);
assert.doesNotMatch(factory + barrel, /FakeMaxAdapter|\.\/fake\.js/);
await writeFile(factoryUrl, factory);
await writeFile(barrelUrl, barrel);
await rm(fileURLToPath(new URL('fake.js', output)));
