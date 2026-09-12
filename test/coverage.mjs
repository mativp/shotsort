// `npm run coverage` runs both suites under Node's own coverage reporter. They are spawned
// rather than imported because each calls process.exit when it is done.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));

for (const suite of ['unittest.mjs', 'selftest.mjs']) {
  test(suite, () => {
    const result = spawnSync(process.execPath, [path.join(testDirectory, suite)], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(`${suite} failed:\n${result.stdout}${result.stderr}`);
  });
}
