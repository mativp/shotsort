// Giving every file a camera clock, by the three means available and in that order of
// trust: what the camera wrote inside the file, then the clock of another file of the
// same shot, then -- only if it still looks like a shooting time -- the filesystem's own
// date. Each step returns new records rather than writing into the ones it was given, so
// what a file knew at each stage stays visible.
import path from 'node:path';
import { cameraClockFromDate, cameraClockToMilliseconds, cameraClocksAreTheSameMoment } from './clock.mjs';
import { DATE_SOURCE, DATES_READ_FROM_INSIDE_THE_FILE } from './dateSource.mjs';
import { readCameraClockFromFile } from './formats/registry.mjs';

// A DatedFile is a CandidateFile plus { clock, dateSource }, either of which may be null.

export const FILESYSTEM_DATE_USE = {
  onlyWhenItStillLooksLikeAShootingTime: 'when-plausible',
  always: 'always',
  never: 'never',
};

const MILLISECONDS_PER_HOUR = 60 * 60 * 1000;
const HOURS_A_FILE_TIMESTAMP_MAY_TRAIL_THE_NEWEST_RECORDED_DATE = 36;

const withClock = (file, clock, dateSource) => Object.freeze({ ...file, clock, dateSource });

export const readTheClockInsideEachFile = (candidateFiles, { readClock = readCameraClockFromFile } = {}) =>
  candidateFiles.map((candidateFile) => {
    const found = readClock(candidateFile.path, candidateFile.sizeInBytes);
    return withClock(candidateFile, found?.clock ?? null, found?.source ?? null);
  });

const sameShotKey = (filePath) =>
  path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath))).toLowerCase();

const shotNameAlone = (filePath) => path.basename(sameShotKey(filePath));

// A raw that records no date of its own takes the date of the jpeg shot alongside it.
// Across card slots there is no folder to go on, so a name is only trusted when the whole
// card used it once.
export function fillClocksFromTheSameShot(datedFiles) {
  const clockOfEachShot = new Map();
  const clocksEachNameWasGiven = new Map();

  for (const datedFile of datedFiles) {
    if (datedFile.clock === null) continue;

    const key = sameShotKey(datedFile.path);
    if (!clockOfEachShot.has(key)) clockOfEachShot.set(key, datedFile.clock);

    const name = shotNameAlone(datedFile.path);
    const clocksSoFar = clocksEachNameWasGiven.get(name) ?? [];
    if (!clocksSoFar.some((clock) => cameraClocksAreTheSameMoment(clock, datedFile.clock))) {
      clocksSoFar.push(datedFile.clock);
    }
    clocksEachNameWasGiven.set(name, clocksSoFar);
  }

  return datedFiles.map((datedFile) => {
    if (datedFile.clock !== null) return datedFile;

    const inTheSameFolder = clockOfEachShot.get(sameShotKey(datedFile.path));
    const everyClockThatNameHas = clocksEachNameWasGiven.get(shotNameAlone(datedFile.path)) ?? [];
    const theOneTimeThatNameWasUsed = everyClockThatNameHas.length === 1 ? everyClockThatNameHas[0] : undefined;

    const clockOfTheOtherFormat = inTheSameFolder ?? theOneTimeThatNameWasUsed;
    return clockOfTheOtherFormat === undefined
      ? datedFile
      : withClock(datedFile, clockOfTheOtherFormat, DATE_SOURCE.siblingFile);
  });
}

const newestClockRecordedInsideAnyFile = (datedFiles) => {
  const clocksReadFromFileContents = datedFiles
    .filter((datedFile) => DATES_READ_FROM_INSIDE_THE_FILE.has(datedFile.dateSource))
    .map((datedFile) => cameraClockToMilliseconds(datedFile.clock));
  return clocksReadFromFileContents.length === 0 ? null : Math.max(...clocksReadFromFileContents);
};

// `cp` without -p replaces a file's date with the moment of the copy, so a filesystem date
// sitting well after the newest shot on the card is the copy's date, not the shoot's.
const filesystemDateStillLooksLikeAShootingTime = (datedFile, newestRecordedDate) => {
  if (newestRecordedDate === null) return true;
  const howFarItTrailsTheShoot = datedFile.fileTimestamp.getTime() - newestRecordedDate;
  return howFarItTrailsTheShoot <= HOURS_A_FILE_TIMESTAMP_MAY_TRAIL_THE_NEWEST_RECORDED_DATE * MILLISECONDS_PER_HOUR;
};

export function fillClocksFromTheFilesystem(datedFiles, useSetting) {
  const newestRecordedDate = newestClockRecordedInsideAnyFile(datedFiles);
  let filesDatedByTheFilesystem = 0;
  let filesLeftUndated = 0;

  const files = datedFiles.map((datedFile) => {
    if (datedFile.clock !== null) return datedFile;

    const mayUseTheFilesystemDate = useSetting === FILESYSTEM_DATE_USE.always
      || (useSetting === FILESYSTEM_DATE_USE.onlyWhenItStillLooksLikeAShootingTime
        && filesystemDateStillLooksLikeAShootingTime(datedFile, newestRecordedDate));

    if (!mayUseTheFilesystemDate) {
      filesLeftUndated++;
      return datedFile;
    }
    filesDatedByTheFilesystem++;
    return withClock(datedFile, cameraClockFromDate(datedFile.fileTimestamp), DATE_SOURCE.fileTimestamp);
  });

  return { files, counts: { filesDatedByTheFilesystem, filesLeftUndated } };
}
