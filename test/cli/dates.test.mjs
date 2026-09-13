import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {
  OLYMPUS_RAW_SIGNATURE, PANASONIC_RAW_SIGNATURE, TIFF_STANDARD_SIGNATURE, tiffFile,
} from '../fixtures/tiff.mjs';
import { jpegFile } from '../fixtures/jpeg.mjs';
import { UNDATED_FOLDER_NAME } from '../../src/plan.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { EXIT_CODE } from '../../cli/usage.mjs';
import { folderChosenFor, runCommand } from '../support/commandLine.mjs';
import { aTemporaryDirectory, freshCardDump } from '../support/temporaryDirectories.mjs';
import { visibleFilesUnder, writeFixtureFile } from '../support/files.mjs';

test('a card from another maker sorts too', async (context) => {
  const dump = aTemporaryDirectory('other-maker');
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
  await context.test('an AVI that records no date of its own takes it from the THM sitting beside it', () => assert.ok(
    folderChosenFor(plan.standardOutput, 'MVI_0002.AVI') === '2026-08-28'
    && JSON.parse(plan.standardOutput).actions
      .find((action) => action.src.endsWith('MVI_0002.AVI')).dateFrom === DATE_SOURCE.siblingFile,
    plan.standardOutput,
  ));

  const sorted = runCommand(['--move', dump]);
  await context.test('a card holding Canon and Olympus files sorts by the dates inside them, and exits 0',
    () => assert.equal(sorted.exitCode, EXIT_CODE.everythingPlaced));
  await context.test('and every one of them lands in the day its own camera recorded', () => assert.equal(
    visibleFilesUnder(dump).join('\n'),
    [
      '2026-08-27/IMG_0001.CR2',
      '2026-08-27/IMG_0001.JPG',
      '2026-08-27/P8270003.ORF',
      '2026-08-28/MVI_0002.AVI',
      '2026-08-28/MVI_0002.THM',
    ].join('\n'),
  ));
});

test('a raw and its jpeg on different cards', async (context) => {
  const twoSlots = aTemporaryDirectory('two-slots');
  const rawOn = (slot, name, contents) => writeFixtureFile(path.join(twoSlots, slot, 'DCIM', '100NC_Z9', name), contents);

  rawOn('SLOT1', 'DSC_0001.HSP', Buffer.alloc(64, 1));
  rawOn('SLOT2', 'DSC_0001.JPG', jpegFile('2026:08:27 09:07:01'));
  const plan = runCommand(['-n', '--json', twoSlots]);
  await context.test('a file with no date of its own takes it from its twin on the other card slot',
    () => assert.equal(folderChosenFor(plan.standardOutput, 'DSC_0001.HSP'), '2026-08-27'));

  const twoCameras = aTemporaryDirectory('two-cameras');
  writeFixtureFile(path.join(twoCameras, 'A', 'DSC_0001.JPG'), jpegFile('2026:08:27 09:07:01'));
  writeFixtureFile(path.join(twoCameras, 'B', 'DSC_0001.JPG'), jpegFile('2026:09:14 18:00:00'));
  writeFixtureFile(path.join(twoCameras, 'C', 'DSC_0001.HSP'), Buffer.alloc(64, 2));

  const guessed = runCommand(['-n', '--json', '--ignore-filesystem-date', twoCameras]);
  await context.test('but when two cameras used that name on different days it guesses at neither',
    () => assert.equal(folderChosenFor(guessed.standardOutput, 'DSC_0001.HSP'), UNDATED_FOLDER_NAME));
});

test('the camera clock is the only clock', async (context) => {
  const dump = freshCardDump('camera-clock');
  const planIn = (timezone) => runCommand(['-n', '--json', dump], { env: { ...process.env, TZ: timezone } }).standardOutput;
  const plannedInNewYork = planIn('America/New_York');
  const plannedInAuckland = planIn('Pacific/Auckland');
  const filesRecordingTheirOwnDate = ['P1000005.MP4', 'P1000007.MOV', 'P1000001.JPG', 'P1000003.RW2'];

  await context.test('stills and video alike ignore the timezone of the computer sorting them', () => assert.deepEqual(
    filesRecordingTheirOwnDate.map((fileName) => folderChosenFor(plannedInNewYork, fileName)),
    filesRecordingTheirOwnDate.map((fileName) => folderChosenFor(plannedInAuckland, fileName)),
  ));
  await context.test('a clip recorded at 00:20 stays on the day it was recorded',
    () => assert.equal(folderChosenFor(plannedInAuckland, 'P1000005.MP4'), '2026-08-28'));

  const nightShoot = runCommand(['-n', '--day-start', '4', dump]);
  await context.test('--day-start folds a 00:20 clip into the day the shoot began', () => assert.ok(
    /2026-08-28.* 1 file/.test(nightShoot.standardOutput) && /2026-08-27.* 8 files/.test(nightShoot.standardOutput),
    nightShoot.standardOutput,
  ));
});

