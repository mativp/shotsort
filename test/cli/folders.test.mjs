import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { writeFixtureFile } from '../fixtures/cardDump.mjs';
import { THE_FILESYSTEM_HONOURS_PERMISSIONS } from '../support/platform.mjs';
import {
  EXIT_EVERYTHING_PLACED, EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND, filesUnder, freshCardDump, runCommand,
} from '../support/commandLine.mjs';
import { aDirectoryHolding, aPathNotYetTaken, aTemporaryDirectory } from '../support/temporaryDirectories.mjs';

test('when the filesystem refuses', {
  skip: !THE_FILESYSTEM_HONOURS_PERMISSIONS && 'this filesystem does not refuse a destination to its owner',
}, async (context) => {
  const dump = freshCardDump('unwritable-destination');
  const destination = aPathNotYetTaken('unwritable-library');
  fs.mkdirSync(destination);
  fs.chmodSync(destination, 0o500);

  const refused = runCommand(['-s', dump, '-d', destination]);
  await context.test('a destination that cannot be written to fails loudly and exits 1', () => assert.ok(
    refused.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && /failed/.test(refused.standardOutput)
    && /EACCES|EPERM/.test(refused.standardError),
    refused.standardOutput + refused.standardError,
  ));
  await context.test('and leaves every original where it was',
    () => assert.ok(fs.existsSync(path.join(dump, 'DCIM/100_PANA/P1000001.JPG'))));

  fs.chmodSync(destination, 0o700);
});

test('the folders left behind', async (context) => {
  const copied = freshCardDump('tidy-copy');
  const emptyOnTheCard = path.join(copied, 'DCIM', '103_PANA');
  fs.mkdirSync(emptyOnTheCard, { recursive: true });
  const copiedLibrary = aPathNotYetTaken('tidy-copy-library');
  runCommand(['-s', copied, '-d', copiedLibrary]);
  await context.test('copying leaves every source folder standing, the already-empty ones included', () => assert.ok(
    fs.existsSync(emptyOnTheCard) && fs.existsSync(path.join(copied, 'DCIM', '100_PANA')),
    JSON.stringify(filesUnder(copied)),
  ));

  const moved = freshCardDump('tidy-move');
  runCommand(['--move', moved]);
  await context.test('moving removes the folders it emptied',
    () => assert.ok(!fs.existsSync(path.join(moved, 'DCIM'))));
  await context.test('but never the folder you named, even once nothing of ours is left in it',
    () => assert.ok(fs.existsSync(moved)));

  const emptiedEntirely = aTemporaryDirectory('sole');
  writeFixtureFile(path.join(emptiedEntirely, 'ONLY.JPG'), jpegFile('2026:04:02 08:00:00'));
  const elsewhere = aPathNotYetTaken('sole-library');
  runCommand(['--move', '-s', emptiedEntirely, '-d', elsewhere]);
  await context.test('and a source folder the move empties completely is still left standing', () => assert.ok(
    fs.existsSync(emptiedEntirely) && fs.existsSync(path.join(elsewhere, '2026-04-02', 'ONLY.JPG')),
    `${fs.existsSync(emptiedEntirely)} / ${JSON.stringify(filesUnder(elsewhere))}`,
  ));
});

test('folders the walk must not enter', async (context) => {
  const dump = aTemporaryDirectory('skip');
  const shot = '2026:04:03 09:00:00';
  writeFixtureFile(path.join(dump, 'DCIM', 'KEEP.JPG'), jpegFile(shot));
  for (const skipped of ['.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN']) {
    writeFixtureFile(path.join(dump, skipped, 'IGNORED.JPG'), jpegFile('1999:01:01 00:00:00'));
  }
  writeFixtureFile(path.join(dump, 'holiday.', 'TAKEN.JPG'), jpegFile(shot));

  runCommand(['--move', dump]);
  const sorted = filesUnder(dump).filter((sortedPath) => sortedPath.startsWith('2026-'));

  await context.test('a system folder is skipped even when its name does not start with a dot',
    () => assert.ok(!sorted.some((sortedPath) => sortedPath.endsWith('IGNORED.JPG')), JSON.stringify(sorted)));
  await context.test('every one of those folders keeps its own file where it was', () => assert.ok(
    ['.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN']
      .every((skipped) => fs.existsSync(path.join(dump, skipped, 'IGNORED.JPG'))),
  ));
  await context.test('a folder whose name merely ends with a dot is walked like any other', () => assert.ok(
    sorted.includes('2026-04-03/TAKEN.JPG') && sorted.includes('2026-04-03/KEEP.JPG'),
    JSON.stringify(sorted),
  ));
});

test('naming one file rather than a folder', async (context) => {
  const disk = aDirectoryHolding('one-file', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/notes.txt': Buffer.from('not a photo'),
  });
  const onePhoto = path.join(disk, 'DCIM', 'P1.JPG');

  const sorted = runCommand([onePhoto]);
  await context.test('a single photo may be named instead of a folder',
    () => assert.equal(sorted.exitCode, EXIT_EVERYTHING_PLACED));
  await context.test('and its day folder is made beside it rather than under it',
    () => assert.ok(fs.existsSync(path.join(disk, 'DCIM', '2026-08-27', 'P1.JPG')), filesUnder(disk).join('\n')));

  const notAPhoto = runCommand([path.join(disk, 'DCIM', 'notes.txt')]);
  await context.test('a named file that is no kind of photo or video is nothing to sort', () => assert.ok(
    notAPhoto.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && /no photos or video found/.test(notAPhoto.standardError),
    String(notAPhoto.standardError),
  ));

  const missing = runCommand([path.join(disk, 'DCIM', 'NOT-THERE.JPG')]);
  await context.test('a folder or file that is not there is reported with its path and its reason', () => assert.ok(
    missing.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && missing.standardError.includes('NOT-THERE.JPG') && /ENOENT/.test(missing.standardError),
    String(missing.standardError),
  ));
});

test('a folder the walk is not allowed into', {
  skip: !THE_FILESYSTEM_HONOURS_PERMISSIONS && 'this filesystem does not refuse a folder to its owner',
}, async (context) => {
  const disk = aDirectoryHolding('unreadable-subfolder', {
    'DCIM/100/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/101/P2.JPG': jpegFile('2026:08:28 09:07:01'),
  });
  const shut = path.join(disk, 'DCIM', '101');
  fs.chmodSync(shut, 0o000);

  const sorted = runCommand(['-n', disk]);
  await context.test('a folder the walk is not allowed into is stepped over rather than bringing the run down', () => assert.ok(
    sorted.exitCode === EXIT_EVERYTHING_PLACED && /2026-08-27/.test(sorted.standardOutput)
    && !/2026-08-28/.test(sorted.standardOutput),
    sorted.standardOutput + sorted.standardError,
  ));

  fs.chmodSync(shut, 0o700);
});
