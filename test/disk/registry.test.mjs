import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { readCameraClockFromFile } from '../../src/formats/registry.mjs';
import { aTemporaryDirectory } from '../support/temporaryDirectories.mjs';
import { THE_FILESYSTEM_HONOURS_PERMISSIONS } from '../support/platform.mjs';
import { writeFixtureFile } from '../support/files.mjs';

const clockFoundIn = (filePath) => readCameraClockFromFile(filePath, fs.statSync(filePath).size);

test('a file that cannot be opened', {
  skip: !THE_FILESYSTEM_HONOURS_PERMISSIONS && 'this filesystem does not refuse a file to its owner',
}, async (context) => {
  const unreadable = path.join(aTemporaryDirectory('unreadable'), 'unreadable.jpg');
  writeFixtureFile(unreadable, jpegFile('2026:07:04 11:00:00'));
  fs.chmodSync(unreadable, 0o000);
  await context.test('a file that cannot be opened reports no date rather than throwing',
    () => assert.equal(clockFoundIn(unreadable), null));
});

test('a file that cannot be opened at all', async (context) => {
  await context.test('a file that is not there is read as no date rather than throwing',
    () => assert.equal(readCameraClockFromFile(path.join(aTemporaryDirectory('not-there'), 'not-there-at-all.JPG'), 1000), null));
});
