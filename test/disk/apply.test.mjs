import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { movieFile } from '../fixtures/quicktime.mjs';
import { NO_FREE_NAME_IN_THE_DAY_FOLDER, PLACEMENT } from '../../src/plan.mjs';
import { applyPlan } from '../../src/apply.mjs';
import { aDirectoryHolding, aTemporaryDirectory } from '../support/temporaryDirectories.mjs';
import { THE_PLATFORM_LETS_ANYONE_MAKE_A_SYMBOLIC_LINK } from '../support/platform.mjs';
import { writeFixtureFile } from '../support/files.mjs';

// Every way carrying out a plan can go wrong, which is the half of the program a real disk
// will not perform on demand: a rename that crosses a disk boundary, a copy that comes up
// short, a target that appeared between the plan and the move. The filesystem is handed in
// wrapped, so the failure is exactly the one being asked about and everything else is the
// real thing happening in a real directory.
const aFilesystemThat = (whatItDoesDifferently) => ({ ...fs, ...whatItDoesDifferently });

const throwing = (code) => () => {
  throw Object.assign(new Error(`pretend ${code}`), { code });
};

function anEntryFor(sourcePath, targetPath, placement) {
  return {
    sourcePath,
    targetPath,
    folderName: '2026-08-27',
    clock: null,
    dateSource: null,
    sizeInBytes: fs.existsSync(sourcePath) ? fs.statSync(sourcePath).size : 0,
    fileTimestamp: new Date(2026, 7, 27, 9, 7, 1),
    placement,
    failureReason: placement === PLACEMENT.couldNotBePlaced ? NO_FREE_NAME_IN_THE_DAY_FOLDER : null,
  };
}

test('a move onto another disk', async (context) => {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('another-disk', { 'DCIM/P1.JPG': photo });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');

  // rename is what fails when the destination is on another disk, and the only thing that
  // does: the copy and the delete that stand in for it are the real ones.
  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], {
    moveInsteadOfCopying: true, directoriesToTidy: [],
    filesystem: aFilesystemThat({ renameSync: throwing('EXDEV') }),
  });

  await context.test('a move onto another disk is carried out as a copy and a delete',
    () => assert.ok(outcome.placed === 1 && outcome.failed === 0, JSON.stringify(outcome)));
  await context.test('and the photo arrives whole',
    () => assert.ok(fs.existsSync(target) && fs.readFileSync(target).equals(photo)));
  await context.test('and the original is gone, which is what makes it a move',
    () => assert.ok(!fs.existsSync(source)));
  await context.test('and the file keeps the time it was shot rather than the time it was copied', () => assert.ok(
    Math.abs(fs.statSync(target).mtime.getTime() - new Date(2026, 7, 27, 9, 7, 1).getTime()) < 1000,
    String(fs.statSync(target).mtime),
  ));
});

test('a copy onto another disk that came up short', async (context) => {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('short-copy', { 'DCIM/P1.JPG': photo });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');

  // The copy lands, but the card is pulled before it is whole: the file at the far end is
  // shorter than the one it came from, and the original must survive that.
  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], {
    moveInsteadOfCopying: true, directoriesToTidy: [],
    filesystem: aFilesystemThat({
      renameSync: throwing('EXDEV'),
      statSync: (askedAbout, ...rest) => (askedAbout === target
        ? { size: fs.statSync(askedAbout, ...rest).size - 1 }
        : fs.statSync(askedAbout, ...rest)),
    }),
  });

  await context.test('a copy that came up short is counted as a failure rather than as a move',
    () => assert.ok(outcome.placed === 0 && outcome.failed === 1, JSON.stringify(outcome)));
  await context.test('and it says what went wrong in words, there being no error code to give',
    () => assert.equal(outcome.failures[0].reason, 'copy was incomplete, original left untouched'));
  await context.test('the half written copy is taken away rather than left to look like the photo',
    () => assert.ok(!fs.existsSync(target)));
  await context.test('and the original is still on the card',
    () => assert.ok(fs.existsSync(source) && fs.readFileSync(source).equals(photo)));
});

