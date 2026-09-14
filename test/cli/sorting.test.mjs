import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PANASONIC_RAW_SIGNATURE, tiffFile } from '../fixtures/tiff.mjs';
import { jpegFile, jpegFilePaddedTo } from '../fixtures/jpeg.mjs';
import { EXIT_CODE } from '../../cli/usage.mjs';
import { runCommand } from '../support/commandLine.mjs';
import { aPathNotYetTaken, aTemporaryDirectory, freshCardDump } from '../support/temporaryDirectories.mjs';
import { filesAreIdentical, filesUnder, visibleFilesUnder, writeFixtureFile } from '../support/files.mjs';

test('sorting a card dump in place', async (context) => {
  const dump = freshCardDump('in-place');
  const dryRun = runCommand(['-n', dump]);
  const sorted = runCommand(['--move', dump]);

  const expectedFiles = [
    '2026-08-27/01/P1000001.JPG',
    '2026-08-27/02/P1000001.JPG',
    '2026-08-27/P1000001.RW2',
    '2026-08-27/P1000002.JPG',
    '2026-08-27/P1000002.RW2',
    '2026-08-27/P1000003.RW2',
    '2026-08-27/P1000004.HSP',
    '2026-08-28/P1000005.MP4',
    '2026-08-28/P1000006.MP4',
    '2026-08-29/00000.MTS',
    '2026-08-29/P1000007.MOV',
    'PRIVATE/AVCHD/BDMV/CLIPINF/00000.CPI',
  ];
  const actualFiles = visibleFilesUnder(dump);

  await context.test('day folders land at the top of the folder given',
    () => assert.deepEqual(actualFiles, expectedFiles));
  await context.test('a raw recording no date follows the jpeg of the same shot',
    () => assert.ok(actualFiles.includes('2026-08-27/P1000002.RW2')));
  await context.test('a raw dated only by the jpeg it embeds is read',
    () => assert.ok(actualFiles.includes('2026-08-27/P1000003.RW2')));
  await context.test('AVCHD is picked up from outside DCIM',
    () => assert.ok(actualFiles.includes('2026-08-29/00000.MTS')));
  await context.test('a file that is not media is left where it was',
    () => assert.ok(fs.existsSync(path.join(dump, 'PRIVATE/AVCHD/BDMV/CLIPINF/00000.CPI'))));
  await context.test('operating system folders are never entered',
    () => assert.ok(fs.existsSync(path.join(dump, '.Spotlight-V100', 'junk.JPG'))));
  await context.test('two different photos sharing a file name go to numbered subfolders, oldest first', () => assert.ok(
    !filesAreIdentical(path.join(dump, '2026-08-27/01/P1000001.JPG'), path.join(dump, '2026-08-27/02/P1000001.JPG')),
  ));
  await context.test('a name that clashes with nothing stays directly in the day folder',
    () => assert.ok(fs.existsSync(path.join(dump, '2026-08-27/P1000001.RW2'))));
  await context.test('card folders emptied by the move are removed',
    () => assert.ok(!fs.existsSync(path.join(dump, 'DCIM'))));
  await context.test('a dry run says so and exits cleanly',
    () => assert.ok(/dry run/.test(dryRun.standardOutput) && dryRun.exitCode === EXIT_CODE.everythingPlaced));
  await context.test('a dry run predicts the same three days',
    () => assert.equal((dryRun.standardOutput.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length, 3));
  await context.test('a dry run without --move says it would copy',
    () => assert.match(dryRun.standardOutput, /11 to copy/));
  await context.test('all eleven files are moved and it exits cleanly', () => assert.ok(
    /11 moved/.test(sorted.standardOutput) && sorted.exitCode === EXIT_CODE.everythingPlaced,
    sorted.standardOutput + sorted.standardError,
  ));

  const secondRun = runCommand(['--move', dump]);
  await context.test('sorting the same folder twice changes nothing', () => assert.ok(
    /11 already in place/.test(secondRun.standardOutput) && secondRun.exitCode === EXIT_CODE.everythingPlaced,
    secondRun.standardOutput,
  ));
  await context.test('and adds no files', () => assert.deepEqual(visibleFilesUnder(dump), expectedFiles));
});

test('sorting two photos of one day that share a name', async (context) => {
  const dump = aTemporaryDirectory('same-name');
  const morning = path.join(dump, 'DCIM', '100_PANA');
  const evening = path.join(dump, 'DCIM', '101_PANA');
  writeFixtureFile(path.join(morning, 'A9999.RW2'), tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 10:00:00' }));
  writeFixtureFile(path.join(evening, 'A9999.RW2'), tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 22:00:00' }));

  const sorted = runCommand(['--move', dump]);
  const actualFiles = visibleFilesUnder(dump);
  await context.test('the 10:00 shot goes to 2026-09-01/01 and the 22:00 shot to 2026-09-01/02',
    () => assert.deepEqual(actualFiles, ['2026-09-01/01/A9999.RW2', '2026-09-01/02/A9999.RW2']));
  await context.test('and the split is reported on standard error',
    () => assert.match(sorted.standardError, /numbered subfolder/));

  const secondRun = runCommand(['--move', dump]);
  await context.test('sorting them again leaves both subfolders exactly as they are', () => assert.ok(
    /2 already in place/.test(secondRun.standardOutput)
    && JSON.stringify(visibleFilesUnder(dump)) === JSON.stringify(['2026-09-01/01/A9999.RW2', '2026-09-01/02/A9999.RW2']),
    secondRun.standardOutput,
  ));

  const identicalPair = aTemporaryDirectory('same-bytes');
  const sameRaw = tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 10:00:00' });
  writeFixtureFile(path.join(identicalPair, 'DCIM', '100_PANA', 'A9999.RW2'), sameRaw);
  writeFixtureFile(path.join(identicalPair, 'DCIM', '101_PANA', 'A9999.RW2'), sameRaw);
  runCommand(['--move', identicalPair]);
  await context.test('but two copies of the very same photo collapse instead of splitting',
    () => assert.deepEqual(visibleFilesUnder(identicalPair), ['2026-09-01/A9999.RW2']));
});

test('two card folders reusing the same file number', async (context) => {
  const cardDumpWith = (name, firstShot, secondShot) => {
    const dump = aTemporaryDirectory(name);
    const raw = (shotAt) => tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: shotAt });
    writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000001.RW2'), raw(firstShot));
    writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000001.JPG'), jpegFile(firstShot));
    writeFixtureFile(path.join(dump, 'DCIM', '102_PANA', 'P1000001.RW2'), raw(secondShot));
    writeFixtureFile(path.join(dump, 'DCIM', '102_PANA', 'P1000001.JPG'), jpegFile(secondShot));
    return dump;
  };

  const shotOnDifferentDays = cardDumpWith('different-days', '2026:05:27 14:00:00', '2026:05:30 09:00:00');
  runCommand(['--move', shotOnDifferentDays]);
  await context.test('one file number used on two different days needs no subfolders at all', () => assert.deepEqual(
    visibleFilesUnder(shotOnDifferentDays),
    [
      '2026-05-27/P1000001.JPG', '2026-05-27/P1000001.RW2',
      '2026-05-30/P1000001.JPG', '2026-05-30/P1000001.RW2',
    ],
  ));

  const shotOnOneDay = cardDumpWith('one-day', '2026:05:27 14:00:00', '2026:05:27 21:30:00');
  runCommand(['--move', shotOnOneDay]);
  await context.test('the same file number twice in one day splits into numbered subfolders, oldest first', () => assert.deepEqual(
    visibleFilesUnder(shotOnOneDay),
    [
      '2026-05-27/01/P1000001.JPG', '2026-05-27/01/P1000001.RW2',
      '2026-05-27/02/P1000001.JPG', '2026-05-27/02/P1000001.RW2',
    ],
  ));
  await context.test('and each shot keeps its raw and its jpeg in the same subfolder', () => assert.ok(
    fs.existsSync(path.join(shotOnOneDay, '2026-05-27/01/P1000001.RW2'))
    && fs.existsSync(path.join(shotOnOneDay, '2026-05-27/01/P1000001.JPG')),
  ));
});

test('nothing is written until the whole plan is settled', async (context) => {
  const dump = freshCardDump('plan-first');
  const beforeThePlan = JSON.stringify(filesUnder(dump));
  const plannedActions = JSON.parse(runCommand(['-n', '--json', dump]).standardOutput).actions;

  await context.test('planning writes nothing whatsoever',
    () => assert.equal(JSON.stringify(filesUnder(dump)), beforeThePlan));
  await context.test('the plan names a destination for every file it found',
    () => assert.ok(plannedActions.length === 11 && plannedActions.every((action) => action.target !== null)));

  runCommand(['--move', dump]);
  const destinationsThePlanNamed = new Set(plannedActions.map((action) => action.target));
  const destinationsMissing = [...destinationsThePlanNamed].filter((target) => !fs.existsSync(target));
  await context.test('every destination the plan named holds a file once the run is over',
    () => assert.deepEqual(destinationsMissing, []));

  const mediaLeftOnDisk = visibleFilesUnder(dump)
    .filter((relativePath) => !relativePath.endsWith('.CPI'))
    .map((relativePath) => path.join(dump, relativePath));
  const arrivalsThePlanDidNotName = mediaLeftOnDisk.filter((filePath) => !destinationsThePlanNamed.has(filePath));
  await context.test('and nothing is on disk that the plan did not name',
    () => assert.deepEqual(arrivalsThePlanDidNotName, []));
});

test('telling two photos apart by their bytes', async (context) => {
  const dump = aTemporaryDirectory('same-size');
  const shot = '2026:04:04 10:00:00';
  const onePhoto = jpegFilePaddedTo(shot, 900);
  const another = Buffer.from(onePhoto);
  another[another.length - 1] = 0xAB;

  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'SAME.JPG'), onePhoto);
  writeFixtureFile(path.join(dump, 'DCIM', '101_PANA', 'SAME.JPG'), another);
  runCommand(['--move', dump]);

  await context.test('two photos of identical size but different bytes are kept apart, not collapsed',
    () => assert.deepEqual(visibleFilesUnder(dump), ['2026-04-04/01/SAME.JPG', '2026-04-04/02/SAME.JPG']));

  const fresh = aTemporaryDirectory('incoming');
  const standingLibrary = aPathNotYetTaken('standing-library');
  writeFixtureFile(path.join(standingLibrary, '2026-04-04', 'SAME.JPG'), jpegFilePaddedTo(shot, 1200));
  writeFixtureFile(path.join(fresh, 'DCIM', 'SAME.JPG'), onePhoto);
  runCommand(['--move', '-s', fresh, '-d', standingLibrary]);
  await context.test('a file already in the library under that name, but a different size, is a clash not a duplicate',
    () => assert.deepEqual(filesUnder(standingLibrary), ['2026-04-04/01/SAME.JPG', '2026-04-04/SAME.JPG']));

  const twins = aTemporaryDirectory('twins');
  writeFixtureFile(path.join(twins, 'DCIM', '100_PANA', 'SAME.JPG'), onePhoto);
  writeFixtureFile(path.join(twins, 'DCIM', '101_PANA', 'SAME.JPG'), Buffer.from(onePhoto));
  runCommand(['--move', twins]);
  await context.test('while two copies of one photo collapse to a single file',
    () => assert.deepEqual(visibleFilesUnder(twins), ['2026-04-04/SAME.JPG']));
});

