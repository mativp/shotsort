#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildCardDump, writeFixtureFile, tiffFile, jpegFile, bigEndianTiffFile,
  PANASONIC_RAW_SIGNATURE, TIFF_STANDARD_SIGNATURE,
  OLYMPUS_RAW_SIGNATURE, OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES,
  jpegFileWithARestartMarkerFirst, jpegFileBuriedUnderManySegments, movieFileWhoseMovieBoxRunsToTheEnd,
} from './fixtures.mjs';
import { readTimestampFromFile } from '../src/date.mjs';
import { PLACEMENT, FILESYSTEM_DATE_USE } from '../src/sort.mjs';
import { DATE_SOURCE } from '../src/date.mjs';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const COMMAND = path.join(testDirectory, '..', 'bin', 'lumix-sort.mjs');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'lumix-sort-'));

const EXIT_EVERYTHING_PLACED = 0;
const EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND = 1;
const EXIT_BAD_COMMAND_LINE = 2;

let failedCheckCount = 0;

function expect(whatShouldBeTrue, itWasTrue, detailWhenItWasNot = '') {
  console.log(`${itWasTrue ? '  ok  ' : '  FAIL'} ${whatShouldBeTrue}`);
  if (itWasTrue) return;
  failedCheckCount++;
  if (detailWhenItWasNot) {
    console.log(`        ${String(detailWhenItWasNot).trim().replace(/\n/g, '\n        ')}`);
  }
}

function runCommand(commandArguments, spawnOptions = {}) {
  const result = spawnSync('node', [COMMAND, ...commandArguments], { encoding: 'utf8', ...spawnOptions });
  return { exitCode: result.status, standardOutput: result.stdout ?? '', standardError: result.stderr ?? '' };
}

function filesUnder(directory) {
  const walk = (currentDirectory, pathSoFar) => fs.readdirSync(currentDirectory, { withFileTypes: true })
    .flatMap((directoryEntry) => (directoryEntry.isDirectory()
      ? walk(path.join(currentDirectory, directoryEntry.name), `${pathSoFar}${directoryEntry.name}/`)
      : [`${pathSoFar}${directoryEntry.name}`]));
  return walk(directory, '').sort();
}

const visibleFilesUnder = (directory) => filesUnder(directory).filter((filePath) => !filePath.startsWith('.'));
const freshCardDump = (name, options) => buildCardDump(fs.mkdtempSync(path.join(temporaryDirectory, `${name}-`)), options);
const filesAreIdentical = (firstPath, secondPath) => fs.readFileSync(firstPath).equals(fs.readFileSync(secondPath));
const folderChosenFor = (jsonOutput, fileName) =>
  JSON.parse(jsonOutput).actions.find((action) => action.src.endsWith(fileName)).folder;

function sortingACardDumpInPlace() {
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

  expect('day folders land at the top of the folder given',
    JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), JSON.stringify(actualFiles, null, 1));
  expect('a raw recording no date follows the jpeg of the same shot',
    actualFiles.includes('2026-08-27/P1000002.RW2'));
  expect('a raw dated only by the jpeg it embeds is read',
    actualFiles.includes('2026-08-27/P1000003.RW2'));
  expect('AVCHD is picked up from outside DCIM',
    actualFiles.includes('2026-08-29/00000.MTS'));
  expect('a file that is not media is left where it was',
    fs.existsSync(path.join(dump, 'PRIVATE/AVCHD/BDMV/CLIPINF/00000.CPI')));
  expect('operating system folders are never entered',
    fs.existsSync(path.join(dump, '.Spotlight-V100', 'junk.JPG')));
  expect('two different photos sharing a file name go to numbered subfolders, oldest first',
    !filesAreIdentical(path.join(dump, '2026-08-27/01/P1000001.JPG'), path.join(dump, '2026-08-27/02/P1000001.JPG')));
  expect('a name that clashes with nothing stays directly in the day folder',
    fs.existsSync(path.join(dump, '2026-08-27/P1000001.RW2')));
  expect('card folders emptied by the move are removed',
    !fs.existsSync(path.join(dump, 'DCIM')));
  expect('a dry run says so and exits cleanly',
    /dry run/.test(dryRun.standardOutput) && dryRun.exitCode === EXIT_EVERYTHING_PLACED);
  expect('a dry run predicts the same three days',
    (dryRun.standardOutput.match(/^\d{4}-\d{2}-\d{2}/gm) ?? []).length === 3, dryRun.standardOutput);
  expect('a dry run without --move says it would copy',
    /11 to copy/.test(dryRun.standardOutput), dryRun.standardOutput);
  expect('all eleven files are moved and it exits cleanly',
    /11 moved/.test(sorted.standardOutput) && sorted.exitCode === EXIT_EVERYTHING_PLACED,
    sorted.standardOutput + sorted.standardError);

  const secondRun = runCommand(['--move', dump]);
  expect('sorting the same folder twice changes nothing',
    /11 already in place/.test(secondRun.standardOutput) && secondRun.exitCode === EXIT_EVERYTHING_PLACED,
    secondRun.standardOutput);
  expect('and adds no files',
    JSON.stringify(visibleFilesUnder(dump)) === JSON.stringify(expectedFiles));
}