test('a target that appeared after the plan was made', async (context) => {
  const disk = aDirectoryHolding('target-appeared', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    '2026-08-27/P1.JPG': jpegFile('2026:08:27 18:00:00'),
  });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');
  const somethingElseThere = fs.readFileSync(target);

  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], { moveInsteadOfCopying: true, directoriesToTidy: [] });

  await context.test('a move onto a name that filled up after the plan was made is refused',
    () => assert.ok(outcome.failed === 1 && outcome.failures[0].reason === 'EEXIST', JSON.stringify(outcome)));
  await context.test('and neither the photo that was there nor the one being moved is lost',
    () => assert.ok(fs.readFileSync(target).equals(somethingElseThere) && fs.existsSync(source)));
});

test('a rename that failed for some other reason', async (context) => {
  const disk = aDirectoryHolding('rename-refused', { 'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01') });
  const source = path.join(disk, 'DCIM', 'P1.JPG');

  const outcome = applyPlan(
    [anEntryFor(source, path.join(disk, '2026-08-27', 'P1.JPG'), PLACEMENT.intoItsDayFolder)],
    { moveInsteadOfCopying: true, directoriesToTidy: [], filesystem: aFilesystemThat({ renameSync: throwing('EACCES') }) },
  );

  await context.test('a rename refused for any reason but a disk boundary is reported, not copied around',
    () => assert.ok(outcome.failed === 1 && outcome.failures[0].reason === 'EACCES', JSON.stringify(outcome)));
  await context.test('and the original is left where it was', () => assert.ok(fs.existsSync(source)));
});

test('a duplicate when copying', async (context) => {
  const disk = aDirectoryHolding('duplicate-copied', { 'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'), '2026-08-27/P1.JPG': jpegFile('2026:08:27 09:07:01') });
  const outcome = applyPlan([anEntryFor(path.join(disk, 'DCIM', 'P1.JPG'), path.join(disk, '2026-08-27', 'P1.JPG'), PLACEMENT.duplicateOfAFileAlreadySorted)]);
  await context.test('is counted as a duplicate and left on the card', () => assert.ok(
    outcome.duplicates === 1 && fs.existsSync(path.join(disk, 'DCIM', 'P1.JPG')),
    JSON.stringify(outcome),
  ));
});

test('what is counted without anything being written', async (context) => {
  const disk = aDirectoryHolding('counted', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/P2.JPG': jpegFile('2026:08:27 10:00:00'),
    '2026-08-27/P3.JPG': jpegFile('2026:08:27 11:00:00'),
  });
  const named = [];
  const outcome = applyPlan([
    anEntryFor(path.join(disk, 'DCIM', 'P1.JPG'), null, PLACEMENT.couldNotBePlaced),
    anEntryFor(path.join(disk, '2026-08-27', 'P3.JPG'), path.join(disk, '2026-08-27', 'P3.JPG'),
      PLACEMENT.alreadyInItsDayFolder),
    anEntryFor(path.join(disk, 'DCIM', 'P2.JPG'), path.join(disk, '2026-08-27', 'P2.JPG'),
      PLACEMENT.duplicateOfAFileAlreadySorted),
  ], { moveInsteadOfCopying: true, directoriesToTidy: [], onFilePlaced: (entry) => named.push(path.basename(entry.sourcePath)) });

  await context.test('a photo the plan found nowhere for is counted as failed, with the reason the plan gave', () => assert.ok(
    outcome.failed === 1 && outcome.failures[0].reason === NO_FREE_NAME_IN_THE_DAY_FOLDER,
    JSON.stringify(outcome.failures),
  ));
  await context.test('a photo already in its day folder is counted as being in place',
    () => assert.equal(outcome.alreadyInPlace, 1));
  await context.test('and --verbose names it, nothing having been written for it',
    () => assert.ok(named.includes('P3.JPG'), named.join()));
  await context.test('a duplicate is dropped from the card when files are being moved',
    () => assert.ok(outcome.duplicates === 1 && !fs.existsSync(path.join(disk, 'DCIM', 'P2.JPG'))));
  await context.test('and the photo it duplicates is left alone',
    () => assert.ok(fs.existsSync(path.join(disk, '2026-08-27', 'P3.JPG'))));
  await context.test('a photo the plan found nowhere for is not named as placed',
    () => assert.ok(!named.includes('P1.JPG'), named.join()));
});

