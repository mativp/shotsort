#!/usr/bin/env node
// What the seams bought: these run with no disk under them at all. A format reader is
// handed a Buffer, and the planner is handed a probe that answers from a plain object, so
// a plan can be checked for what it decided rather than for the files it left behind.
import {
  jpegFile, movieFile, tiffFile, PANASONIC_RAW_SIGNATURE,
  everyFixtureFormatIsBuiltFrom, THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS, A_CLOCK_THE_READER_MUST_PASS_OVER,
  aviFileNestingItsListsDeeperThanACameraDoes, aviFileRecordingWhenItWasShot, canonCiffRawFile, digitalVideoClip,
  matroskaMovieWhoseIdIsWiderThanAnyIdMayBe, movieFileWhoseBoxIsSmallerThanItsOwnHeader,
  aviFileBuriedUnderMoreChunksThanAreWalked, pngStill, pngStillBuriedUnderMoreChunksThanAreWalked,
  redcodeClipBuriedUnderMoreRecordsThanAreWalked, windowsMediaMovie,
  windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked,
} from './fixtures.mjs';
import path from 'node:path';
import { byteSourceForBuffer } from '../src/bytes.mjs';
import { FORMATS_IN_THE_ORDER_THEY_ARE_TRIED, readCameraClockFromByteSource } from '../src/formats/registry.mjs';
import {
  BYTES_IN_A_LONG_FIELD, BYTES_IN_A_SHORT_FIELD, readTwoByteWideTextAt, readUInt64EitherWayRoundAt,
  readUnsignedOfWidthAt,
} from '../src/bytes.mjs';
import {
  compareCameraClocks, cameraClockFrom, cameraClockFromDateWrittenOut, cameraClockFromExifText,
  cameraClockFromIso8601, dayFolderFor, formatCameraClock, layoutIsUsable,
} from '../src/clock.mjs';
import { DATE_SOURCE } from '../src/dateSource.mjs';
import { FILESYSTEM_DATE_USE } from '../src/dating.mjs';
import {
  NO_FREE_NAME_IN_THE_DAY_FOLDER, PLACEMENT, UNDATED_FOLDER_NAME, buildPlan, countPlacements,
} from '../src/plan.mjs';
import { fileAsItIsPlaced, reportAsJson, reportForATerminal } from '../cli/report.mjs';
import { aProgressLineBelongsOn, progressLineFor, progressLineText } from '../cli/progress.mjs';
import { decideWhatToDo, WHAT_TO_DO } from '../cli/options.mjs';

let failedCheckCount = 0;

function expect(whatShouldBeTrue, itWasTrue, detailWhenItWasNot = '') {
  console.log(`${itWasTrue ? '  ok  ' : '  FAIL'} ${whatShouldBeTrue}`);
  if (itWasTrue) return;
  failedCheckCount++;
  if (detailWhenItWasNot) console.log(`        ${String(detailWhenItWasNot).trim().replace(/\n/g, '\n        ')}`);
}

const clockInside = (buffer) => readCameraClockFromByteSource(byteSourceForBuffer(buffer));

// A probe that answers from a list of paths rather than from a disk. `sameBytes` names the
// groups of paths that hold one photo; anything not named holds bytes of its own.
// Every path the planner hands back has been through path.resolve, which on Windows means
// a drive letter and backslashes. These tests spell a card the Unix way because it reads
// better, so both what goes in and what is expected back is put through the same resolve.
// On Unix it changes nothing; on Windows it is the difference between comparing two paths
// and comparing two notations.
const asThisPlatformSpellsIt = (unixPath) => path.resolve(unixPath);

const probeOver = (pathsThatExist, sameBytes = []) => ({
  exists: (candidatePath) => pathsThatExist.map(asThisPlatformSpellsIt).includes(candidatePath),
  contentsMatch: (firstPath, secondPath) =>
    sameBytes.some((group) => group.map(asThisPlatformSpellsIt).includes(firstPath)
      && group.map(asThisPlatformSpellsIt).includes(secondPath)),
});

const candidate = (filePath, { clock = null, dateSource = null, sizeInBytes = 1000, fileTimestamp = new Date(2026, 7, 27, 12) } = {}) =>
  ({ path: asThisPlatformSpellsIt(filePath), sortRoot: asThisPlatformSpellsIt('/card'), sizeInBytes, fileTimestamp, clock, dateSource });

const exif = (text) => cameraClockFromExifText(text);

function aParserReadsBytesWithNoFileUnderThem() {
  expect('a JPEG is read straight out of a Buffer',
    formatCameraClock(clockInside(jpegFile('2026:08:27 10:30:00')).clock) === '2026-08-27 10:30:00');
  expect('and the date is marked as having come from inside the file',
    clockInside(jpegFile('2026:08:27 10:30:00')).source === DATE_SOURCE.exifMetadata);
  expect('a Panasonic raw is read the same way',
    formatCameraClock(clockInside(tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: '2026:08:27 11:00:00' })).clock)
      === '2026-08-27 11:00:00');
  expect('a movie is marked as having come from a video header, not from Exif',
    clockInside(movieFile('2026-08-28 09:00:00')).source === DATE_SOURCE.videoHeader);
  expect('bytes that are no format at all yield no date rather than throwing',
    clockInside(Buffer.alloc(512, 0x41)) === null);
  expect('an empty file yields no date',
    clockInside(Buffer.alloc(0)) === null);
}

// A card pulled out mid-write, a copy that stopped half way, a file whose end never made it
// off the buffer: the reader meets all three, and a format reader walking a length field it
// has not got the bytes for is where a parser throws. So every fixture is cut short at
// every byte and read again. The point is not only that nothing throws -- it is that a
// half-written file is read as less than the whole and never as a different shot.
const LONGEST_FIXTURE_CUT_AT_EVERY_BYTE = 16 * 1024;
// One fixture carries more segments than any photo does, purely to prove the walk stops;
// cutting it at every byte re-walks all of them and buys nothing, so it is stepped through
// on a prime stride, which no structure in it is aligned to.
const BYTES_STEPPED_OVER_IN_A_LONGER_FIXTURE = 13;

const toTheMinute = (moment) => moment.slice(0, 'YYYY-MM-DD HH:MM'.length);
const MOMENTS_A_CUT_FIXTURE_MAY_STILL_HOLD = new Set(
  [THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS, A_CLOCK_THE_READER_MUST_PASS_OVER].map(toTheMinute),
);

function everyCutOf(bytes) {
  const step = bytes.length > LONGEST_FIXTURE_CUT_AT_EVERY_BYTE ? BYTES_STEPPED_OVER_IN_A_LONGER_FIXTURE : 1;
  const cuts = [];
  for (let cut = 0; cut <= bytes.length; cut += step) cuts.push(cut);
  return cuts;
}

