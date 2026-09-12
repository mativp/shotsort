import path from 'node:path';

// The clock the camera was set to when the shutter fired, and nothing else: no timezone,
// no epoch, no offset from the sorting computer's own clock. A CameraClock is the wall
// time the camera wrote down, which is the only thing that should decide a file's day.
//
// Holding it as a record rather than a string is what lets the comparison below be
// total and the day-folder naming read fields instead of slicing character ranges.

const EARLIEST_PLAUSIBLE_YEAR = 1995;
const LATEST_PLAUSIBLE_YEAR = 2100;

const SECONDS_BETWEEN_1904_AND_1970 = 2082844800;
const SECONDS_BETWEEN_1601_AND_1970 = 11644473600;
const SECONDS_BETWEEN_1970_AND_2001 = 978307200;
const MILLISECONDS_PER_SECOND = 1000;
const HUNDRED_NANOSECONDS_PER_SECOND = 10000000;
const NANOSECONDS_PER_SECOND = 1000000000;

const EXIF_DATE_TIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const ISO_8601_DATE_TIME_PATTERN = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;
const A_TIME_STAMPED_IN_UTC_RATHER_THAN_THE_CAMERA_S_OWN_CLOCK = /Z\s*$/;

// The two shapes a date gets written out in words. AVI's IDIT chunk uses the one C's
// ctime prints -- "Mon Mar 10 15:04:43 2003" -- and a PNG's Creation Time uses the one
// mail headers use, "Sat, 14 Oct 2025 15:53:46". The day name is never needed and the
// year moves from one end to the other, which is the whole difference between them.
const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DATE_WITH_THE_YEAR_LAST = /([a-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})/i;
const DATE_WITH_THE_YEAR_IN_THE_MIDDLE = /(\d{1,2})\s+([a-z]{3})[a-z]*\s+(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/i;
// A date and time with a slash or a dash between the numbers, written by the camcorders
// that filled an AVI's ICRD chunk: "2005-11-28 09:19:00", "2001/ 1/27 13:42:00".
const DATE_WRITTEN_IN_NUMBERS = /(\d{4})[-/]\s*(\d{1,2})[-/]\s*(\d{1,2})[-/]?[T\s]+(\d{1,2}):\s*(\d{2}):?(\d{2})?/;

const twoDigits = (number) => String(number).padStart(2, '0');

const cameraClock = (year, month, day, hour, minute, second) =>
  Object.freeze({ year, month, day, hour, minute, second });

// For a format that writes the fields out separately rather than as text or as a count of
// seconds. A null field means the bytes were not there to read.
export const cameraClockFrom = (year, month, day, hour, minute, second) =>
  (year === null ? null : cameraClock(year, month, day, hour, minute, second));

export const formatCameraClock = (clock) =>
  `${clock.year}-${twoDigits(clock.month)}-${twoDigits(clock.day)} `
  + `${twoDigits(clock.hour)}:${twoDigits(clock.minute)}:${twoDigits(clock.second)}`;

export const isPlausibleCameraClock = (clock) =>
  clock !== null && clock.year >= EARLIEST_PLAUSIBLE_YEAR && clock.year <= LATEST_PLAUSIBLE_YEAR;

export const onlyIfPlausible = (clock) => (isPlausibleCameraClock(clock) ? clock : null);

// Camera clocks compare field by field, which is a total order, so a file with no clock
// at all has to be given a defined place rather than left to whatever the sort does with
// a comparison that is false both ways round. Unclocked files sort last.
export function compareCameraClocks(firstClock, secondClock) {
  if (firstClock === null && secondClock === null) return 0;
  if (firstClock === null) return 1;
  if (secondClock === null) return -1;
  const fields = ['year', 'month', 'day', 'hour', 'minute', 'second'];
  for (const field of fields) {
    if (firstClock[field] !== secondClock[field]) return firstClock[field] < secondClock[field] ? -1 : 1;
  }
  return 0;
}

export const cameraClocksAreTheSameMoment = (firstClock, secondClock) =>
  compareCameraClocks(firstClock, secondClock) === 0;

// Read as the sorting computer's local time on purpose: the only thing this is ever
// compared against is a filesystem timestamp, which is local wall time too.
export const cameraClockToMilliseconds = (clock) =>
  new Date(clock.year, clock.month - 1, clock.day, clock.hour, clock.minute, clock.second).getTime();

export const cameraClockFromDate = (date) =>
  cameraClock(date.getFullYear(), date.getMonth() + 1, date.getDate(),
    date.getHours(), date.getMinutes(), date.getSeconds());

const monthNumberFor = (monthName) => MONTH_NAMES.indexOf(monthName.slice(0, 3).toLowerCase()) + 1;

export function cameraClockFromDateWrittenOut(text) {
  if (text === null) return null;

  const yearLast = DATE_WITH_THE_YEAR_LAST.exec(text);
  if (yearLast !== null && monthNumberFor(yearLast[1]) > 0) {
    return cameraClock(Number(yearLast[6]), monthNumberFor(yearLast[1]), Number(yearLast[2]),
      Number(yearLast[3]), Number(yearLast[4]), Number(yearLast[5]));
  }

  const yearInTheMiddle = DATE_WITH_THE_YEAR_IN_THE_MIDDLE.exec(text);
  if (yearInTheMiddle !== null && monthNumberFor(yearInTheMiddle[2]) > 0) {
    return cameraClock(Number(yearInTheMiddle[3]), monthNumberFor(yearInTheMiddle[2]), Number(yearInTheMiddle[1]),
      Number(yearInTheMiddle[4]), Number(yearInTheMiddle[5]), Number(yearInTheMiddle[6]));
  }

  const inNumbers = DATE_WRITTEN_IN_NUMBERS.exec(text);
  if (inNumbers !== null) {
    return cameraClock(Number(inNumbers[1]), Number(inNumbers[2]), Number(inNumbers[3]),
      Number(inNumbers[4]), Number(inNumbers[5]), Number(inNumbers[6] ?? 0));
  }
  return null;
}

export function cameraClockFromSecondsSince1904(secondsSince1904) {
  const asIfTheSecondsWereUTC = new Date((secondsSince1904 - SECONDS_BETWEEN_1904_AND_1970) * MILLISECONDS_PER_SECOND);
  return cameraClock(
    asIfTheSecondsWereUTC.getUTCFullYear(), asIfTheSecondsWereUTC.getUTCMonth() + 1, asIfTheSecondsWereUTC.getUTCDate(),
    asIfTheSecondsWereUTC.getUTCHours(), asIfTheSecondsWereUTC.getUTCMinutes(), asIfTheSecondsWereUTC.getUTCSeconds(),
  );
}

export const cameraClockFromSecondsSince1970 = (secondsSince1970) =>
  cameraClockFromSecondsSince1904(secondsSince1970 + SECONDS_BETWEEN_1904_AND_1970);

// Windows counts in ten-millionths of a second from 1601, which is how an ASF file --
// a WMV off an older camcorder -- writes the moment it was recorded.
export const cameraClockFromHundredNanosecondsSince1601 = (hundredNanoseconds) =>
  cameraClockFromSecondsSince1970(hundredNanoseconds / HUNDRED_NANOSECONDS_PER_SECOND - SECONDS_BETWEEN_1601_AND_1970);

// Matroska counts in nanoseconds from 2001, which is how MKV and WebM date a recording.
export const cameraClockFromNanosecondsSince2001 = (nanoseconds) =>
  cameraClockFromSecondsSince1970(nanoseconds / NANOSECONDS_PER_SECOND + SECONDS_BETWEEN_1970_AND_2001);

const clockFromMatch = (parts) => (parts === null
  ? null
  : cameraClock(Number(parts[1]), Number(parts[2]), Number(parts[3]),
    Number(parts[4]), Number(parts[5]), Number(parts[6])));

export const cameraClockFromExifText = (text) =>
  (text === null ? null : clockFromMatch(EXIF_DATE_TIME_PATTERN.exec(text)));

// A movie stamped in UTC is not the camera's clock, so it is refused here and the
// reader falls through to something that does spell the camera's own time out.
export function cameraClockFromIso8601(text) {
  if (text === null) return null;
  if (A_TIME_STAMPED_IN_UTC_RATHER_THAN_THE_CAMERA_S_OWN_CLOCK.test(text)) return null;
  return clockFromMatch(ISO_8601_DATE_TIME_PATTERN.exec(text));
}

// Day folder naming. The escapes and the rule saying which escapes are enough to name a
// day live together, so teaching it a new one is a single edit.
export const DEFAULT_LAYOUT = '%Y-%m-%d';
export const EARLIEST_HOUR_A_DAY_MAY_START_AT = 0;
export const LATEST_HOUR_A_DAY_MAY_START_AT = 12;

const ESCAPES_THAT_NAME_A_DAY = ['Y', 'm', 'd', 'F'];
const LAYOUT_NAMES_A_DAY = new RegExp(`%[${ESCAPES_THAT_NAME_A_DAY.join('')}]`);

const inPlainEnglish = (items) =>
  [items.slice(0, -1).join(', '), items[items.length - 1]].filter((part) => part !== '').join(' or ');

export const LAYOUT_MUST_BE = `a relative folder name using ${
  inPlainEnglish(ESCAPES_THAT_NAME_A_DAY.map((escape) => `%${escape}`))}`;

export const layoutIsUsable = (layout) => !path.isAbsolute(layout)
  && !layout.split(/[\\/]/).includes('..')
  && LAYOUT_NAMES_A_DAY.test(layout);

export function dayFolderFor(clock, { hourTheDayStartsAt = EARLIEST_HOUR_A_DAY_MAY_START_AT, layout = DEFAULT_LAYOUT } = {}) {
  const shootingDay = new Date(clock.year, clock.month - 1, clock.day);
  const wasShotBeforeTheDayTurned = clock.hour < hourTheDayStartsAt;
  if (wasShotBeforeTheDayTurned) shootingDay.setDate(shootingDay.getDate() - 1);

  const year = String(shootingDay.getFullYear());
  const month = twoDigits(shootingDay.getMonth() + 1);
  const day = twoDigits(shootingDay.getDate());
  const expansions = { Y: year, m: month, d: day, F: `${year}-${month}-${day}`, '%': '%' };
  return layout.replace(/%(.)/g, (unexpanded, escapeLetter) => expansions[escapeLetter] ?? unexpanded);
}