const BYTES_IN_A_MEGABYTE = 1024 * 1024;

const BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS = 64 * BYTES_IN_A_MEGABYTE;

const A_MOMENT_A_CLIP_WAS_SHOT = new Date(2026, 7, 27, 9, 7, 1);

function aDiskHoldingAClipOf(name, sizeInBytes) {
  const disk = aDirectoryHolding(name, { 'DCIM/P1000001.MOV': movieFile('2026-08-27 09:07:01') });
  const source = path.join(disk, 'DCIM', 'P1000001.MOV');
  fs.truncateSync(source, sizeInBytes);
  return { source, target: path.join(disk, '2026-08-27', 'P1000001.MOV'), original: fs.readFileSync(source) };
}

function aFilesystemKeepingCountOfOpenFiles(whatItDoesDifferently = {}) {
  const openDescriptors = new Set();
  const filesystem = aFilesystemThat({
    ...whatItDoesDifferently,
    openSync: (...openArguments) => {
      const descriptor = fs.openSync(...openArguments);
      openDescriptors.add(descriptor);
      return descriptor;
    },
    closeSync: (descriptor) => {
      openDescriptors.delete(descriptor);
      fs.closeSync(descriptor);
    },
  });
  return { filesystem, openDescriptors };
}

test('a big clip is copied in chunks saying how far it has got', async (context) => {
  const { source, target, original } = aDiskHoldingAClipOf('big-clip', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  const entry = anEntryFor(source, target, PLACEMENT.intoItsDayFolder);
  const reports = [];
  const counted = aFilesystemKeepingCountOfOpenFiles();
  const outcome = applyPlan([entry], {
    onBytesWritten: (reportedEntry, bytesWritten) => reports.push([reportedEntry, bytesWritten]),
    filesystem: counted.filesystem,
  });

  await context.test('a clip of 64 MB is copied whole',
    () => assert.ok(outcome.placed === 1 && fs.readFileSync(target).equals(original), JSON.stringify(outcome)));
  await context.test('and says how many bytes are written after every megabyte, for the file being written', () => assert.ok(
    reports.length === 64 && reports.every(([reportedEntry, bytesWritten], index) =>
      reportedEntry === entry && bytesWritten === (index + 1) * BYTES_IN_A_MEGABYTE),
    reports.map(([, bytesWritten]) => bytesWritten).slice(0, 3).join(),
  ));
  await context.test('and closes both files it opened to do it', () => assert.equal(counted.openDescriptors.size, 0));
  await context.test('and keeps the time it was shot', () => assert.ok(
    Math.abs(fs.statSync(target).mtime.getTime() - A_MOMENT_A_CLIP_WAS_SHOT.getTime()) < 1000,
    String(fs.statSync(target).mtime),
  ));

  const justUnder = aDiskHoldingAClipOf('clip-just-under', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS - 1);
  const reportsJustUnder = [];
  const outcomeJustUnder = applyPlan([anEntryFor(justUnder.source, justUnder.target, PLACEMENT.intoItsDayFolder)],
    { onBytesWritten: (_entryBeingWritten, bytesWritten) => reportsJustUnder.push(bytesWritten) });
  await context.test('a clip one byte smaller is left to the operating system to copy, and says nothing until it is done', () => assert.ok(
    outcomeJustUnder.placed === 1 && reportsJustUnder.length === 0 && fs.readFileSync(justUnder.target).equals(justUnder.original),
    JSON.stringify(outcomeJustUnder),
  ));

  const inPieces = aDiskHoldingAClipOf('clip-in-pieces', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  const outcomeInPieces = applyPlan([anEntryFor(inPieces.source, inPieces.target, PLACEMENT.intoItsDayFolder)], {
    filesystem: aFilesystemThat({
      writeSync: (descriptor, buffer, offset, length, position) =>
        fs.writeSync(descriptor, buffer, offset, Math.ceil(length / 3), position),
    }),
  });
  await context.test('a disk that takes each chunk a piece at a time still ends up with every byte in its place', () => assert.ok(
    outcomeInPieces.placed === 1 && fs.readFileSync(inPieces.target).equals(inPieces.original),
    JSON.stringify(outcomeInPieces),
  ));

  const acrossDisks = aDiskHoldingAClipOf('clip-across-disks', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  const reportsAcrossDisks = [];
  const moved = applyPlan([anEntryFor(acrossDisks.source, acrossDisks.target, PLACEMENT.intoItsDayFolder)], {
    moveInsteadOfCopying: true, directoriesToTidy: [],
    onBytesWritten: (_entryBeingWritten, bytesWritten) => reportsAcrossDisks.push(bytesWritten),
    filesystem: aFilesystemThat({ renameSync: throwing('EXDEV') }),
  });
  await context.test('a big clip moved onto another disk is copied in chunks too, and only then taken off the card', () => assert.ok(
    moved.placed === 1 && reportsAcrossDisks.length === 64 && !fs.existsSync(acrossDisks.source)
    && fs.readFileSync(acrossDisks.target).equals(acrossDisks.original),
    JSON.stringify(moved),
  ));
});

test('a big clip whose copy goes wrong', async (context) => {
  const cutShort = aDiskHoldingAClipOf('clip-cut-short', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  const countedCutShort = aFilesystemKeepingCountOfOpenFiles({
    readSync: (descriptor, buffer, offset, length, position) =>
      (position >= 8 * BYTES_IN_A_MEGABYTE ? 0 : fs.readSync(descriptor, buffer, offset, length, position)),
  });
  const outcomeCutShort = applyPlan([anEntryFor(cutShort.source, cutShort.target, PLACEMENT.intoItsDayFolder)], {
    filesystem: countedCutShort.filesystem,
  });
  await context.test('a clip whose card stops giving bytes part way through is counted as failed', () => assert.ok(
    outcomeCutShort.failed === 1 && outcomeCutShort.failures[0].reason === 'copy was incomplete, original left untouched',
    JSON.stringify(outcomeCutShort.failures),
  ));
  await context.test('and the part that was written is taken away, while the clip on the card is left whole',
    () => assert.ok(!fs.existsSync(cutShort.target) && fs.readFileSync(cutShort.source).equals(cutShort.original)));
  await context.test('with neither file left open', () => assert.equal(countedCutShort.openDescriptors.size, 0));

  const diskFails = aDiskHoldingAClipOf('clip-disk-fails', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  const countedDiskFails = aFilesystemKeepingCountOfOpenFiles({
    writeSync: (descriptor, buffer, offset, length, position) => {
      if (position >= 8 * BYTES_IN_A_MEGABYTE) throwing('EIO')();
      return fs.writeSync(descriptor, buffer, offset, length, position);
    },
  });
  const outcomeDiskFails = applyPlan([anEntryFor(diskFails.source, diskFails.target, PLACEMENT.intoItsDayFolder)], {
    filesystem: countedDiskFails.filesystem,
  });
  await context.test('a disk that fails part way through a clip is reported with its own reason', () => assert.ok(
    outcomeDiskFails.failed === 1 && outcomeDiskFails.failures[0].reason === 'EIO',
    JSON.stringify(outcomeDiskFails.failures),
  ));
  await context.test('and leaves no half written clip behind, and no file open',
    () => assert.ok(!fs.existsSync(diskFails.target) && countedDiskFails.openDescriptors.size === 0));

  const clash = aDiskHoldingAClipOf('clip-target-taken', BYTES_IN_THE_SMALLEST_FILE_COPIED_IN_CHUNKS);
  writeFixtureFile(clash.target, Buffer.from('a different clip'));
  const countedClash = aFilesystemKeepingCountOfOpenFiles();
  const outcomeClash = applyPlan([anEntryFor(clash.source, clash.target, PLACEMENT.intoItsDayFolder)], { filesystem: countedClash.filesystem });
  await context.test('a big clip copied onto a name that filled up after the plan was made is refused', () => assert.ok(
    outcomeClash.failed === 1 && outcomeClash.failures[0].reason === 'EEXIST',
    JSON.stringify(outcomeClash.failures),
  ));
  await context.test('and the file that was already there is not the one taken away',
    () => assert.equal(fs.readFileSync(clash.target, 'utf8'), 'a different clip'));
  await context.test('and the clip on the card, opened to be copied, is closed again',
    () => assert.equal(countedClash.openDescriptors.size, 0));
});

test('each file is announced before and after it is placed', async (context) => {
  const disk = aDirectoryHolding('announced', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/P2.JPG': jpegFile('2026:08:27 10:00:00'),
    '2026-08-27/P2.JPG': jpegFile('2026:08:27 18:00:00'),
  });
  const heard = [];
  const hear = (what) => (entry) => heard.push(`${what} ${path.basename(entry.sourcePath)}`);

  applyPlan([
    anEntryFor(path.join(disk, 'DCIM', 'P1.JPG'), path.join(disk, '2026-08-27', 'P1.JPG'), PLACEMENT.intoItsDayFolder),
    anEntryFor(path.join(disk, 'DCIM', 'P2.JPG'), path.join(disk, '2026-08-27', 'P2.JPG'), PLACEMENT.intoItsDayFolder),
    anEntryFor(path.join(disk, 'DCIM', 'P3.JPG'), null, PLACEMENT.couldNotBePlaced),
  ], { onFileStarted: hear('started'), onFilePlaced: hear('placed'), onFileFinished: hear('finished') });

  await context.test(
    'every file is announced before anything is done with it and again once it is over, even one whose copy is refused',
    () => assert.deepEqual(heard, [
      'started P1.JPG', 'placed P1.JPG', 'finished P1.JPG',
      'started P2.JPG', 'finished P2.JPG',
      'started P3.JPG', 'finished P3.JPG',
    ]),
  );
});

test('tidying up folders it cannot read', async (context) => {
  const disk = aDirectoryHolding('tidying', { 'DCIM/100/P1.JPG': jpegFile('2026:08:27 09:07:01') });
  fs.unlinkSync(path.join(disk, 'DCIM', '100', 'P1.JPG'));

  const cannotBeRead = applyPlan([], {
    moveInsteadOfCopying: true,
    directoriesToTidy: [disk],
    filesystem: aFilesystemThat({ readdirSync: throwing('EACCES') }),
  });
  await context.test('a folder that cannot be read is left alone rather than bringing the run down',
    () => assert.equal(cannotBeRead.emptyDirectoriesRemoved, 0));

  const cannotBeRemoved = applyPlan([], {
    moveInsteadOfCopying: true,
    directoriesToTidy: [disk],
    filesystem: aFilesystemThat({ rmdirSync: throwing('ENOTEMPTY') }),
  });
  await context.test('nor does a folder that will not be removed',
    () => assert.ok(cannotBeRemoved.emptyDirectoriesRemoved === 0 && fs.existsSync(path.join(disk, 'DCIM', '100'))));

  const tidied = applyPlan([], { moveInsteadOfCopying: true, directoriesToTidy: [disk] });
  await context.test('and the folders the card emptied out are taken away once they can be', () => assert.ok(
    tidied.emptyDirectoriesRemoved === 2 && !fs.existsSync(path.join(disk, 'DCIM')),
    JSON.stringify(tidied),
  ));
  await context.test('while the folder the user named is kept, empty or not', () => assert.ok(fs.existsSync(disk)));

  await context.test('a copy run tidies nothing, every original still being where it was', () => assert.equal(
    applyPlan([], { moveInsteadOfCopying: false, directoriesToTidy: [disk] }).emptyDirectoriesRemoved,
    0,
  ));
});

test('tidying up a folder holding a link to another', {
  skip: !THE_PLATFORM_LETS_ANYONE_MAKE_A_SYMBOLIC_LINK && 'this platform does not let an ordinary account make a symbolic link',
}, async (context) => {
  const card = aTemporaryDirectory('tidying-a-link');
  const elsewhere = aDirectoryHolding('linked-to', {});
  fs.mkdirSync(path.join(elsewhere, 'an-empty-folder'));
  fs.symlinkSync(elsewhere, path.join(card, 'a-link'), 'dir');

  const tidied = applyPlan([], { moveInsteadOfCopying: true, directoriesToTidy: [card] });
  await context.test('the link is not followed, so an empty folder outside the card is left where it was', () => assert.ok(
    tidied.emptyDirectoriesRemoved === 0 && fs.existsSync(path.join(elsewhere, 'an-empty-folder')),
    JSON.stringify(tidied),
  ));
});