function aFileThatStopsHalfWayIsReadAsLessThanTheWhole() {
  const readWrongly = [];
  const threw = [];

  for (const [fixtureName, bytes] of everyFixtureFormatIsBuiltFrom()) {
    for (const cut of everyCutOf(bytes)) {
      let found;
      try {
        found = clockInside(bytes.subarray(0, cut));
      } catch (whatTheReaderThrew) {
        threw.push(`${fixtureName} cut to ${cut} bytes: ${whatTheReaderThrew.message}`);
        break;
      }
      if (found === null) continue;
      const moment = formatCameraClock(found.clock);
      if (!MOMENTS_A_CUT_FIXTURE_MAY_STILL_HOLD.has(toTheMinute(moment))) {
        readWrongly.push(`${fixtureName} cut to ${cut} bytes read ${moment}`);
      }
    }
  }

  expect('no format reader throws on a file that stops half way, at any byte of any fixture',
    threw.length === 0, threw.slice(0, 5).join('\n'));
  expect('and a cut file reads as nothing or as the moment it holds, never as a different shot',
    readWrongly.length === 0, readWrongly.slice(0, 5).join('\n'));
}

// The other half of the same worry: a card that went bad writes rubbish rather than
// stopping. A length or a count read out of a corrupted byte is what sends a walk past the
// end of the file or round forever, so every byte of every fixture is made to read 0x00 and
// then 0xff -- the two that turn a field into nothing and into far more than the file holds.
const BYTES_A_BAD_CARD_WRITES = [0x00, 0xff];

function aFileGoneBadIsReadWithoutTheReaderGivingUp() {
  const threw = [];

  for (const [fixtureName, bytes] of everyFixtureFormatIsBuiltFrom()) {
    for (const position of everyCutOf(bytes)) {
      if (position === bytes.length) continue;
      for (const rubbish of BYTES_A_BAD_CARD_WRITES) {
        const corrupted = Buffer.from(bytes);
        corrupted[position] = rubbish;
        try {
          clockInside(corrupted);
        } catch (whatTheReaderThrew) {
          threw.push(`${fixtureName} byte ${position} set to ${rubbish}: ${whatTheReaderThrew.message}`);
        }
      }
    }
  }

  expect('no format reader throws on a file gone bad, whichever byte of whichever fixture went',
    threw.length === 0, threw.slice(0, 5).join('\n'));
}

// A container is a tree, and a tree read out of bytes that went bad can point at itself.
// Every walk in here therefore stops at a depth no real file reaches, and these are the
// files that reach it: each one would be read forever, or read something that is not there,
// if the ceiling were taken out.
function theShapesAWalkMustNotBeLedRoundForeverBy() {
  const dateWrittenOut = 'Thu Mar 04 05:06:07 2021';
  expect('a RIFF nesting its lists deeper than a camera nests them is given up on',
    clockInside(aviFileNestingItsListsDeeperThanACameraDoes(dateWrittenOut)) === null);
  expect('while one nested the way a camcorder writes it is still read',
    formatCameraClock(clockInside(aviFileRecordingWhenItWasShot(dateWrittenOut)).clock) === '2021-03-04 05:06:07');

  expect('a CIFF heap buried deeper than a camera buries one is given up on',
    clockInside(canonCiffRawFile('2021-03-04 05:06:07', { heapsTheCaptureTimeIsBuriedUnder: 10 })) === null);
  expect('while the depth a camera does bury it at is still read',
    formatCameraClock(clockInside(canonCiffRawFile('2021-03-04 05:06:07')).clock) === '2021-03-04 05:06:07');

  expect('an element claiming an id wider than any id may be is refused',
    clockInside(matroskaMovieWhoseIdIsWiderThanAnyIdMayBe()) === null);
  expect('a box declaring itself smaller than the header it is written in is refused',
    clockInside(movieFileWhoseBoxIsSmallerThanItsOwnHeader()) === null);
}

// The walks that run along a level rather than down one stop after more items than a real
// file carries, for the same reason: a length read out of a corrupted byte can point at
// the chunk it came from, and a walk that trusted it would never come back.
function theFilesCarryingMoreThanAWalkLooksThrough() {
  expect('a PNG burying its Exif under more chunks than are walked is given up on',
    clockInside(pngStillBuriedUnderMoreChunksThanAreWalked('2021:03:04 05:06:07')) === null);
  expect('while one carrying the chunks a photo really has is read',
    formatCameraClock(clockInside(pngStill('2021:03:04 05:06:07')).clock) === '2021-03-04 05:06:07');

  expect('a WMV burying its file properties under more objects than are walked is given up on',
    clockInside(windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked('2021-03-04 05:06:07')) === null);
  expect('while one written the way a camcorder writes it is read',
    formatCameraClock(clockInside(windowsMediaMovie('2021-03-04 05:06:07')).clock) === '2021-03-04 05:06:07');

  expect('an AVI burying its date under more chunks than are walked is given up on',
    clockInside(aviFileBuriedUnderMoreChunksThanAreWalked('Thu Mar 04 05:06:07 2021')) === null);
  expect('and a Redcode directory holding more records than are walked is too',
    clockInside(redcodeClipBuriedUnderMoreRecordsThanAreWalked('2021-03-04 05:06:07')) === null);
}

function theClipsOffATapeCamcorder() {
  // A DV clip writes its year as two digits, so which century it is in has to be decided.
  // Tape camcorders were sold through both, and a file from either has to land in its own.
  expect('a tape shot in the nineties is filed in the nineteen hundreds',
    formatCameraClock(clockInside(digitalVideoClip('1997-03-04 05:06:07')).clock) === '1997-03-04 05:06:07');
  expect('and one shot since is filed in the two thousands',
    formatCameraClock(clockInside(digitalVideoClip('2021-03-04 05:06:07')).clock) === '2021-03-04 05:06:07');
}

function theMarkOnAFileIsTheLastWordOnIt() {
  // A JPEG whose Exif says nothing must not go on to be tried as a movie: the registry
  // stops at the format the file's own mark named.
  const jpegWithNoExif = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(64, 0), Buffer.from([0xff, 0xd9])]);
  expect('a JPEG carrying no Exif is a JPEG with no date, not something to try as a movie',
    clockInside(jpegWithNoExif) === null);
}

function clocksCompareAsATotalOrder() {
  const morning = exif('2026:08:27 08:00:00');
  const evening = exif('2026:08:27 20:00:00');

  expect('an earlier clock sorts before a later one', compareCameraClocks(morning, evening) === -1);
  expect('and the comparison is the other way round when the arguments are',
    compareCameraClocks(evening, morning) === 1);
  expect('the same moment compares equal', compareCameraClocks(morning, exif('2026:08:27 08:00:00')) === 0);
  expect('two files with no clock compare equal', compareCameraClocks(null, null) === 0);

  // The bug this replaced: both directions answered "after", so the sort was free to order
  // dated and undated files either way round and did so differently at different lengths.
  expect('a file with no clock sorts after one that has a clock',
    compareCameraClocks(null, morning) === 1);
  expect('and the comparison is consistent in reverse, which it was not before',
    compareCameraClocks(morning, null) === -1);
  expect('so no pair of files ever claims each is after the other',
    compareCameraClocks(null, morning) === -compareCameraClocks(morning, null));
}