function twoPhotosOnOneDaySharingAName() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'same-name-'));
  const morning = path.join(dump, 'DCIM', '100_PANA');
  const evening = path.join(dump, 'DCIM', '101_PANA');
  writeFixtureFile(path.join(morning, 'A9999.RW2'), tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 10:00:00' }));
  writeFixtureFile(path.join(evening, 'A9999.RW2'), tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 22:00:00' }));

  const sorted = runCommand(['--move', dump]);
  const actualFiles = visibleFilesUnder(dump);
  expect('the 10:00 shot goes to 2026-09-01/01 and the 22:00 shot to 2026-09-01/02',
    JSON.stringify(actualFiles) === JSON.stringify(['2026-09-01/01/A9999.RW2', '2026-09-01/02/A9999.RW2']),
    JSON.stringify(actualFiles));
  expect('and the split is reported on standard error',
    /numbered subfolder/.test(sorted.standardError), sorted.standardError);

  const secondRun = runCommand(['--move', dump]);
  expect('sorting them again leaves both subfolders exactly as they are',
    /2 already in place/.test(secondRun.standardOutput)
    && JSON.stringify(visibleFilesUnder(dump)) === JSON.stringify(['2026-09-01/01/A9999.RW2', '2026-09-01/02/A9999.RW2']),
    secondRun.standardOutput);

  const identicalPair = fs.mkdtempSync(path.join(temporaryDirectory, 'same-bytes-'));
  const sameRaw = tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:09:01 10:00:00' });
  writeFixtureFile(path.join(identicalPair, 'DCIM', '100_PANA', 'A9999.RW2'), sameRaw);
  writeFixtureFile(path.join(identicalPair, 'DCIM', '101_PANA', 'A9999.RW2'), sameRaw);
  runCommand(['--move', identicalPair]);
  expect('but two copies of the very same photo collapse instead of splitting',
    JSON.stringify(visibleFilesUnder(identicalPair)) === JSON.stringify(['2026-09-01/A9999.RW2']),
    JSON.stringify(visibleFilesUnder(identicalPair)));
}

function twoCardFoldersReusingTheSameFileNumber() {
  const cardDumpWith = (name, firstShot, secondShot) => {
    const dump = fs.mkdtempSync(path.join(temporaryDirectory, `${name}-`));
    const raw = (shotAt) => tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: shotAt });
    writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000001.RW2'), raw(firstShot));
    writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000001.JPG'), jpegFile(firstShot));
    writeFixtureFile(path.join(dump, 'DCIM', '102_PANA', 'P1000001.RW2'), raw(secondShot));
    writeFixtureFile(path.join(dump, 'DCIM', '102_PANA', 'P1000001.JPG'), jpegFile(secondShot));
    return dump;
  };

  const shotOnDifferentDays = cardDumpWith('different-days', '2026:05:27 14:00:00', '2026:05:30 09:00:00');
  runCommand(['--move', shotOnDifferentDays]);
  expect('one file number used on two different days needs no subfolders at all',
    JSON.stringify(visibleFilesUnder(shotOnDifferentDays)) === JSON.stringify([
      '2026-05-27/P1000001.JPG', '2026-05-27/P1000001.RW2',
      '2026-05-30/P1000001.JPG', '2026-05-30/P1000001.RW2',
    ]), JSON.stringify(visibleFilesUnder(shotOnDifferentDays), null, 1));

  const shotOnOneDay = cardDumpWith('one-day', '2026:05:27 14:00:00', '2026:05:27 21:30:00');
  runCommand(['--move', shotOnOneDay]);
  expect('the same file number twice in one day splits into numbered subfolders, oldest first',
    JSON.stringify(visibleFilesUnder(shotOnOneDay)) === JSON.stringify([
      '2026-05-27/01/P1000001.JPG', '2026-05-27/01/P1000001.RW2',
      '2026-05-27/02/P1000001.JPG', '2026-05-27/02/P1000001.RW2',
    ]), JSON.stringify(visibleFilesUnder(shotOnOneDay), null, 1));
  expect('and each shot keeps its raw and its jpeg in the same subfolder',
    fs.existsSync(path.join(shotOnOneDay, '2026-05-27/01/P1000001.RW2'))
    && fs.existsSync(path.join(shotOnOneDay, '2026-05-27/01/P1000001.JPG')));
}