test('recognising a folder it already sorted into', async (context) => {
  const dump = aTemporaryDirectory('resort');
  const shot = '2026:04:07 13:00:00';
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'CLASH.JPG'), jpegFilePaddedTo(shot, 800));
  writeFixtureFile(path.join(dump, 'DCIM', '101_PANA', 'CLASH.JPG'), jpegFilePaddedTo(shot, 900));
  runCommand(['--move', dump]);

  const afterFirstRun = visibleFilesUnder(dump);
  await context.test('a clash lands in two numbered subfolders',
    () => assert.deepEqual(afterFirstRun, ['2026-04-07/01/CLASH.JPG', '2026-04-07/02/CLASH.JPG']));

  const secondRun = runCommand(['--move', dump]);
  await context.test('and sorting again recognises those numbered subfolders rather than nesting deeper', () => assert.ok(
    /2 already in place/.test(secondRun.standardOutput)
    && JSON.stringify(visibleFilesUnder(dump)) === JSON.stringify(afterFirstRun),
    secondRun.standardOutput + JSON.stringify(visibleFilesUnder(dump)),
  ));
});

test('the other ways to run it', async (context) => {
  const dump = freshCardDump('other-ways');
  const library = aPathNotYetTaken('library');
  const copied = runCommand(['--source', dump, '--dest', library, '--layout', '%Y/%F']);

  await context.test('--dest with --layout builds a library elsewhere', () => assert.ok(
    filesUnder(library).includes('2026/2026-08-27/P1000002.JPG') && copied.exitCode === EXIT_CODE.everythingPlaced,
    copied.standardOutput + copied.standardError,
  ));
  await context.test('copying is the default, so the originals stay where they were',
    () => assert.ok(fs.existsSync(path.join(dump, 'DCIM/100_PANA/P1000001.JPG'))));
  await context.test('and the summary says copied, not moved', () => assert.match(copied.standardOutput, /11 copied/));

  const viaShortFlags = aPathNotYetTaken('via-short-flags');
  const shortFlagRun = runCommand(['-s', dump, '-d', viaShortFlags]);
  await context.test('-s and -d name the source and the destination unambiguously', () => assert.ok(
    filesUnder(viaShortFlags).includes('2026-08-27/P1000002.JPG')
    && shortFlagRun.exitCode === EXIT_CODE.everythingPlaced,
    shortFlagRun.standardOutput + shortFlagRun.standardError,
  ));

  const alreadyCopied = freshCardDump('already-copied');
  const copiedLibrary = aPathNotYetTaken('copied-library');
  runCommand(['-s', alreadyCopied, '-d', copiedLibrary]);

  const predictedDuplicates = runCommand(['-n', '-s', alreadyCopied, '-d', copiedLibrary]);
  await context.test('a dry run over an already-built library predicts skipping every duplicate',
    () => assert.match(predictedDuplicates.standardOutput, /11 duplicates to skip/));

  const droppingDuplicates = runCommand(['-v', '-m', '-s', alreadyCopied, '-d', copiedLibrary]);
  await context.test('moving over an already-built library drops the redundant originals',
    () => assert.match(droppingDuplicates.standardOutput, /11 duplicates dropped/));
  await context.test('and --verbose names each one it dropped', () => assert.equal(
    droppingDuplicates.standardOutput.split('\n').filter((line) => /-> dropped, already at /.test(line)).length,
    11,
  ));
  await context.test('leaving the source empty of media',
    () => assert.ok(!fs.existsSync(path.join(alreadyCopied, 'DCIM'))));

  const movedAway = freshCardDump('moved-away');
  const movedLibrary = aPathNotYetTaken('moved-library');
  runCommand(['-m', '-s', movedAway, '-d', movedLibrary]);
  await context.test('--move empties the source and tidies it up', () => assert.ok(
    !fs.existsSync(path.join(movedAway, 'DCIM'))
    && filesUnder(movedLibrary).includes('2026-08-27/P1000002.JPG'),
  ));

  const verboseDump = freshCardDump('verbose');
  const verboseRun = runCommand(['-v', '-m', verboseDump]);
  const linesNamingAMovedFile = verboseRun.standardOutput.split('\n').filter((line) => line.includes(' -> '));
  await context.test('--verbose prints a line for each of the eleven files it places',
    () => assert.equal(linesNamingAMovedFile.length, 11));
  await context.test('and those lines name the source and the destination', () => assert.ok(
    linesNamingAMovedFile.every((line) => /DCIM[\\/]|STREAM[\\/]/.test(line)),
    linesNamingAMovedFile.slice(0, 3).join('\n'),
  ));

  const asJson = runCommand(['-n', '--json', dump]);
  const parsed = JSON.parse(asJson.standardOutput);
  await context.test('--json describes every file found',
    () => assert.ok(parsed.summary.found === 11 && parsed.actions.length === 11, asJson.standardOutput.slice(0, 200)));
  await context.test('--json names which clock each date came from', () => assert.ok(
    new Set(parsed.actions.map((action) => action.dateFrom)).size >= 3,
    [...new Set(parsed.actions.map((action) => action.dateFrom))].join(', '),
  ));
});
