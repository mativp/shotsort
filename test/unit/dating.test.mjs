import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraClockFromExifText as exif, formatCameraClock } from '../../src/clock.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import {
  FILESYSTEM_DATE_USE, fillClocksFromTheFilesystem, fillClocksFromTheSameShot, readTheClockInsideEachFile,
} from '../../src/dating.mjs';
import { UNDATED_FOLDER_NAME, buildPlan } from '../../src/plan.mjs';
import { candidate, probeOver } from '../support/inMemory.mjs';

test('a file that records no date', async (context) => {
  const undated = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) });
  const dated = candidate('/card/DCIM/P1.JPG', {
    clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata,
  });

  const trusted = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.always }, probeOver([]));
  await context.test('--use-filesystem-date files an undated clip by the date the filesystem keeps', () => assert.equal(
    trusted.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    '2026-08-27',
  ));
  await context.test('and says so in the counts',
    () => assert.equal(trusted.filesystemDateUseCounts.filesDatedByTheFilesystem, 1));

  const ignored = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.never }, probeOver([]));
  await context.test('--ignore-filesystem-date sends it to the undated folder instead', () => assert.equal(
    ignored.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    UNDATED_FOLDER_NAME,
  ));
  await context.test('and counts it as left undated',
    () => assert.equal(ignored.filesystemDateUseCounts.filesLeftUndated, 1));

  const copiedLongAfterTheShoot = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 14) });
  const byDefault = buildPlan([dated, copiedLongAfterTheShoot], {}, probeOver([]));
  await context.test('left to itself it refuses a filesystem date that looks like the moment of a copy', () => assert.equal(
    byDefault.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    UNDATED_FOLDER_NAME,
  ));
});

test('a raw takes the date of its jpeg', async (context) => {
  const plan = buildPlan([
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/DCIM/P1.RW2'),
  ], {}, probeOver([]));

  const raw = plan.placements.find((entry) => entry.sourcePath.endsWith('.RW2'));
  await context.test('a raw recording no date follows the jpeg of the same shot',
    () => assert.equal(raw.folderName, '2026-08-27'));
  await context.test('and is marked as having taken its date from a sibling',
    () => assert.equal(raw.dateSource, DATE_SOURCE.siblingFile));
});