function nothingIsWrittenUntilTheWholePlanIsSettled() {
  const dump = freshCardDump('plan-first');
  const beforeThePlan = JSON.stringify(filesUnder(dump));
  const plannedActions = JSON.parse(runCommand(['-n', '--json', dump]).standardOutput).actions;

  expect('planning writes nothing whatsoever',
    JSON.stringify(filesUnder(dump)) === beforeThePlan);
  expect('the plan names a destination for every file it found',
    plannedActions.length === 11 && plannedActions.every((action) => action.target !== null));

  runCommand(['--move', dump]);
  const destinationsThePlanNamed = new Set(plannedActions.map((action) => action.target));
  const destinationsMissing = [...destinationsThePlanNamed].filter((target) => !fs.existsSync(target));
  expect('every destination the plan named holds a file once the run is over',
    destinationsMissing.length === 0, destinationsMissing.join('\n'));

  const mediaLeftOnDisk = visibleFilesUnder(dump)
    .filter((relativePath) => !relativePath.endsWith('.CPI'))
    .map((relativePath) => path.join(dump, relativePath));
  const arrivalsThePlanDidNotName = mediaLeftOnDisk.filter((filePath) => !destinationsThePlanNamed.has(filePath));
  expect('and nothing is on disk that the plan did not name',
    arrivalsThePlanDidNotName.length === 0, arrivalsThePlanDidNotName.join('\n'));
}

function containersThatAreLegalButUnusual() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'unusual-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return readTimestampFromFile(filePath, fs.statSync(filePath).size);
  };

  expect('a jpeg whose first marker carries no length is still read',
    dateOf('restart.jpg', jpegFileWithARestartMarkerFirst('2026:07:04 08:00:00'))?.timestamp === '2026-07-04 08:00:00');
  expect('a movie box declaring that it runs to the end of the file is still read',
    dateOf('to-the-end.mp4', movieFileWhoseMovieBoxRunsToTheEnd('2026-07-04 10:00:00'))?.timestamp === '2026-07-04 10:00:00');
  expect('a jpeg hiding its exif behind more segments than are worth walking gives up rather than hanging',
    dateOf('buried.jpg', jpegFileBuriedUnderManySegments('2026:07:04 09:00:00')) === null);

  const unreadable = path.join(dump, 'unreadable.jpg');
  writeFixtureFile(unreadable, jpegFile('2026:07:04 11:00:00'));
  fs.chmodSync(unreadable, 0o000);
  expect('a file that cannot be opened reports no date rather than throwing',
    readTimestampFromFile(unreadable, fs.statSync(unreadable).size) === null);
  fs.chmodSync(unreadable, 0o644);
}

function theRawEveryMakerWrites() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'brands-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return readTimestampFromFile(filePath, fs.statSync(filePath).size)?.timestamp ?? null;
  };
  const ordinaryTiff = (dateTimeOriginal) => tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal });
  const olympusRaw = (signature, dateTimeOriginal) => tiffFile({ signature, dateTimeOriginal });

  const rawFromEachMaker = [
    ['a Canon CR2', 'IMG_0001.CR2', ordinaryTiff('2026:08:27 09:00:00'), '2026-08-27 09:00:00'],
    ['a Nikon NEF', 'DSC_0001.NEF', ordinaryTiff('2026:08:27 09:01:00'), '2026-08-27 09:01:00'],
    ['a Nikon NRW', 'DSC_0002.NRW', ordinaryTiff('2026:08:27 09:02:00'), '2026-08-27 09:02:00'],
    ['a Sony ARW', 'DSC00001.ARW', ordinaryTiff('2026:08:27 09:03:00'), '2026-08-27 09:03:00'],
    ['a Pentax PEF', 'IMGP0001.PEF', ordinaryTiff('2026:08:27 09:04:00'), '2026-08-27 09:04:00'],
    ['an Olympus ORF', 'P8270001.ORF', olympusRaw(OLYMPUS_RAW_SIGNATURE, '2026:08:27 09:05:00'), '2026-08-27 09:05:00'],
    ['an OM System ORF', 'P8270002.ORF', olympusRaw(OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, '2026:08:27 09:06:00'), '2026-08-27 09:06:00'],
  ];
  for (const [whatItIs, fileName, contents, whenItWasShot] of rawFromEachMaker) {
    expect(`${whatItIs} is read for the date the camera wrote in it`, dateOf(fileName, contents) === whenItWasShot);
  }

  expect('a raw written most significant byte first is read the same as one written the other way round',
    dateOf('DSC_0003.NEF', bigEndianTiffFile('2026:08:27 09:07:00')) === '2026-08-27 09:07:00');
  expect('a file whose signature belongs to no camera is left alone rather than guessed at',
    dateOf('spreadsheet.tif', tiffFile({ signature: 0x1234, dateTimeOriginal: '2026:08:27 09:08:00' })) === null);
}

