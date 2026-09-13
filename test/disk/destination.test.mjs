import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { destinationProbeOverTheFilesystem } from '../../src/destination.mjs';
import { aDirectoryHolding, aTemporaryDirectory } from '../support/temporaryDirectories.mjs';

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
    () => assert.ok(!probe.contentsMatch(at('a/P1.JPG'), at('a/NOTHING.JPG'), photo.length)));
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