function theDayAFileIsFiledUnder() {
  const justAfterMidnight = exif('2026:08:28 01:30:00');
  expect('by default the day turns at midnight',
    dayFolderFor(justAfterMidnight) === '2026-08-28');
  expect('--day-start 4 files the small hours with the evening before',
    dayFolderFor(justAfterMidnight, { hourTheDayStartsAt: 4 }) === '2026-08-27');
  expect('a layout may nest the day inside its year',
    dayFolderFor(justAfterMidnight, { layout: '%Y/%F' }) === '2026/2026-08-28');
  expect('an unknown escape is left as it was written',
    dayFolderFor(justAfterMidnight, { layout: '%F-%Z' }) === '2026-08-28-%Z');
  expect('a doubled percent is one percent',
    dayFolderFor(justAfterMidnight, { layout: '%F%%' }) === '2026-08-28%');
  expect('a layout naming no day is refused', !layoutIsUsable('photos'));
  expect('an absolute layout is refused', !layoutIsUsable('/etc/%F'));
  expect('a layout climbing out of the folder is refused', !layoutIsUsable('../%F'));
  expect('a layout naming the day is accepted', layoutIsUsable('%Y/%F'));
}

function aMovieStampedInUtcIsNotTheCamerasClock() {
  expect('a creation date with a zone offset is taken as the camera wrote it',
    formatCameraClock(cameraClockFromIso8601('2026-08-28T09:15:00+0200')) === '2026-08-28 09:15:00');
  expect('but one stamped Z is refused, so a reader falls through to something better',
    cameraClockFromIso8601('2026-08-28T09:15:00Z') === null);
}

function aPlanIsSettledWithNoDiskInvolved() {
  const plan = buildPlan([
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/DCIM/P2.JPG', { clock: exif('2026:08:28 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
  ], {}, probeOver([]));

  expect('each file is planned into the folder of its own day',
    plan.placements.map((entry) => entry.folderName).join() === '2026-08-27,2026-08-28');
  expect('and every one of them is planned to be placed',
    plan.placements.every((entry) => entry.placement === PLACEMENT.intoItsDayFolder));
  expect('the target path is the day folder under the card it came from',
    plan.placements[0].targetPath === asThisPlatformSpellsIt('/card/2026-08-27/P1.JPG'));
  expect('a --dest sends the day folders elsewhere',
    buildPlan([candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00') })],
      { destination: '/library' }, probeOver([])).placements[0].targetPath === asThisPlatformSpellsIt('/library/2026-08-27/P1.JPG'));
}

function twoPhotosOfOneDaySharingAName() {
  const morning = candidate('/card/100/A9999.JPG', { clock: exif('2026:09:01 10:00:00'), sizeInBytes: 1000 });
  const evening = candidate('/card/101/A9999.JPG', { clock: exif('2026:09:01 18:00:00'), sizeInBytes: 1000 });
  const plan = buildPlan([evening, morning], {}, probeOver([]));

  expect('the earlier photo takes the first numbered subfolder',
    plan.placements[0].targetPath === asThisPlatformSpellsIt('/card/2026-09-01/01/A9999.JPG'), plan.placements[0].targetPath);
  expect('and the later one the second',
    plan.placements[1].targetPath === asThisPlatformSpellsIt('/card/2026-09-01/02/A9999.JPG'), plan.placements[1].targetPath);
  expect('the plan says how many names had to be split',
    plan.namesSplitIntoSubfolders === 1);

  const twoCopiesOfOnePhoto = buildPlan(
    [candidate('/card/100/A9999.JPG', { clock: exif('2026:09:01 10:00:00') }),
      candidate('/card/101/A9999.JPG', { clock: exif('2026:09:01 10:00:00') })],
    {}, probeOver([], [['/card/100/A9999.JPG', '/card/101/A9999.JPG']]),
  );
  expect('but two copies of one photo are not split, the second being a duplicate',
    twoCopiesOfOnePhoto.placements.map((entry) => entry.placement).join()
      === `${PLACEMENT.intoItsDayFolder},${PLACEMENT.duplicateOfAFileAlreadySorted}`,
    twoCopiesOfOnePhoto.placements.map((entry) => entry.placement).join());
  expect('and no name is reported as split',
    twoCopiesOfOnePhoto.namesSplitIntoSubfolders === 0);
}

function aFileAlreadyWhereItBelongs() {
  const alreadySorted = candidate('/card/2026-08-27/P1.JPG', { clock: exif('2026:08:27 10:00:00') });
  expect('a file already in its day folder is left alone',
    buildPlan([alreadySorted], {}, probeOver(['/card/2026-08-27/P1.JPG'])).placements[0].placement
      === PLACEMENT.alreadyInItsDayFolder);

  const inANumberedSubfolder = candidate('/card/2026-08-27/01/P1.JPG', { clock: exif('2026:08:27 10:00:00') });
  expect('so is one already in a numbered subfolder, which is not nested deeper',
    buildPlan([inANumberedSubfolder], {}, probeOver(['/card/2026-08-27/01/P1.JPG'])).placements[0].placement
      === PLACEMENT.alreadyInItsDayFolder);
}

function aFileThatRecordsNoDate() {
  const undated = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) });
  const dated = candidate('/card/DCIM/P1.JPG', {
    clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata,
  });

  const trusted = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.always }, probeOver([]));
  expect('--use-filesystem-date files an undated clip by the date the filesystem keeps',
    trusted.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName === '2026-08-27');
  expect('and says so in the counts',
    trusted.filesystemDateUseCounts.filesDatedByTheFilesystem === 1);

  const ignored = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.never }, probeOver([]));
  expect('--ignore-filesystem-date sends it to the undated folder instead',
    ignored.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName === UNDATED_FOLDER_NAME);
  expect('and counts it as left undated',
    ignored.filesystemDateUseCounts.filesLeftUndated === 1);

  const copiedLongAfterTheShoot = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 14) });
  const byDefault = buildPlan([dated, copiedLongAfterTheShoot], {}, probeOver([]));
  expect('left to itself it refuses a filesystem date that looks like the moment of a copy',
    byDefault.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName === UNDATED_FOLDER_NAME);
}

function aRawTakesTheDateOfItsJpeg() {
  const plan = buildPlan([
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/DCIM/P1.RW2'),
  ], {}, probeOver([]));

  const raw = plan.placements.find((entry) => entry.sourcePath.endsWith('.RW2'));
  expect('a raw recording no date follows the jpeg of the same shot', raw.folderName === '2026-08-27');
  expect('and is marked as having taken its date from a sibling', raw.dateSource === DATE_SOURCE.siblingFile);
}