test('a card holding nothing that records its own date', async (context) => {
  // Nothing on the card says when it was shot, so there is no newest shot to measure a
  // filesystem date against and no reason to distrust one.
  const nothingDated = [
    candidate('/card/DCIM/CLIP1.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) }),
    candidate('/card/DCIM/CLIP2.MTS', { fileTimestamp: new Date(2026, 7, 28, 9) }),
  ];
  const plan = buildPlan(nothingDated, {}, probeOver([]));

  await context.test('with no shot on the card to measure against, a filesystem date is taken as it stands',
    () => assert.equal(plan.placements.map((entry) => entry.folderName).join(), '2026-08-27,2026-08-28'));
  await context.test('and both files are counted as dated by the filesystem',
    () => assert.equal(plan.filesystemDateUseCounts.filesDatedByTheFilesystem, 2));
});

const dated = (filePath, exifText) => candidate(filePath, { clock: exif(exifText), dateSource: DATE_SOURCE.exifMetadata });
const clockTextOf = (file) => (file.clock === null ? null : formatCameraClock(file.clock));

test('reading the clock inside each file', async (context) => {
  const clock = exif('2026:08:27 10:00:00');
  const [found, notFound] = readTheClockInsideEachFile([candidate('/card/A.JPG'), candidate('/card/B.JPG')], {
    readClock: (filePath) => (filePath.endsWith('A.JPG') ? { clock, source: DATE_SOURCE.exifMetadata } : null),
  });
  await context.test('a file whose clock was read carries it and where it came from',
    () => assert.deepEqual([found.clock, found.dateSource], [clock, DATE_SOURCE.exifMetadata]));
  await context.test('and one whose clock was not carries neither', () => assert.deepEqual([notFound.clock, notFound.dateSource], [null, null]));
});

test('the clock a file takes from another file of the same shot', async (context) => {
  const clockOfTheRawIn = (files) => clockTextOf(fillClocksFromTheSameShot(files).find((file) => file.path.endsWith('.RW2')));

  await context.test('a raw listed before its jpeg still takes the jpeg\'s clock',
    () => assert.equal(clockOfTheRawIn([candidate('/card/DCIM/P1.RW2'), dated('/card/DCIM/P1.JPG', '2026:08:27 10:00:00')]), '2026-08-27 10:00:00'));
  await context.test('and so does one whose name the card wrote in another case, though that name was used elsewhere too', () => assert.equal(
    clockOfTheRawIn([dated('/card/A/P1.JPG', '2026:08:27 10:00:00'), dated('/card/C/P1.JPG', '2026:08:27 11:00:00'), candidate('/card/A/p1.RW2')]),
    '2026-08-27 10:00:00',
  ));
  await context.test('the first dated file of the shot is the one whose clock it takes', () => assert.equal(
    clockOfTheRawIn([dated('/card/DCIM/P1.JPG', '2026:08:27 10:00:00'), dated('/card/DCIM/P1.HIF', '2026:08:27 10:00:05'), candidate('/card/DCIM/P1.RW2')]),
    '2026-08-27 10:00:00',
  ));
  await context.test('a raw in another folder takes the clock of the one file anywhere with its name',
    () => assert.equal(clockOfTheRawIn([dated('/card/B/P1.JPG', '2026:08:27 10:00:00'), candidate('/card/A/P1.RW2')]), '2026-08-27 10:00:00'));
  await context.test('and of two with its name taken at the same moment', () => assert.equal(
    clockOfTheRawIn([dated('/card/B/P1.JPG', '2026:08:27 10:00:00'), dated('/card/B/P1.HIF', '2026:08:27 10:00:00'), candidate('/card/A/P1.RW2')]),
    '2026-08-27 10:00:00',
  ));
  await context.test('but not when its name was used at two moments', () => assert.equal(
    clockOfTheRawIn([dated('/card/B/P1.JPG', '2026:08:27 10:00:00'), dated('/card/C/P1.JPG', '2026:08:27 11:00:00'), candidate('/card/A/P1.RW2')]),
    null,
  ));
  // Lower-casing and upper-casing disagree on a few letters: ß stays ß lowered but becomes SS
  // raised, so straße and STRASSE only match when both are raised.
  await context.test('names are matched by folding them to lower case, so straße is not STRASSE', () => assert.equal(
    clockOfTheRawIn([dated('/card/DCIM/STRASSE.JPG', '2026:08:27 10:00:00'), candidate('/card/DCIM/straße.RW2')]),
    null,
  ));
  await context.test('a jpeg in the raw\'s own folder is trusted however many moments its name was used at elsewhere', () => assert.equal(
    clockOfTheRawIn([dated('/card/A/P1.JPG', '2026:08:27 10:00:00'), dated('/card/C/P1.JPG', '2026:08:27 11:00:00'), candidate('/card/A/P1.RW2')]),
    '2026-08-27 10:00:00',
  ));
});

test('how far a filesystem date may trail the newest shot', async (context) => {
  const newestShot = new Date(2026, 7, 27, 10);
  const shots = [dated('/card/DCIM/P1.JPG', '2026:08:18 10:00:00'), dated('/card/DCIM/P2.JPG', '2026:08:27 10:00:00')];
  const trailingBy = (milliseconds) => {
    const clip = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(newestShot.getTime() + milliseconds) });
    const { files } = fillClocksFromTheFilesystem([...shots, clip], FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime);
    return files.at(-1).dateSource;
  };
  const HOUR = 60 * 60 * 1000;
  await context.test('a date an hour after the newest shot, not the oldest, still looks like a shooting time',
    () => assert.equal(trailingBy(HOUR), DATE_SOURCE.fileTimestamp));
  await context.test('and so does one exactly thirty-six hours after it', () => assert.equal(trailingBy(36 * HOUR), DATE_SOURCE.fileTimestamp));
  await context.test('but a second later it looks like the moment of a copy', () => assert.equal(trailingBy(36 * HOUR + 1000), null));
});
