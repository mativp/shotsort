import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraClockFrom, cameraClockFromDateWrittenOut, cameraClockFromExifText, cameraClockFromIso8601,
  compareCameraClocks, dayFolderFor, formatCameraClock, layoutIsUsable,
} from '../../src/clock.mjs';
import { exif } from '../support/inMemory.mjs';

test('clocks compare as a total order', async (context) => {
  const morning = exif('2026:08:27 08:00:00');
  const evening = exif('2026:08:27 20:00:00');

  await context.test('an earlier clock sorts before a later one',
    () => assert.equal(compareCameraClocks(morning, evening), -1));
  await context.test('and the comparison is the other way round when the arguments are',
    () => assert.equal(compareCameraClocks(evening, morning), 1));
  await context.test('the same moment compares equal',
    () => assert.equal(compareCameraClocks(morning, exif('2026:08:27 08:00:00')), 0));
  await context.test('two files with no clock compare equal', () => assert.equal(compareCameraClocks(null, null), 0));

  // The bug this replaced: both directions answered "after", so the sort was free to order
  // dated and undated files either way round and did so differently at different lengths.
  await context.test('a file with no clock sorts after one that has a clock',
    () => assert.equal(compareCameraClocks(null, morning), 1));
  await context.test('and the comparison is consistent in reverse, which it was not before',
    () => assert.equal(compareCameraClocks(morning, null), -1));
  await context.test('so no pair of files ever claims each is after the other',
    () => assert.equal(compareCameraClocks(null, morning), -compareCameraClocks(morning, null)));
});

test('the day a file is filed under', async (context) => {
  const justAfterMidnight = exif('2026:08:28 01:30:00');
  await context.test('by default the day turns at midnight',
    () => assert.equal(dayFolderFor(justAfterMidnight), '2026-08-28'));
  await context.test('--day-start 4 files the small hours with the evening before',
    () => assert.equal(dayFolderFor(justAfterMidnight, { hourTheDayStartsAt: 4 }), '2026-08-27'));
  await context.test('a layout may nest the day inside its year',
    () => assert.equal(dayFolderFor(justAfterMidnight, { layout: '%Y/%F' }), '2026/2026-08-28'));
  await context.test('an unknown escape is left as it was written',
    () => assert.equal(dayFolderFor(justAfterMidnight, { layout: '%F-%Z' }), '2026-08-28-%Z'));
  await context.test('a doubled percent is one percent',
    () => assert.equal(dayFolderFor(justAfterMidnight, { layout: '%F%%' }), '2026-08-28%'));
  await context.test('a layout naming no day is refused', () => assert.ok(!layoutIsUsable('photos')));
  await context.test('an absolute layout is refused', () => assert.ok(!layoutIsUsable('/etc/%F')));
  await context.test('a layout climbing out of the folder is refused', () => assert.ok(!layoutIsUsable('../%F')));
  await context.test('a layout naming the day is accepted', () => assert.ok(layoutIsUsable('%Y/%F')));
});

test("a movie stamped in UTC is not the camera's clock", async (context) => {
  await context.test('a creation date with a zone offset is taken as the camera wrote it',
    () => assert.equal(formatCameraClock(cameraClockFromIso8601('2026-08-28T09:15:00+0200')), '2026-08-28 09:15:00'));
  await context.test('but one stamped Z is refused, so a reader falls through to something better',
    () => assert.equal(cameraClockFromIso8601('2026-08-28T09:15:00Z'), null));
});

test('a clock is built only from fields that were there', async (context) => {
  await context.test('a clock whose year was not there to read is no clock at all',
    () => assert.equal(cameraClockFrom(null, null, null, null, null, null), null));
  await context.test('a clock whose fields were all read is built from them',
    () => assert.equal(formatCameraClock(cameraClockFrom(2026, 8, 27, 10, 30, 0)), '2026-08-27 10:30:00'));
  await context.test('no text to read is no clock, whichever way the text would have been written', () => assert.ok(
    cameraClockFromDateWrittenOut(null) === null && cameraClockFromExifText(null) === null
    && cameraClockFromIso8601(null) === null,
  ));
  await context.test('a date written out with no seconds on it is read as the minute it names',
    () => assert.equal(formatCameraClock(cameraClockFromDateWrittenOut('2001/ 1/27 13:42')), '2001-01-27 13:42:00'));
  await context.test('a month name that is no month is not taken for one',
    () => assert.equal(cameraClockFromDateWrittenOut('Xxx, 04 Zzz 2021 05:06:07 +0000'), null));
});