function aCardFromAnotherMakerSortsToo() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'other-maker-'));
  const canonFolder = path.join(dump, 'DCIM', '100CANON');
  const olympusFolder = path.join(dump, 'DCIM', '100OLYMP');
  const shotTogether = '2026:08:27 09:07:01';

  writeFixtureFile(path.join(canonFolder, 'IMG_0001.CR2'),
    tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal: shotTogether }));
  writeFixtureFile(path.join(canonFolder, 'IMG_0001.JPG'), jpegFile(shotTogether));
  writeFixtureFile(path.join(canonFolder, 'MVI_0002.AVI'), Buffer.alloc(512, 4));
  writeFixtureFile(path.join(canonFolder, 'MVI_0002.THM'), jpegFile('2026:08:28 11:30:00'));
  writeFixtureFile(path.join(olympusFolder, 'P8270003.ORF'),
    tiffFile({ signature: OLYMPUS_RAW_SIGNATURE, dateTimeOriginal: '2026:08:27 18:00:00' }));

  const plan = runCommand(['-n', '--json', dump]);
  expect('an AVI that records no date of its own takes it from the THM sitting beside it',
    folderChosenFor(plan.standardOutput, 'MVI_0002.AVI') === '2026-08-28'
    && JSON.parse(plan.standardOutput).actions
      .find((action) => action.src.endsWith('MVI_0002.AVI')).dateFrom === DATE_SOURCE.siblingFile,
    plan.standardOutput);

  const sorted = runCommand(['--move', dump]);
  expect('a card holding Canon and Olympus files sorts by the dates inside them, and exits 0',
    sorted.exitCode === EXIT_EVERYTHING_PLACED, sorted.standardOutput + sorted.standardError);
  expect('and every one of them lands in the day its own camera recorded',
    visibleFilesUnder(dump).join('\n') === [
      '2026-08-27/IMG_0001.CR2',
      '2026-08-27/IMG_0001.JPG',
      '2026-08-27/P8270003.ORF',
      '2026-08-28/MVI_0002.AVI',
      '2026-08-28/MVI_0002.THM',
    ].join('\n'),
    visibleFilesUnder(dump).join('\n'));
}

function whenTheFilesystemRefuses() {
  const dump = freshCardDump('unwritable-destination');
  const destination = path.join(temporaryDirectory, 'unwritable-library');
  fs.mkdirSync(destination);
  fs.chmodSync(destination, 0o500);

  const refused = runCommand(['-s', dump, '-d', destination]);
  expect('a destination that cannot be written to fails loudly and exits 1',
    refused.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && /failed/.test(refused.standardOutput)
    && /EACCES|EPERM/.test(refused.standardError),
    refused.standardOutput + refused.standardError);
  expect('and leaves every original where it was',
    fs.existsSync(path.join(dump, 'DCIM/100_PANA/P1000001.JPG')));

  fs.chmodSync(destination, 0o700);
}

