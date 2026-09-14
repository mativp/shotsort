import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { destinationProbeOverTheFilesystem } from '../../src/destination.mjs';
import { aDirectoryHolding, aTemporaryDirectory } from '../support/temporaryDirectories.mjs';
import { THE_PLATFORM_LISTS_OPEN_FILES_UNDER_DEV_FD } from '../support/platform.mjs';

test('asking the disk whether two files are the same photo', async (context) => {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('same-photo', {
    'a/P1.JPG': photo,
    'b/P1.JPG': photo,
    'c/P1.JPG': jpegFile('2026:08:27 18:00:00'),
    'short/P1.JPG': photo.subarray(0, photo.length - 1),
  });
  const at = (relativePath) => path.join(disk, relativePath);
  const probe = destinationProbeOverTheFilesystem();

  await context.test('a path with nothing at it is not there', () => assert.ok(!probe.exists(at('a/NOTHING.JPG'))));
  await context.test('and one with a file at it is', () => assert.ok(probe.exists(at('a/P1.JPG'))));

  await context.test('two files of the same bytes are the same photo',
    () => assert.ok(probe.contentsMatch(at('a/P1.JPG'), at('b/P1.JPG'), photo.length)));
  await context.test('and the answer does not depend on which of the two is asked about first',
    () => assert.ok(probe.contentsMatch(at('b/P1.JPG'), at('a/P1.JPG'), photo.length)));
  await context.test('two files of the same length but different bytes are not',
    () => assert.ok(!probe.contentsMatch(at('a/P1.JPG'), at('c/P1.JPG'), photo.length)));
  await context.test('nor are two of different lengths',
    () => assert.ok(!probe.contentsMatch(at('a/P1.JPG'), at('short/P1.JPG'), photo.length)));
  await context.test('and a file that is not there is no photo to match',
    () => assert.equal(probe.contentsMatch(at('a/P1.JPG'), at('a/NOTHING.JPG'), photo.length), false));
});

test('what the disk is asked about a pair of files', async (context) => {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('asked-about', {
    'a/P1.JPG': photo,
    'b/P1.JPG': photo,
    'grown/P1.JPG': Buffer.concat([photo, Buffer.alloc(16)]),
  });
  const at = (relativePath) => path.join(disk, relativePath);

  await context.test('a file holding more bytes than the size it was given is not the same as one that ends there', () => assert.equal(
    destinationProbeOverTheFilesystem().contentsMatch(at('grown/P1.JPG'), at('a/P1.JPG'), photo.length),
    false,
  ));

  const probe = destinationProbeOverTheFilesystem();
  probe.contentsMatch(at('a/P1.JPG'), at('b/P1.JPG'), photo.length);
  fs.writeFileSync(at('b/P1.JPG'), jpegFile('2026:08:27 18:00:00'));
  await context.test('a pair already asked about is answered as it was, whichever of the two is named first',
    () => assert.equal(probe.contentsMatch(at('b/P1.JPG'), at('a/P1.JPG'), photo.length), true));
});

test('the files a comparison leaves open', {
  skip: !THE_PLATFORM_LISTS_OPEN_FILES_UNDER_DEV_FD && 'this platform does not list its open files under /dev/fd',
}, async (context) => {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('left-open-comparing', { 'a/P1.JPG': photo, 'b/P1.JPG': photo, 'c/P1.JPG': jpegFile('2026:08:27 18:00:00') });
  const openFileCount = () => fs.readdirSync('/dev/fd').length;
  const openBefore = openFileCount();
  const probe = destinationProbeOverTheFilesystem();
  probe.contentsMatch(path.join(disk, 'a/P1.JPG'), path.join(disk, 'b/P1.JPG'), photo.length);
  probe.contentsMatch(path.join(disk, 'a/P1.JPG'), path.join(disk, 'c/P1.JPG'), photo.length);
  await context.test('both files of every pair compared are closed again', () => assert.equal(openFileCount(), openBefore));
});

// A raw file is tens of megabytes and is compared a megabyte at a time, so the loop that
// walks it in chunks only ever runs once on anything a fixture is small enough to be.
// These two are built large enough to make it go round more than once.
const BYTES_COMPARED_PER_READ = 1024 * 1024;

test('comparing two files larger than one read', async (context) => {
  const disk = aTemporaryDirectory('chunked');
  const longer = path.join(disk, 'longer.JPG');
  const shorter = path.join(disk, 'shorter.JPG');
  const stopsPartWay = path.join(disk, 'stops-part-way.JPG');

  const firstMegabyte = Buffer.alloc(BYTES_COMPARED_PER_READ, 0x41);
  fs.writeFileSync(longer, Buffer.concat([firstMegabyte, Buffer.alloc(BYTES_COMPARED_PER_READ, 0x42)]));
  fs.writeFileSync(shorter, Buffer.concat([firstMegabyte, Buffer.alloc(BYTES_COMPARED_PER_READ / 2, 0x42)]));
  fs.writeFileSync(stopsPartWay, firstMegabyte);

  const probe = destinationProbeOverTheFilesystem();
  const sizeOfTheShorter = fs.statSync(shorter).size;

  await context.test('a file that runs out part way through the one it is compared against is not the same photo',
    () => assert.ok(!probe.contentsMatch(longer, shorter, sizeOfTheShorter)));
  await context.test('nor is one that stops before the comparison has read as far as it was told to',
    () => assert.ok(!probe.contentsMatch(stopsPartWay, longer, fs.statSync(longer).size)));
  await context.test('and two files longer than a single read that do match are still found to match',
    () => assert.ok(probe.contentsMatch(longer, longer, fs.statSync(longer).size)));
});