test('a card copied without preserving times', async (context) => {
  const dump = freshCardDump('copied-with-plain-cp', { everyFileStampedAt: '2026-09-08T17:00:00' });
  const sorted = runCommand(['--move', dump]);
  const actualFiles = visibleFilesUnder(dump);

  await context.test('files recording no date of their own go to undated/ when their filesystem date is a copy artefact', () => assert.ok(
    actualFiles.includes(`${UNDATED_FOLDER_NAME}/P1000004.HSP`) && actualFiles.includes(`${UNDATED_FOLDER_NAME}/00000.MTS`),
    JSON.stringify(actualFiles, null, 1),
  ));
  await context.test('every other file still sorts by the date it records itself', () => assert.ok(
    actualFiles.includes('2026-08-27/P1000002.JPG') && actualFiles.includes('2026-08-28/P1000005.MP4'),
  ));
  await context.test('and the reason is explained on standard error',
    () => assert.match(sorted.standardError, /copy rather than a shooting time/));

  const forced = freshCardDump('forced', { everyFileStampedAt: '2026-09-08T17:00:00' });
  runCommand(['--move', '--use-filesystem-date', forced]);
  await context.test('--use-filesystem-date takes those dates as they are',
    () => assert.ok(visibleFilesUnder(forced).some((filePath) => filePath.startsWith('2026-09-08/'))));

  const refused = freshCardDump('refused');
  runCommand(['--move', '--ignore-filesystem-date', refused]);
  await context.test('--ignore-filesystem-date sends every file recording no date to undated/',
    () => assert.ok(visibleFilesUnder(refused).includes(`${UNDATED_FOLDER_NAME}/00000.MTS`)));
});

test('matching the shot whatever the case', async (context) => {
  const dump = aTemporaryDirectory('case');
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000009.JPG'), jpegFile('2026:04:05 11:00:00'));
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'p1000009.rw2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }));

  runCommand(['--move', dump]);
  await context.test('a raw matches its jpeg whatever case the card wrote the names in', () => assert.ok(
    visibleFilesUnder(dump).includes('2026-04-05/p1000009.rw2'),
    JSON.stringify(visibleFilesUnder(dump)),
  ));

  const ambiguous = aTemporaryDirectory('ambiguous');
  for (const [folder, shot] of [['100_PANA', '2026:04:05 09:00:00'], ['101_PANA', '2026:04:09 15:00:00']]) {
    writeFixtureFile(path.join(ambiguous, 'DCIM', folder, 'IMG_0001.JPG'), jpegFile(shot));
    writeFixtureFile(path.join(ambiguous, 'DCIM', folder, 'img_0001.rw2'),
      tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }));
  }
  runCommand(['--move', ambiguous]);
  await context.test('and where one name is used on two days, each raw takes the date of its own folder', () => assert.deepEqual(
    visibleFilesUnder(ambiguous),
    [
      '2026-04-05/IMG_0001.JPG', '2026-04-05/img_0001.rw2',
      '2026-04-09/IMG_0001.JPG', '2026-04-09/img_0001.rw2',
    ],
  ));
});

test('the edge of trusting the filesystem', async (context) => {
  const dayOfTheShoot = '2026:04:06 12:00:00';
  const newestShot = new Date('2026-04-06T12:00:00').getTime();
  const hours = (howMany) => new Date(newestShot + howMany * 60 * 60 * 1000);

  const dumpFor = (name, stampedAt) => {
    const dump = aTemporaryDirectory(name);
    writeFixtureFile(path.join(dump, 'DCIM', 'DATED.JPG'), jpegFile(dayOfTheShoot));
    writeFixtureFile(path.join(dump, 'DCIM', 'UNDATED.HSP'), Buffer.alloc(64, 3), stampedAt);
    runCommand(['--move', dump]);
    return visibleFilesUnder(dump);
  };

  const sortedAtTheEdge = dumpFor('edge-in', hours(36));
  const sortedJustPastIt = dumpFor('edge-out', new Date(newestShot + 36 * 60 * 60 * 1000 + 60000));

  await context.test('a filesystem date 36 hours after the newest shot is still trusted', () => assert.ok(
    sortedAtTheEdge.some((sortedPath) => /^2026-04-0[78]\/UNDATED\.HSP$/.test(sortedPath)),
    JSON.stringify(sortedAtTheEdge),
  ));
  await context.test('one minute past that it is treated as the moment of a copy',
    () => assert.ok(sortedJustPastIt.includes(`${UNDATED_FOLDER_NAME}/UNDATED.HSP`), JSON.stringify(sortedJustPastIt)));
});