function theCameraClockIsTheOnlyClock() {
  const dump = freshCardDump('camera-clock');
  const folderIn = (timezone, fileName) => folderChosenFor(
    runCommand(['-n', '--json', dump], { env: { ...process.env, TZ: timezone } }).standardOutput,
    fileName,
  );
  const filesRecordingTheirOwnDate = ['P1000005.MP4', 'P1000007.MOV', 'P1000001.JPG', 'P1000003.RW2'];

  expect('stills and video alike ignore the timezone of the computer sorting them',
    filesRecordingTheirOwnDate.every((fileName) => folderIn('America/New_York', fileName) === folderIn('Pacific/Auckland', fileName)),
    filesRecordingTheirOwnDate.map((fileName) => `${fileName}: ${folderIn('America/New_York', fileName)} vs ${folderIn('Pacific/Auckland', fileName)}`).join('\n'));
  expect('a clip recorded at 00:20 stays on the day it was recorded',
    folderIn('Pacific/Auckland', 'P1000005.MP4') === '2026-08-28');

  const nightShoot = runCommand(['-n', '--day-start', '4', dump]);
  expect('--day-start folds a 00:20 clip into the day the shoot began',
    /2026-08-28.* 1 file/.test(nightShoot.standardOutput) && /2026-08-27.* 8 files/.test(nightShoot.standardOutput),
    nightShoot.standardOutput);
}

function aCardCopiedWithoutPreservingTimes() {
  const dump = freshCardDump('copied-with-plain-cp', { everyFileStampedAt: '2026-09-08T17:00:00' });
  const sorted = runCommand(['--move', dump]);
  const actualFiles = visibleFilesUnder(dump);

  expect('files recording no date of their own go to undated/ when their filesystem date is a copy artefact',
    actualFiles.includes('undated/P1000004.HSP') && actualFiles.includes('undated/00000.MTS'),
    JSON.stringify(actualFiles, null, 1));
  expect('every other file still sorts by the date it records itself',
    actualFiles.includes('2026-08-27/P1000002.JPG') && actualFiles.includes('2026-08-28/P1000005.MP4'));
  expect('and the reason is explained on standard error',
    /copy rather than a shooting time/.test(sorted.standardError), sorted.standardError);

  const forced = freshCardDump('forced', { everyFileStampedAt: '2026-09-08T17:00:00' });
  runCommand(['--move', '--use-filesystem-date', forced]);
  expect('--use-filesystem-date takes those dates as they are',
    visibleFilesUnder(forced).some((filePath) => filePath.startsWith('2026-09-08/')));

  const refused = freshCardDump('refused');
  runCommand(['--move', '--ignore-filesystem-date', refused]);
  expect('--ignore-filesystem-date sends every file recording no date to undated/',
    visibleFilesUnder(refused).includes('undated/00000.MTS'));
}

function theOtherWaysToRunIt() {
  const dump = freshCardDump('other-ways');
  const library = path.join(temporaryDirectory, 'library');
  const copied = runCommand(['--source', dump, '--dest', library, '--layout', '%Y/%F']);

  expect('--dest with --layout builds a library elsewhere',
    filesUnder(library).includes('2026/2026-08-27/P1000002.JPG') && copied.exitCode === EXIT_EVERYTHING_PLACED,
    copied.standardOutput + copied.standardError);
  expect('copying is the default, so the originals stay where they were',
    fs.existsSync(path.join(dump, 'DCIM/100_PANA/P1000001.JPG')));
  expect('and the summary says copied, not moved',
    /11 copied/.test(copied.standardOutput), copied.standardOutput);

  const viaShortFlags = path.join(temporaryDirectory, 'via-short-flags');
  const shortFlagRun = runCommand(['-s', dump, '-d', viaShortFlags]);
  expect('-s and -d name the source and the destination unambiguously',
    filesUnder(viaShortFlags).includes('2026-08-27/P1000002.JPG')
    && shortFlagRun.exitCode === EXIT_EVERYTHING_PLACED,
    shortFlagRun.standardOutput + shortFlagRun.standardError);

  const alreadyCopied = freshCardDump('already-copied');
  const copiedLibrary = path.join(temporaryDirectory, 'copied-library');
  runCommand(['-s', alreadyCopied, '-d', copiedLibrary]);

  const predictedDuplicates = runCommand(['-n', '-s', alreadyCopied, '-d', copiedLibrary]);
  expect('a dry run over an already-built library predicts skipping every duplicate',
    /11 duplicates to skip/.test(predictedDuplicates.standardOutput), predictedDuplicates.standardOutput);

  const droppingDuplicates = runCommand(['-v', '-m', '-s', alreadyCopied, '-d', copiedLibrary]);
  expect('moving over an already-built library drops the redundant originals',
    /11 duplicates dropped/.test(droppingDuplicates.standardOutput), droppingDuplicates.standardOutput);
  expect('and --verbose names each one it dropped',
    droppingDuplicates.standardOutput.split('\n').filter((line) => /-> dropped, already at /.test(line)).length === 11,
    droppingDuplicates.standardOutput.slice(0, 300));
  expect('leaving the source empty of media',
    !fs.existsSync(path.join(alreadyCopied, 'DCIM')));

  const movedAway = freshCardDump('moved-away');
  const movedLibrary = path.join(temporaryDirectory, 'moved-library');
  runCommand(['-m', '-s', movedAway, '-d', movedLibrary]);
  expect('--move empties the source and tidies it up',
    !fs.existsSync(path.join(movedAway, 'DCIM'))
    && filesUnder(movedLibrary).includes('2026-08-27/P1000002.JPG'));

  const verboseDump = freshCardDump('verbose');
  const verboseRun = runCommand(['-v', '-m', verboseDump]);
  const linesNamingAMovedFile = verboseRun.standardOutput.split('\n').filter((line) => line.includes(' -> '));
  expect('--verbose prints a line for each of the eleven files it places',
    linesNamingAMovedFile.length === 11, verboseRun.standardOutput);
  expect('and those lines name the source and the destination',
    linesNamingAMovedFile.every((line) => line.includes('DCIM/') || line.includes('STREAM/')),
    linesNamingAMovedFile.slice(0, 3).join('\n'));

  const asJson = runCommand(['-n', '--json', dump]);
  const parsed = JSON.parse(asJson.standardOutput);
  expect('--json describes every file found',
    parsed.summary.found === 11 && parsed.actions.length === 11, asJson.standardOutput.slice(0, 200));
  expect('--json names which clock each date came from',
    new Set(parsed.actions.map((action) => action.dateFrom)).size >= 3,
    [...new Set(parsed.actions.map((action) => action.dateFrom))].join(', '));

}

