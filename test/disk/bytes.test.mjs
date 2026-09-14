import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { openFileAsByteSource, readAtMostBytesAt } from '../../src/bytes.mjs';
import { aTemporaryDirectory } from '../support/temporaryDirectories.mjs';
import { writeFixtureFile } from '../support/files.mjs';

test('a file on disk read from before its start', async (context) => {
  const file = path.join(aTemporaryDirectory('before-its-start'), 'P1000001.JPG');
  writeFixtureFile(file, Buffer.from([1, 2, 3, 4]));
  const byteSource = openFileAsByteSource(file, 4);
  context.after(() => byteSource.close());

  await context.test('gives nothing, as a buffer does, rather than whatever the file was last read at',
    () => assert.equal(readAtMostBytesAt(byteSource, -1, 2), null));
  await context.test('and a position further back gives nothing rather than throwing',
    () => assert.equal(readAtMostBytesAt(byteSource, -2, 2), null));
  await context.test('and neither does an offset that was never there to be read',
    () => assert.equal(readAtMostBytesAt(byteSource, null, 2), null));
});
