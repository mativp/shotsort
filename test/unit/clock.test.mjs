import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cameraClockFrom, cameraClockFromDateWrittenOut, cameraClockFromExifText, cameraClockFromIso8601,
  cameraClockToMilliseconds, cameraClocksAreTheSameMoment, compareCameraClocks, dayFolderFor, formatCameraClock,
  isPlausibleCameraClock, layoutIsUsable,
} from '../../src/clock.mjs';

test('clocks compare as a total order', async (context) => {
  const morning = cameraClockFromExifText('2026:08:27 08:00:00');
  const evening = cameraClockFromExifText('2026:08:27 20:00:00');

  await context.test('an earlier clock sorts before a later one',
    () => assert.equal(compareCameraClocks(morning, evening), -1));
  await context.test('and the comparison is the other way round when the arguments are',
    () => assert.equal(compareCameraClocks(evening, morning), 1));
  await context.test('the same moment compares equal',
    () => assert.equal(compareCameraClocks(morning, cameraClockFromExifText('2026:08:27 08:00:00')), 0));
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
  const justAfterMidnight = cameraClockFromExifText('2026:08:28 01:30:00');
  await context.test('by default the day turns at midnight',
    () => assert.equal(dayFolderFor(justAfterMidnight), '2026-08-28'));
  await context.test('--day-start 4 files the small hours with the evening before',
    () => assert.equal(dayFolderFor(justAfterMidnight, { hourTheDayStartsAt: 4 }), '2026-08-27'));
  await context.test('a day starting in the evening files the afternoon before it with the day before', () => assert.ok(
    dayFolderFor(cameraClockFrom(2026, 8, 28, 19, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-27'
    && dayFolderFor(cameraClockFrom(2026, 8, 28, 20, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-28',
  ));
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

const readOut = (clock) => (clock === null ? null : formatCameraClock(clock));

test('clocks that differ in a single field', async (context) => {
  const at = (year, month, day, hour, minute, second) => cameraClockFrom(year, month, day, hour, minute, second);
  const oneFieldLater = [
    ['year', at(2027, 8, 27, 10, 30, 0)], ['month', at(2026, 9, 27, 10, 30, 0)], ['day', at(2026, 8, 28, 10, 30, 0)],
    ['hour', at(2026, 8, 27, 11, 30, 0)], ['minute', at(2026, 8, 27, 10, 31, 0)], ['second', at(2026, 8, 27, 10, 30, 1)],
  ];
  for (const [field, later] of oneFieldLater) {
    await context.test(`one a ${field} later sorts after it and is not the same moment`, () => assert.deepEqual(
      [compareCameraClocks(at(2026, 8, 27, 10, 30, 0), later), cameraClocksAreTheSameMoment(at(2026, 8, 27, 10, 30, 0), later)],
      [-1, false],
    ));
  }
  await context.test('and a clock is the same moment as one with every field the same',
    () => assert.equal(cameraClocksAreTheSameMoment(at(2026, 8, 27, 10, 30, 0), at(2026, 8, 27, 10, 30, 0)), true));
  await context.test('a clock is counted in milliseconds as the local time it names', () => assert.equal(
    cameraClockToMilliseconds(at(2026, 8, 27, 10, 30, 0)),
    new Date(2026, 7, 27, 10, 30, 0).getTime(),
  ));
});

test('the years a camera clock may plausibly name', async (context) => {
  const inTheYear = (year) => isPlausibleCameraClock(cameraClockFrom(year, 1, 1, 0, 0, 0));
  await context.test('the earliest year plausible and the latest are both plausible', () => assert.deepEqual([inTheYear(1995), inTheYear(2100)], [true, true]));
  await context.test('and the years either side of them are not', () => assert.deepEqual([inTheYear(1994), inTheYear(2101)], [false, false]));
});

test('the shapes a date is written in', async (context) => {
  await context.test('Exif text with anything in front of the date is not read as one',
    () => assert.equal(cameraClockFromExifText('x2026:08:27 10:30:00'), null));
  await context.test('a stamp is only UTC when its Z ends it', () => assert.equal(
    readOut(cameraClockFromIso8601('2026-08-28T09:15:00+0200 CEST (Zurich)')),
    '2026-08-28 09:15:00',
  ));
  await context.test('however much space follows the Z', () => assert.equal(cameraClockFromIso8601('2026-08-28T09:15:00Z   '), null));

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  await context.test('every month is read by its name', () => assert.deepEqual(
    monthNames.map((name) => readOut(cameraClockFromDateWrittenOut(`Mon ${name} 12 10:30:00 2026`))?.slice(5, 7)),
    ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
  ));
  await context.test('a name that is no month is not taken for one in the shape with the year last',
    () => assert.equal(cameraClockFromDateWrittenOut('Thu Zzz 04 05:06:07 2021'), null));
  await context.test('the shape with the year last is read however the gaps are padded',
    () => assert.equal(readOut(cameraClockFromDateWrittenOut('Thu Mar  4  05:06:07  2021')), '2021-03-04 05:06:07'));
  await context.test('and so is the shape with the year in the middle, with its month spelled out in full',
    () => assert.equal(readOut(cameraClockFromDateWrittenOut('Sat, 14  October  2025  15:53:46 +0000')), '2025-10-14 15:53:46'));
  await context.test('a date in numbers is read with a separator after its day and room before its time',
    () => assert.equal(readOut(cameraClockFromDateWrittenOut('2001/01/27/  13:42:00')), '2001-01-27 13:42:00'));
});

test('the escapes that name a day in a layout', async (context) => {
  await context.test('each of them names a day on its own', () => assert.deepEqual(
    ['%Y', '%m', '%d', '%F'].map(layoutIsUsable),
    [true, true, true, true],
  ));
  await context.test('and an escape that is none of them does not', () => assert.equal(layoutIsUsable('%e/%s'), false));
});