function theCommandLineItself() {
  const emptyFolder = fs.mkdtempSync(path.join(temporaryDirectory, 'empty-'));

  const refusedFor = (commandArguments) => {
    const attempt = runCommand(commandArguments);
    return attempt.exitCode === EXIT_BAD_COMMAND_LINE ? attempt.standardError : `exited ${attempt.exitCode}`;
  };

  expect('finding nothing exits 1, as grep does',
    runCommand([emptyFolder]).exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND);
  expect('an unrecognised long option is refused by name',
    /unrecognised option '--nope'/.test(refusedFor(['--nope'])), refusedFor(['--nope']));
  expect('an unrecognised short option is refused by name',
    /unrecognised option '-Z'/.test(refusedFor(['-Z'])), refusedFor(['-Z']));
  expect('an option missing its value says which option',
    /option '--dest' needs a value/.test(refusedFor(['--dest'])), refusedFor(['--dest']));
  expect('a --day-start outside 0-12 says the range',
    /--day-start must be an hour from 0 to 12/.test(refusedFor(['--day-start', '99', emptyFolder])),
    refusedFor(['--day-start', '99', emptyFolder]));
  expect('an absolute --layout is refused as such',
    /--layout must be a relative folder name/.test(refusedFor(['--layout', '/etc/%F', emptyFolder])),
    refusedFor(['--layout', '/etc/%F', emptyFolder]));
  expect('a --layout holding no date escape is refused as such',
    /--layout must be a relative folder name/.test(refusedFor(['--layout', 'photos', emptyFolder])),
    refusedFor(['--layout', 'photos', emptyFolder]));
  expect('the -0 that used to take a file list on standard input is now just an unknown option',
    /unrecognised option '-0'/.test(refusedFor(['-0'])), refusedFor(['-0']));
  expect('--verbose together with --quiet is refused for contradicting, not for anything else',
    /--verbose and --quiet contradict each other/.test(refusedFor(['--verbose', '--quiet', emptyFolder])),
    refusedFor(['--verbose', '--quiet', emptyFolder]));
  expect('giving options but naming no folder says so',
    /name the folder to sort/.test(refusedFor(['-n'])), refusedFor(['-n']));

  const versionFromManifest = JSON.parse(
    fs.readFileSync(path.join(testDirectory, '..', 'package.json'), 'utf8')).version;
  for (const flag of ['-V', '--version']) {
    const printed = runCommand([flag]);
    expect(`${flag} prints the version from the manifest and exits 0`,
      printed.standardOutput.trim() === versionFromManifest && printed.exitCode === EXIT_EVERYTHING_PLACED,
      `${printed.standardOutput.trim()} vs ${versionFromManifest}`);
  }
  expect('-h prints the same usage as --help',
    runCommand(['-h']).standardOutput === runCommand(['--help']).standardOutput
    && runCommand(['-h']).exitCode === EXIT_EVERYTHING_PLACED);

  const afterTheTerminator = freshCardDump('after-terminator');
  const terminated = runCommand(['-n', '--', afterTheTerminator]);
  expect('a -- argument ends option parsing and the rest is a folder',
    terminated.exitCode === EXIT_EVERYTHING_PLACED && /11 to copy/.test(terminated.standardOutput),
    terminated.standardOutput + terminated.standardError);

  const throughAPipe = spawnSync('sh', ['-c', `node ${JSON.stringify(COMMAND)} --help | head -3`], { encoding: 'utf8' });
  expect('closing the pipe early is not an error, as with any unix tool',
    throughAPipe.status === 0 && throughAPipe.stderr === '',
    `status ${throughAPipe.status}: ${throughAPipe.stderr}`);

  const cardDumpItShouldNotTouch = freshCardDump('never-touched');
  const bareInvocation = runCommand([], { cwd: cardDumpItShouldNotTouch });
  const askedForHelp = runCommand(['--help']);

  expect('running it with no arguments prints the usage on standard output',
    bareInvocation.standardOutput.startsWith('Usage: lumix-sort') && bareInvocation.standardError === '',
    bareInvocation.standardOutput.slice(0, 120) + bareInvocation.standardError);
  expect('that usage lists the options and worked examples',
    (bareInvocation.standardOutput.match(/^ {2,6}-/gm) ?? []).length >= 9
    && bareInvocation.standardOutput.includes('Examples:')
    && bareInvocation.standardOutput.includes('Exit status:'));
  expect('running it with no arguments exits 2, having been asked to do nothing',
    bareInvocation.exitCode === EXIT_BAD_COMMAND_LINE, String(bareInvocation.exitCode));
  expect('--help prints exactly the same text but exits 0, having been asked for it',
    askedForHelp.standardOutput === bareInvocation.standardOutput
    && askedForHelp.exitCode === EXIT_EVERYTHING_PLACED);
  expect('and sorts nothing in the folder it was run from',
    fs.existsSync(path.join(cardDumpItShouldNotTouch, 'DCIM/100_PANA/P1000001.JPG')));
  expect('options without a folder to sort are refused',
    runCommand(['-n'], { cwd: cardDumpItShouldNotTouch }).exitCode === EXIT_BAD_COMMAND_LINE);
  expect('the current folder still sorts when it is named',
    runCommand(['-n', '.'], { cwd: cardDumpItShouldNotTouch }).exitCode === EXIT_EVERYTHING_PLACED);

  const missingFolder = runCommand(['/nope/nowhere']);
  expect('a folder that does not exist is reported rather than thrown',
    missingFolder.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND && /ENOENT/.test(missingFolder.standardError),
    missingFolder.standardError);
}

