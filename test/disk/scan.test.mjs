import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { findMediaFiles } from '../../src/scan.mjs';
import { aDirectoryHolding } from '../support/temporaryDirectories.mjs';

test('the files found in the folders named', async (context) => {
  const card = aDirectoryHolding('found', {
    'B/P2.JPG': jpegFile('2026:08:27 10:00:00'),
    'A/P1.JPG': jpegFile('2026:08:27 10:00:00'),
  });
  const aPhoto = path.join(card, 'A', 'P1.JPG');

  await context.test('come back in the order of their paths, whatever order the folders were named in', () => assert.deepEqual(
    findMediaFiles([path.join(card, 'B'), path.join(card, 'A')]).map((file) => path.relative(card, file.path)),
    [path.join('A', 'P1.JPG'), path.join('B', 'P2.JPG')],
  ));
  await context.test('a file reached through two of them is found once, under the first it was reached through', () => assert.deepEqual(
    findMediaFiles([card, aPhoto]).filter((file) => file.path === aPhoto).map((file) => file.sortRoot),
    [card],
  ));
});
