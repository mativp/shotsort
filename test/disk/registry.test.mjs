import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { readCameraClockFromFile } from '../../src/formats/registry.mjs';
import { formatCameraClock } from '../../src/clock.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { aTemporaryDirectory } from '../support/temporaryDirectories.mjs';
import { THE_FILESYSTEM_HONOURS_PERMISSIONS, THE_PLATFORM_LISTS_OPEN_FILES_UNDER_DEV_FD } from '../support/platform.mjs';
import { writeFixtureFile } from '../support/files.mjs';

const clockFoundIn = (filePath) => readCameraClockFromFile(filePath, fs.statSync(filePath).size);

test('a photo on disk', async (context) => {
  const photo = path.join(aTemporaryDirectory('photo-on-disk'), 'P1000001.JPG');
  writeFixtureFile(photo, jpegFile('2026:07:04 11:00:00'));
  const found = clockFoundIn(photo);
  await context.test('is read through the file rather than a copy of it in memory',
    () => assert.equal(formatCameraClock(found.clock), '2026-07-04 11:00:00'));
  await context.test('and says the date came from inside it', () => assert.equal(found.source, DATE_SOURCE.exifMetadata));
});

test('the files a read leaves open', {
  skip: !THE_PLATFORM_LISTS_OPEN_FILES_UNDER_DEV_FD && 'this platform does not list its open files under /dev/fd',
}, async (context) => {
  const openFileCount = () => fs.readdirSync('/dev/fd').length;
  const photo = path.join(aTemporaryDirectory('left-open'), 'P1000001.JPG');
  writeFixtureFile(photo, jpegFile('2026:07:04 11:00:00'));

  const openBefore = openFileCount();
  clockFoundIn(photo);
  await context.test('a file that was read is closed again', () => assert.equal(openFileCount(), openBefore));
});

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