function theSameFilesAlwaysGiveTheSamePlan() {
  // An undated file used to be ordered against a dated one by a comparison that answered
  // "after" both ways round, so this is the check that the ordering is now fixed.
  const files = [
    candidate('/card/a/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 10) }),
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/b/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 11), sizeInBytes: 2000 }),
  ];
  const folderOrderOf = (order) => buildPlan(order, {}, probeOver([]))
    .placements.map((entry) => `${entry.sourcePath}->${entry.targetPath}`).join('|');

  const oneWayRound = folderOrderOf(files);
  const theOther = folderOrderOf([...files].reverse());
  expect('the plan does not depend on the order the files were found in',
    oneWayRound === theOther, `${oneWayRound}\n${theOther}`);

  const planned = buildPlan(files, {}, probeOver([]));
  expect('and planning the same files twice plans the same thing, nothing having been mutated',
    JSON.stringify(planned) === JSON.stringify(buildPlan(files, {}, probeOver([]))));
}

// The registry only offers a reader a file its mark already matched, so a reader could in
// principle trust that and read anything it was handed. None of them does, and this is what
// says so: every reader that has a mark of its own is put to every fixture the mark refuses.
function everyReaderRefusesAFileThatIsNotItsFormat() {
  const fixtures = everyFixtureFormatIsBuiltFrom();
  const readAnyway = [];

  for (const format of FORMATS_IN_THE_ORDER_THEY_ARE_TRIED) {
    if (format.recognisedBy === null) continue;
    for (const [fixtureName, bytes] of fixtures) {
      const byteSource = byteSourceForBuffer(bytes);
      if (format.recognisedBy(byteSource)) continue;
      if (format.read(byteSource) !== null) readAnyway.push(`${format.name} read ${fixtureName}`);
    }
  }

  expect('a reader handed a file its own mark refuses reads nothing out of it',
    readAnyway.length === 0, readAnyway.slice(0, 5).join('\n'));
}

function theByteReadersHandBackNothingRatherThanGuessing() {
  const eightBytes = byteSourceForBuffer(Buffer.from([0, 0, 1, 0, 0, 0, 0, 2]));

  expect('a field of no width at all counts as zero',
    readUnsignedOfWidthAt(eightBytes, 0, 0) === 0);
  expect('a four byte field is read big endian',
    readUnsignedOfWidthAt(eightBytes, 0, BYTES_IN_A_SHORT_FIELD) === 256);
  expect('an eight byte field is read big endian too',
    readUnsignedOfWidthAt(eightBytes, 0, BYTES_IN_A_LONG_FIELD) === 0x0000010000000002);
  expect('a field of a width no format writes is refused rather than half read',
    readUnsignedOfWidthAt(eightBytes, 0, 3) === null);
  expect('an eight byte field the file is too short for is refused',
    readUnsignedOfWidthAt(byteSourceForBuffer(Buffer.alloc(4)), 0, BYTES_IN_A_LONG_FIELD) === null);

  expect('an eight byte count may be read little endian, which is how BigTIFF writes one',
    readUInt64EitherWayRoundAt(byteSourceForBuffer(Buffer.from([2, 0, 0, 0, 0, 0, 0, 0])), 0, true) === 2);
  expect('two byte wide text past the end of the file is nothing, not an empty string',
    readTwoByteWideTextAt(byteSourceForBuffer(Buffer.alloc(4)), 8, 4) === null);
}

function aClockIsBuiltOnlyFromFieldsThatWereThere() {
  expect('a clock whose year was not there to read is no clock at all',
    cameraClockFrom(null, null, null, null, null, null) === null);
  expect('a clock whose fields were all read is built from them',
    formatCameraClock(cameraClockFrom(2026, 8, 27, 10, 30, 0)) === '2026-08-27 10:30:00');
  expect('no text to read is no clock, whichever way the text would have been written',
    cameraClockFromDateWrittenOut(null) === null && cameraClockFromExifText(null) === null
    && cameraClockFromIso8601(null) === null);
  expect('a date written out with no seconds on it is read as the minute it names',
    formatCameraClock(cameraClockFromDateWrittenOut('2001/ 1/27 13:42')) === '2001-01-27 13:42:00');
  expect('a month name that is no month is not taken for one',
    cameraClockFromDateWrittenOut('Xxx, 04 Zzz 2021 05:06:07 +0000') === null);
}

function aDayFolderWithNoFreeNameLeft() {
  // Every name in the day folder and in all its numbered subfolders is taken, and none of
  // them by this photo: there is nowhere left to put it and the plan has to say so rather
  // than overwrite one of them.
  const everyNameTaken = { exists: () => true, contentsMatch: () => false };
  const plan = buildPlan([candidate('/card/DCIM/P1.JPG', { clock: exif('2026:09:01 10:00:00') })], {}, everyNameTaken);

  expect('a photo with nowhere left to go is reported as placed nowhere',
    plan.placements[0].placement === PLACEMENT.couldNotBePlaced);
  expect('and it is given no target path rather than a made up one',
    plan.placements[0].targetPath === null);
  expect('and it says why, which is what the run prints at the end',
    plan.placements[0].failureReason === NO_FREE_NAME_IN_THE_DAY_FOLDER);
  expect('a placement counted without the disk being touched counts it as failed',
    countPlacements(plan.placements).failed === 1);
}

function twoFilesAlikeInEveryWayButTheirPath() {
  // Same moment, same size: neither the clock nor the size settles the order, so the path
  // does. Without that last step the sort would be free to order them either way round.
  const shotAt = exif('2026:09:01 10:00:00');
  const inOneOrder = buildPlan([
    candidate('/card/b/SAME.JPG', { clock: shotAt }), candidate('/card/a/SAME.JPG', { clock: shotAt }),
  ], {}, probeOver([]));
  const inTheOther = buildPlan([
    candidate('/card/a/SAME.JPG', { clock: shotAt }), candidate('/card/b/SAME.JPG', { clock: shotAt }),
  ], {}, probeOver([]));

  expect('two files alike in clock and size are ordered by their path, so the plan is settled',
    inOneOrder.placements.map((entry) => entry.sourcePath).join()
      === inTheOther.placements.map((entry) => entry.sourcePath).join(),
    inOneOrder.placements.map((entry) => entry.sourcePath).join());
  expect('and the one whose path sorts first takes the first numbered subfolder',
    inOneOrder.placements[0].targetPath === asThisPlatformSpellsIt('/card/2026-09-01/01/SAME.JPG'), inOneOrder.placements[0].targetPath);
}