function everyEnumMemberTheCodeRefersToExists() {
  const enumsByName = { PLACEMENT, FILESYSTEM_DATE_USE, DATE_SOURCE };
  const projectRoot = path.join(testDirectory, '..');
  const sourceFiles = ['bin/lumix-sort.mjs', 'src/sort.mjs', 'src/date.mjs'];
  const referenceToAnEnumMember = /\b(PLACEMENT|FILESYSTEM_DATE_USE|DATE_SOURCE)\.([A-Za-z][A-Za-z0-9]*)/g;
  const referencesThatResolveToNothing = [];

  for (const relativePath of sourceFiles) {
    const sourceText = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    for (const [, enumName, memberName] of sourceText.matchAll(referenceToAnEnumMember)) {
      if (enumsByName[enumName][memberName] === undefined) {
        referencesThatResolveToNothing.push(`${relativePath}: ${enumName}.${memberName}`);
      }
    }
  }
  expect('every enum member the code refers to actually exists',
    referencesThatResolveToNothing.length === 0, referencesThatResolveToNothing.join('\n'));
}

function theDocumentationSaysTheSameAsTheProgram() {
  const programSource = fs.readFileSync(COMMAND, 'utf8');
  const longOptions = [...programSource.matchAll(/optionName === '(--[a-z-]+)'/g)].map(([, option]) => option);
  const shortOptions = [...programSource.matchAll(/letter === '([a-zA-Z0-9])'/g)].map(([, letter]) => `-${letter}`);
  const everyOption = [...new Set([...longOptions, ...shortOptions])];

  const projectRoot = path.join(testDirectory, '..');
  const manualPageAsPlainText = fs.readFileSync(path.join(projectRoot, 'man', 'lumix-sort.1'), 'utf8')
    .replace(/\\f[IBRP]/g, '')
    .replace(/\\\(lq|\\\(rq/g, '"')
    .replace(/\\-/g, '-')
    .replace(/\\&/g, '')
    .replace(/^\.[A-Za-z]+ ?/gm, '')
    .replace(/"/g, ' ')
    .replace(/[ \t]+/g, ' ');
  const surfaces = [
    ['--help', runCommand(['--help']).standardOutput],
    ['the man page', manualPageAsPlainText],
    ['the README', fs.readFileSync(path.join(projectRoot, 'README.md'), 'utf8')],
  ];

  for (const [surfaceName, text] of surfaces) {
    const undocumented = everyOption.filter((option) => {
      const optionOnItsOwn = new RegExp(`(?<![-\\w])${option}(?![\\w-])`);
      return !optionOnItsOwn.test(text);
    });
    expect(`every option the program accepts appears in ${surfaceName}`,
      undocumented.length === 0, `missing: ${undocumented.join(', ')}`);
  }

  const placeholderAfterAnOption = /--([a-z-]+) ([A-Z]+)(?![a-z])/g;
  const placeholdersNamedIn = (text) => {
    const named = new Map();
    for (const [, option, placeholder] of text.matchAll(placeholderAfterAnOption)) {
      const alreadySeen = named.get(option) ?? new Set();
      alreadySeen.add(placeholder);
      named.set(option, alreadySeen);
    }
    return named;
  };

  const [, helpText] = surfaces[0];
  const placeholdersInHelp = placeholdersNamedIn(helpText);
  for (const [surfaceName, text] of surfaces.slice(1)) {
    const disagreements = [];
    for (const [option, placeholdersHere] of placeholdersNamedIn(text)) {
      const placeholdersInTheHelp = placeholdersInHelp.get(option);
      if (placeholdersInTheHelp === undefined) continue;
      for (const placeholder of placeholdersHere) {
        if (!placeholdersInTheHelp.has(placeholder)) {
          disagreements.push(`--${option} ${placeholder} here, --${option} ${[...placeholdersInTheHelp].join('/')} in --help`);
        }
      }
    }
    expect(`the value each option takes is named the same in ${surfaceName} as in --help`,
      disagreements.length === 0, disagreements.join('\n'));
  }

  const claimsEverySurfaceMustMake = [
    ['copying is the default', /copied,? never moved/i],
    ['nothing is written before the plan is complete', /before anything is written|before the whole plan|until the whole plan is settled/i],
    ['a folder must always be named', /no arguments/i],
    ['clashing names go to numbered subfolders', /numbered subfolder/i],
    ['the camera clock decides the day', /clock the camera was set to|camera's own clock/i],
  ];
  for (const [surfaceName, text] of surfaces) {
    const claimsNotMade = claimsEverySurfaceMustMake
      .filter(([, phrasing]) => !phrasing.test(text))
      .map(([claim]) => claim);
    expect(`${surfaceName} states every claim the other surfaces state`,
      claimsNotMade.length === 0, `not stated: ${claimsNotMade.join('; ')}`);
  }

  const surfacesClaimingFilesAreMovedByDefault = surfaces
    .filter(([, text]) => /files are moved within|files are moved into/i.test(text))
    .map(([surfaceName]) => surfaceName);
  expect('no surface still says files are moved by default',
    surfacesClaimingFilesAreMovedByDefault.length === 0,
    surfacesClaimingFilesAreMovedByDefault.join(', '));
}

everyEnumMemberTheCodeRefersToExists();
theDocumentationSaysTheSameAsTheProgram();
sortingACardDumpInPlace();
twoPhotosOnOneDaySharingAName();
twoCardFoldersReusingTheSameFileNumber();
nothingIsWrittenUntilTheWholePlanIsSettled();
containersThatAreLegalButUnusual();
theRawEveryMakerWrites();
aCardFromAnotherMakerSortsToo();
whenTheFilesystemRefuses();
theCameraClockIsTheOnlyClock();
aCardCopiedWithoutPreservingTimes();
theOtherWaysToRunIt();
theCommandLineItself();

fs.rmSync(temporaryDirectory, { recursive: true, force: true });
console.log(failedCheckCount === 0 ? '\n  all checks passed\n' : `\n  ${failedCheckCount} failed\n`);
process.exit(failedCheckCount === 0 ? EXIT_EVERYTHING_PLACED : EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND);
