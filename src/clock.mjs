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
const MILLISECONDS_PER_SECOND = 1000;

const EXIF_DATE_TIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/;
const ISO_8601_DATE_TIME_PATTERN = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;
const A_TIME_STAMPED_IN_UTC_RATHER_THAN_THE_CAMERA_S_OWN_CLOCK = /Z\s*$/;

const twoDigits = (number) => String(number).padStart(2, '0');

const cameraClock = (year, month, day, hour, minute, second) =>
  Object.freeze({ year, month, day, hour, minute, second });

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

export function cameraClockFromSecondsSince1904(secondsSince1904) {
  const asIfTheSecondsWereUTC = new Date((secondsSince1904 - SECONDS_BETWEEN_1904_AND_1970) * MILLISECONDS_PER_SECOND);
  return cameraClock(
    asIfTheSecondsWereUTC.getUTCFullYear(), asIfTheSecondsWereUTC.getUTCMonth() + 1, asIfTheSecondsWereUTC.getUTCDate(),
    asIfTheSecondsWereUTC.getUTCHours(), asIfTheSecondsWereUTC.getUTCMinutes(), asIfTheSecondsWereUTC.getUTCSeconds(),
  );
}

export const cameraClockFromSecondsSince1970 = (secondsSince1970) =>
  cameraClockFromSecondsSince1904(secondsSince1970 + SECONDS_BETWEEN_1904_AND_1970);

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