function aCardHoldingNothingThatRecordsItsOwnDate() {
  // Nothing on the card says when it was shot, so there is no newest shot to measure a
  // filesystem date against and no reason to distrust one.
  const nothingDated = [
    candidate('/card/DCIM/CLIP1.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) }),
    candidate('/card/DCIM/CLIP2.MTS', { fileTimestamp: new Date(2026, 7, 28, 9) }),
  ];
  const plan = buildPlan(nothingDated, {}, probeOver([]));

  expect('with no shot on the card to measure against, a filesystem date is taken as it stands',
    plan.placements.map((entry) => entry.folderName).join() === '2026-08-27,2026-08-28',
    plan.placements.map((entry) => entry.folderName).join());
  expect('and both files are counted as dated by the filesystem',
    plan.filesystemDateUseCounts.filesDatedByTheFilesystem === 2);
}

// The report is handed the lines it would print rather than a terminal, so what a run says
// can be checked without a run.
const linesPrintedBy = (report, what) => {
  const printed = [];
  const complained = [];
  report(what, { out: (line) => printed.push(line), error: (line) => complained.push(line) });
  return { printed, complained };
};

const planOf = (placements, extra = {}) => ({
  placements,
  filesystemDateUseCounts: { filesDatedByTheFilesystem: 0, filesLeftUndated: 0 },
  namesSplitIntoSubfolders: 0,
  ...extra,
});

const placedInto = (folderName, placement, sizeInBytes = 1000) => ({
  sourcePath: `/card/${folderName}.JPG`,
  targetPath: `/card/${folderName}/x.JPG`,
  folderName,
  clock: null,
  dateSource: null,
  sizeInBytes,
  placement,
  failureReason: null,
});

function whatTheRunSaysItDidToADuplicate() {
  const oneDuplicate = {
    placed: 0, alreadyInPlace: 0, duplicates: 1, failed: 0, emptyDirectoriesRemoved: 0, failures: [],
  };
  const wordingWhen = (options) =>
    linesPrintedBy(reportForATerminal, { plan: planOf([]), outcome: oneDuplicate, options }).printed.join();

  expect('a dry run that would copy says it would skip the duplicate',
    wordingWhen({ dryRun: true, moveInsteadOfCopying: false }).includes('1 duplicate to skip'));
  expect('a dry run that would move says it would drop it, the original being deleted',
    wordingWhen({ dryRun: true, moveInsteadOfCopying: true }).includes('1 duplicate to drop'));
  expect('a copy that happened says it skipped it',
    wordingWhen({ dryRun: false, moveInsteadOfCopying: false }).includes('1 duplicate skipped'));
  expect('a move that happened says it dropped it',
    wordingWhen({ dryRun: false, moveInsteadOfCopying: true }).includes('1 duplicate dropped'));

  const duplicate = placedInto('2026-08-27', PLACEMENT.duplicateOfAFileAlreadySorted);
  expect('and --verbose names the file it skipped as it goes',
    fileAsItIsPlaced(duplicate, false).endsWith('skipped, already at /card/2026-08-27/x.JPG'));
  expect('or the file it dropped, when it was moving them',
    fileAsItIsPlaced(duplicate, true).endsWith('dropped, already at /card/2026-08-27/x.JPG'));
  expect('a file already where it belongs is worth no line at all',
    fileAsItIsPlaced(placedInto('2026-08-27', PLACEMENT.alreadyInItsDayFolder), false) === null);
}

function theFolderSummaryReadsOldestDayFirst() {
  const { printed } = linesPrintedBy(reportForATerminal, {
    plan: planOf([
      placedInto('2026-08-29', PLACEMENT.intoItsDayFolder, 2048),
      placedInto('2026-08-27', PLACEMENT.intoItsDayFolder, 3 * 1024 * 1024),
      placedInto('2026-08-28', PLACEMENT.intoItsDayFolder, 512),
    ]),
    outcome: countPlacements([]),
    options: { dryRun: true, moveInsteadOfCopying: false, quiet: false, verbose: false },
  });

  expect('the days are listed oldest first however they were planned',
    printed.slice(0, 3).map((line) => line.slice(0, '2026-08-27'.length)).join()
      === '2026-08-27,2026-08-28,2026-08-29', printed.join('\n'));
  expect('a size under a kilobyte is printed as the bytes it is',
    printed[1].endsWith('512 B'), printed[1]);
  expect('and a larger one is stepped up to the unit that suits it',
    printed[0].endsWith('3.0 MB'), printed[0]);
  expect('a day holding one file says file rather than files',
    printed[0].includes('1 file '), printed[0]);
}

function theJsonSaysEverythingTheTerminalDoes() {
  const outcome = {
    placed: 1, alreadyInPlace: 0, duplicates: 0, failed: 1, emptyDirectoriesRemoved: 2,
    failures: [{ sourcePath: '/card/DCIM/P1.JPG', reason: 'EACCES' }],
  };
  const plan = planOf([placedInto('2026-08-27', PLACEMENT.intoItsDayFolder)], {
    filesystemDateUseCounts: { filesDatedByTheFilesystem: 1, filesLeftUndated: 3 },
    namesSplitIntoSubfolders: 1,
  });

  const { printed } = linesPrintedBy(reportAsJson, { plan, outcome, fileCount: 2, options: { dryRun: false } });
  const said = JSON.parse(printed.join('\n'));

  expect('the json carries the two counts the terminal draws its notes from',
    said.summary.datedByTheFilesystem === 1 && said.summary.leftUndated === 3);
  expect('and the names it had to split', said.summary.namesSplitIntoSubfolders === 1);
  expect('a failure is given both as a sentence and as the path and the reason apart',
    said.summary.errors[0] === '/card/DCIM/P1.JPG: EACCES'
    && said.summary.failures[0].reason === 'EACCES');
  expect('a file with no clock is reported as having no stamp rather than a made up one',
    said.actions[0].stamp === null);

  const quietly = { dryRun: false, moveInsteadOfCopying: false, quiet: true, verbose: false };
  const { printed: nothing, complained } = linesPrintedBy(reportForATerminal, { plan, outcome, options: quietly });

  expect('--quiet prints no summary at all', nothing.length === 0, nothing.join('\n'));
  expect('but it still says what failed, and why, on standard error',
    complained.some((line) => line.endsWith('/card/DCIM/P1.JPG: EACCES')), complained.join('\n'));
  expect('and still explains the files it left undated',
    complained.some((line) => line.includes('looks like the moment of a copy')), complained.join('\n'));
  expect('and the one name it had to split into a numbered subfolder',
    complained.some((line) => line.includes('1 file name is used by more than one photo')), complained.join('\n'));
}

const BYTES_IN_A_MEGABYTE = 1024 * 1024;
const RETURN_TO_THE_START_OF_THE_LINE = '\r';
const ERASE_TO_THE_END_OF_THE_LINE = '\x1b[K';
const THE_LINE_TAKEN_DOWN = `${RETURN_TO_THE_START_OF_THE_LINE}${ERASE_TO_THE_END_OF_THE_LINE}`;

const copying = { moveInsteadOfCopying: false, quiet: false, json: false };

const aPlacementOf = (fileName, sizeInBytes, placement = PLACEMENT.intoItsDayFolder) =>
  ({ sourcePath: asThisPlatformSpellsIt(`/card/DCIM/${fileName}`), sizeInBytes, placement });

function aTerminalWatching({ isTTY = true, columns = 120 } = {}) {
  const written = [];
  return { isTTY, columns, written, write: (text) => written.push(text) };
}
const linesDrawnOn = (terminal) => terminal.written
  .filter((text) => text !== THE_LINE_TAKEN_DOWN)
  .map((text) => text.slice(RETURN_TO_THE_START_OF_THE_LINE.length, -ERASE_TO_THE_END_OF_THE_LINE.length));
const lastLineDrawnOn = (terminal) => linesDrawnOn(terminal).at(-1);
const theBarIn = (line) => line.match(/\[[#.]*\]/)?.[0] ?? null;

const partWayThroughACopy = {
  verb: 'copying', filesDone: 1, filesInAll: 4,
  bytesDone: 3 * BYTES_IN_A_MEGABYTE, bytesInAll: 8 * BYTES_IN_A_MEGABYTE,
  millisecondsLeft: null, fileBeingWritten: 'P1000002.JPG',
};

function theProgressLineSaysHowFarTheCopyHasGot() {
  expect('part way through a copy the line gives the share done, the bar, the files, the bytes and the file',
    progressLineText(partWayThroughACopy, 120)
      === 'copying  37%  [###########...................]  1 of 4 files  3.0 MB of 8.0 MB  P1000002.JPG',
    progressLineText(partWayThroughACopy, 120));
  expect('the share is of the bytes rather than the files, a big file being a long wait',
    progressLineText({ ...partWayThroughACopy, filesDone: 1, filesInAll: 2, bytesDone: 3, bytesInAll: 4 }, 120)
      .startsWith('copying  75%'));
  expect('and of the files when every file is empty, there being no bytes to go by',
    progressLineText({ ...partWayThroughACopy, filesDone: 1, filesInAll: 2, bytesDone: 0, bytesInAll: 0 }, 120)
      .startsWith('copying  50%'));
  expect('it does not say 100% until the last byte is written',
    progressLineText({ ...partWayThroughACopy, bytesDone: 999, bytesInAll: 1000 }, 120).startsWith('copying  99%'));
  expect('one file is not called files',
    progressLineText({ ...partWayThroughACopy, filesDone: 0, filesInAll: 1 }, 120).includes('0 of 1 file '));

  const timeLeftSaid = (seconds) =>
    progressLineText({ ...partWayThroughACopy, millisecondsLeft: seconds * 1000 }, 200)
      .split('  ').find((part) => part.endsWith(' left'));
  const timesLeftAndWhatIsSaid = [
    ['a time left under a minute is not given to the second', 59, 'under a minute left'],
    ['a minute on the dot is a minute', 60, 'about 1 min left'],
    ['a longer time is given to the nearest minute', 10 * 60 + 29, 'about 10 min left'],
    ['an hour on the dot is an hour', 60 * 60, 'about 1 h left'],
    ['and a longer time still in hours and minutes', 125 * 60, 'about 2 h 5 min left'],
  ];
  for (const [whatShouldBeSaid, seconds, words] of timesLeftAndWhatIsSaid) {
    expect(whatShouldBeSaid, timeLeftSaid(seconds) === words, timeLeftSaid(seconds));
  }

  const withTheTimeLeft = { ...partWayThroughACopy, millisecondsLeft: 10 * 60 * 1000 };
  expect('the bar keeps its width when the time left joins the line, so it does not jump about',
    theBarIn(progressLineText(withTheTimeLeft, 120)) === theBarIn(progressLineText(partWayThroughACopy, 120)));

  const wrapped = [];
  for (let columns = 1; columns <= 200; columns++) {
    const line = progressLineText(withTheTimeLeft, columns);
    if (line.length > columns - 1) wrapped.push(`${columns} columns: ${line.length} characters`);
  }
  expect('at every width the line stops short of the last column, where a terminal would wrap it',
    wrapped.length === 0, wrapped.slice(0, 5).join('\n'));

  const fillingAllButTheLastColumn = progressLineText(withTheTimeLeft, 109);
  expect('a line filling every column but the last is kept whole',
    fillingAllButTheLastColumn.length === 108 && fillingAllButTheLastColumn.endsWith('P1000002.JPG'), fillingAllButTheLastColumn);
  expect('on a narrower terminal the file name gives way before the time left',
    progressLineText(withTheTimeLeft, 100).endsWith('about 10 min left'), progressLineText(withTheTimeLeft, 100));
  expect('and once one part does not fit, a shorter one after it is not slipped into the gap',
    progressLineText(withTheTimeLeft, 88).endsWith('3.0 MB of 8.0 MB'), progressLineText(withTheTimeLeft, 88));
  expect('narrower still, only the bar and the share are left',
    progressLineText(partWayThroughACopy, 40) === 'copying  37%  [###.......]', progressLineText(partWayThroughACopy, 40));
  expect('and with no room for a bar at all, just the share',
    progressLineText(partWayThroughACopy, 39) === 'copying  37%', progressLineText(partWayThroughACopy, 39));
}

function theProgressLineIsOnlyDrawnWhereSomeoneIsWatching() {
  expect('a progress line belongs on a terminal',
    aProgressLineBelongsOn({ isTTY: true }, copying) === true);
  expect('but not on a pipe or a file, which do not call themselves terminals',
    aProgressLineBelongsOn({ isTTY: undefined }, copying) === false);
  expect('nor under --quiet, which promises nothing but errors',
    aProgressLineBelongsOn({ isTTY: true }, { ...copying, quiet: true }) === false);
  expect('nor under --json, which promises a machine everything it prints',
    aProgressLineBelongsOn({ isTTY: true }, { ...copying, json: true }) === false);

  const photo = aPlacementOf('P1.JPG', BYTES_IN_A_MEGABYTE);
  const printedAnyway = [];
  for (const [whereItWouldGo, terminal, options] of [
    ['a pipe', aTerminalWatching({ isTTY: false }), copying],
    ['a terminal under --quiet', aTerminalWatching(), { ...copying, quiet: true }],
  ]) {
    const progress = progressLineFor([photo], options, terminal, () => 0);
    progress.startedOn(photo);
    progress.bytesWrittenTo(photo, BYTES_IN_A_MEGABYTE);
    progress.printAbove(() => printedAnyway.push(whereItWouldGo));
    progress.finishedWith(photo);
    progress.finish();
    expect(`nothing at all is written to ${whereItWouldGo}`, terminal.written.length === 0, terminal.written.join());
  }
  expect('while a --verbose line printed around it still gets printed',
    printedAnyway.length === 2, printedAnyway.join());

  const nothingToWrite = aTerminalWatching();
  const duplicate = aPlacementOf('P2.JPG', BYTES_IN_A_MEGABYTE, PLACEMENT.duplicateOfAFileAlreadySorted);
  const progressOverDuplicates = progressLineFor([duplicate], copying, nothingToWrite, () => 0);
  const printedForTheDuplicate = [];
  progressOverDuplicates.startedOn(duplicate);
  progressOverDuplicates.printAbove(() => printedForTheDuplicate.push('skipped'));
  progressOverDuplicates.finishedWith(duplicate);
  progressOverDuplicates.finish();
  expect('and nothing is drawn for a plan that writes no file, even as --verbose names each duplicate it skips',
    nothingToWrite.written.length === 0 && printedForTheDuplicate.length === 1, nothingToWrite.written.join());
}

const A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME = Date.UTC(2026, 7, 27, 9, 0, 0);
const MILLISECONDS_IN_A_SECOND = 1000;

function aClockStoppedAtTheStart() {
  const clock = { now: A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME };
  return {
    now: () => clock.now,
    moveTo: (millisecondsIn) => {
      clock.now = A_MOMENT_FAR_ENOUGH_FROM_ZERO_NOT_TO_BE_MISTAKEN_FOR_A_LENGTH_OF_TIME + millisecondsIn;
    },
  };
}

function theProgressLineAsTheFilesGoBy() {
  const clock = aClockStoppedAtTheStart();
  const terminal = aTerminalWatching();
  const photos = ['P1.JPG', 'P2.JPG', 'P3.JPG', 'P4.JPG'].map((fileName) => aPlacementOf(fileName, 4 * BYTES_IN_A_MEGABYTE));
  const alreadyThere = aPlacementOf('P0.JPG', 4 * BYTES_IN_A_MEGABYTE, PLACEMENT.alreadyInItsDayFolder);
  const progress = progressLineFor([alreadyThere, ...photos], copying, terminal, clock.now);

  progress.startedOn(alreadyThere);
  progress.finishedWith(alreadyThere);
  expect('a file already in place draws nothing, taking no time to place',
    terminal.written.length === 0, terminal.written.join());

  progress.startedOn(photos[0]);
  expect('the first file to be written is drawn the moment it starts, bytes counted only for what is written',
    lastLineDrawnOn(terminal) === 'copying   0%  [..............................]  0 of 4 files  0 B of 16.0 MB  P1.JPG',
    lastLineDrawnOn(terminal));
  expect('drawn over whatever the line held, from its start to its end',
    terminal.written[0].startsWith(RETURN_TO_THE_START_OF_THE_LINE) && terminal.written[0].endsWith(ERASE_TO_THE_END_OF_THE_LINE));

  clock.moveTo(99);
  progress.finishedWith(photos[0]);
  progress.startedOn(photos[1]);
  expect('a file starting less than a tenth of a second after the last redraw is not drawn again',
    terminal.written.length === 1, terminal.written.length);

  clock.moveTo(100);
  progress.finishedWith(photos[1]);
  progress.startedOn(photos[2]);
  expect('a tenth of a second on, the next file redraws it, counting the files finished',
    lastLineDrawnOn(terminal) === 'copying  50%  [###############...............]  2 of 4 files  8.0 MB of 16.0 MB  P3.JPG',
    lastLineDrawnOn(terminal));

  progress.finishedWith(photos[2]);
  clock.moveTo(2999);
  progress.printAbove(() => {});
  expect('with less than three seconds watched it makes no guess at the time left',
    !lastLineDrawnOn(terminal).includes('left'), lastLineDrawnOn(terminal));
  clock.moveTo(3000);
  progress.printAbove(() => {});
  expect('at three seconds it guesses from the rate so far: 12 MB in three seconds leaves one for the last 4 MB',
    lastLineDrawnOn(terminal).endsWith('12.0 MB of 16.0 MB  under a minute left  P3.JPG'), lastLineDrawnOn(terminal));

  progress.startedOn(photos[3]);
  progress.finishedWith(photos[3]);
  progress.finish();
  expect('when the files are done the line is taken down, leaving the terminal as it found it',
    terminal.written.at(-1) === THE_LINE_TAKEN_DOWN);
  const writesSoFar = terminal.written.length;
  progress.finish();
  expect('and taking it down twice writes nothing more', terminal.written.length === writesSoFar);

  const firstClipClock = aClockStoppedAtTheStart();
  const firstClipTerminal = aTerminalWatching();
  const firstClip = aPlacementOf('P1000001.MOV', 4000 * BYTES_IN_A_MEGABYTE);
  const firstClipProgress = progressLineFor([firstClip], copying, firstClipTerminal, firstClipClock.now);
  firstClipProgress.startedOn(firstClip);
  firstClipClock.moveTo(5 * MILLISECONDS_IN_A_SECOND);
  firstClipProgress.printAbove(() => {});
  expect('nor does it guess while nothing has been written yet, however long that has taken',
    !lastLineDrawnOn(firstClipTerminal).includes('left'), lastLineDrawnOn(firstClipTerminal));

  const slowClock = aClockStoppedAtTheStart();
  const slowTerminal = aTerminalWatching();
  const photo = aPlacementOf('P1.JPG', 500 * BYTES_IN_A_MEGABYTE);
  const longClip = aPlacementOf('P1000001.MOV', 3500 * BYTES_IN_A_MEGABYTE);
  const slowProgress = progressLineFor([photo, longClip], copying, slowTerminal, slowClock.now);
  slowProgress.startedOn(photo);
  slowClock.moveTo(10 * MILLISECONDS_IN_A_SECOND);
  slowProgress.finishedWith(photo);
  slowProgress.startedOn(longClip);
  expect('the time left is the bytes still to come at the rate so far: 3500 MB at 50 MB a second is about a minute',
    lastLineDrawnOn(slowTerminal).includes('about 1 min left'), lastLineDrawnOn(slowTerminal));

  const clipClock = aClockStoppedAtTheStart();
  const clipTerminal = aTerminalWatching();
  const bigClip = aPlacementOf('P1000001.MOV', 4000 * BYTES_IN_A_MEGABYTE);
  const nextPhoto = aPlacementOf('P1000002.JPG', 8 * BYTES_IN_A_MEGABYTE);
  const clipProgress = progressLineFor([bigClip, nextPhoto], copying, clipTerminal, clipClock.now);
  clipProgress.startedOn(bigClip);
  clipClock.moveTo(99);
  clipProgress.bytesWrittenTo(bigClip, 100 * BYTES_IN_A_MEGABYTE);
  expect('bytes of a big file written less than a tenth of a second after the last redraw do not draw again',
    linesDrawnOn(clipTerminal).length === 1, linesDrawnOn(clipTerminal).length);
  clipClock.moveTo(100);
  clipProgress.bytesWrittenTo(bigClip, 1000 * BYTES_IN_A_MEGABYTE);
  expect('a tenth of a second on, the bytes written so far move the line on while the file is still being written',
    lastLineDrawnOn(clipTerminal) === 'copying  24%  [#######.......................]  0 of 2 files  1000.0 MB of 3.9 GB  P1000001.MOV',
    lastLineDrawnOn(clipTerminal));
  clipClock.moveTo(3000);
  clipProgress.bytesWrittenTo(bigClip, 2000 * BYTES_IN_A_MEGABYTE);
  expect('and the time left is guessed from them: 2000 MB in three seconds leaves about three seconds for the rest',
    lastLineDrawnOn(clipTerminal).includes('under a minute left'), lastLineDrawnOn(clipTerminal));
  clipProgress.finishedWith(bigClip);
  clipClock.moveTo(3100);
  clipProgress.startedOn(nextPhoto);
  expect('once the file is finished its bytes are counted once, not again on top of what was reported',
    lastLineDrawnOn(clipTerminal).includes('1 of 2 files  3.9 GB of 3.9 GB'), lastLineDrawnOn(clipTerminal));

  for (const [howItFailsToSay, columns] of [['gives no width', undefined], ['says it is no columns wide', 0]]) {
    const unmeasuredTerminal = { ...aTerminalWatching(), columns };
    const moving = progressLineFor([photo], { ...copying, moveInsteadOfCopying: true }, unmeasuredTerminal, clock.now);
    moving.startedOn(photo);
    const drawn = lastLineDrawnOn(unmeasuredTerminal);
    expect(`a terminal that ${howItFailsToSay} is taken to be 80 columns, and a move says it is moving`,
      drawn.startsWith('moving ') && drawn.length < 80 && theBarIn(drawn)?.length === 80 / 4 + '[]'.length, drawn);
  }

  const whatHappened = [];
  const orderedTerminal = {
    isTTY: true, columns: 100,
    write: (text) => whatHappened.push(text === THE_LINE_TAKEN_DOWN ? 'taken down' : 'drawn'),
  };
  const verbose = progressLineFor([photo], copying, orderedTerminal, clock.now);
  verbose.printAbove(() => whatHappened.push('printed'));
  verbose.startedOn(photo);
  verbose.printAbove(() => whatHappened.push('printed'));
  verbose.finish();
  expect('a --verbose line is printed as it is while no progress line is up, and the line steps aside for it once one is',
    whatHappened.join(', ') === 'printed, drawn, taken down, printed, drawn, taken down', whatHappened.join(', '));
}

function theCommandLineIsReadWithoutStartingAProcess() {
  expect('clustered short options are each applied',
    decideWhatToDo(['-nvm', '/card']).options.dryRun === true
    && decideWhatToDo(['-nvm', '/card']).options.verbose === true
    && decideWhatToDo(['-nvm', '/card']).options.moveInsteadOfCopying === true);
  expect('an option taking a value may only end a cluster',
    decideWhatToDo(['-dn', '/library', '/card']).problem
      === "option '-d' takes a value, so it has to be the last letter of '-dn'");
  expect('--source may be given more than once',
    decideWhatToDo(['-s', '/one', '-s', '/two']).options.inputPaths.join() === '/one,/two');
  expect('a -- argument ends option parsing',
    decideWhatToDo(['--', '-not-an-option']).options.inputPaths.join() === '-not-an-option');
  expect('an option with no value left to take is refused',
    decideWhatToDo(['--dest']).problem === "option '--dest' needs a value");
  expect('--day-start outside the hours a day may start at is refused',
    decideWhatToDo(['--day-start', '24', '/card']).problem
      === '--day-start must be an hour from 0 to 23');
  expect('but every hour of the clock is one a day may start at',
    [0, 4, 12, 13, 23].every((hour) =>
      decideWhatToDo(['--day-start', String(hour), '/card']).whatToDo === WHAT_TO_DO.sort));
  expect('a day starting in the evening files the afternoon before it with the day before',
    dayFolderFor(cameraClockFrom(2026, 8, 28, 19, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-27'
    && dayFolderFor(cameraClockFrom(2026, 8, 28, 20, 0, 0), { hourTheDayStartsAt: 20 }) === '2026-08-28');
  expect('--day-start that is not a whole number is refused',
    decideWhatToDo(['--day-start', 'noon', '/card']).problem !== undefined);
  expect('naming no folder to sort is refused',
    decideWhatToDo(['-n']).problem.startsWith('name the folder to sort'));
  expect('and the refusal shows how, leading with the folder you are standing in',
    /^ {2}shotsort \. +the folder you are standing in$/m.test(decideWhatToDo(['-n']).problem)
    && /^ {2}shotsort ~\/Import +a folder named in full$/m.test(decideWhatToDo(['-n']).problem),
    decideWhatToDo(['-n']).problem);
  expect('no arguments at all asks for the usage in brief',
    decideWhatToDo([]).whatToDo === WHAT_TO_DO.printTheUsageInBrief);
  expect('--help asks for the usage in full, which is a different text',
    decideWhatToDo(['--help']).whatToDo === WHAT_TO_DO.printTheUsageInFull
    && WHAT_TO_DO.printTheUsageInFull !== WHAT_TO_DO.printTheUsageInBrief);
  expect('-h asks for the same full text as --help',
    decideWhatToDo(['-h']).whatToDo === WHAT_TO_DO.printTheUsageInFull);
  expect('-V asks for the version',
    decideWhatToDo(['-V']).whatToDo === WHAT_TO_DO.printVersion);
  expect('a well formed command line comes back as something to sort',
    decideWhatToDo(['/card']).whatToDo === WHAT_TO_DO.sort);
}

aParserReadsBytesWithNoFileUnderThem();
aFileThatStopsHalfWayIsReadAsLessThanTheWhole();
aFileGoneBadIsReadWithoutTheReaderGivingUp();
theShapesAWalkMustNotBeLedRoundForeverBy();
theFilesCarryingMoreThanAWalkLooksThrough();
theClipsOffATapeCamcorder();
theMarkOnAFileIsTheLastWordOnIt();
clocksCompareAsATotalOrder();
theDayAFileIsFiledUnder();
aMovieStampedInUtcIsNotTheCamerasClock();
aPlanIsSettledWithNoDiskInvolved();
twoPhotosOfOneDaySharingAName();
aFileAlreadyWhereItBelongs();
aFileThatRecordsNoDate();
aRawTakesTheDateOfItsJpeg();
theSameFilesAlwaysGiveTheSamePlan();
everyReaderRefusesAFileThatIsNotItsFormat();
theByteReadersHandBackNothingRatherThanGuessing();
aClockIsBuiltOnlyFromFieldsThatWereThere();
aDayFolderWithNoFreeNameLeft();
twoFilesAlikeInEveryWayButTheirPath();
aCardHoldingNothingThatRecordsItsOwnDate();
whatTheRunSaysItDidToADuplicate();
theFolderSummaryReadsOldestDayFirst();
theJsonSaysEverythingTheTerminalDoes();
theProgressLineSaysHowFarTheCopyHasGot();
theProgressLineIsOnlyDrawnWhereSomeoneIsWatching();
theProgressLineAsTheFilesGoBy();
theCommandLineIsReadWithoutStartingAProcess();

console.log(failedCheckCount === 0 ? '\n  all unit checks passed\n' : `\n  ${failedCheckCount} failed\n`);
process.exit(failedCheckCount === 0 ? 0 : 1);
