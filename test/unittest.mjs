#!/usr/bin/env node
// What the seams bought: these run with no disk under them at all. A format reader is
// handed a Buffer, and the planner is handed a probe that answers from a plain object, so
// a plan can be checked for what it decided rather than for the files it left behind.
import { jpegFile, movieFile, tiffFile, PANASONIC_RAW_SIGNATURE } from './fixtures.mjs';
import { byteSourceForBuffer } from '../src/bytes.mjs';
import { readCameraClockFromByteSource } from '../src/formats/registry.mjs';
import {
  compareCameraClocks, cameraClockFromExifText, cameraClockFromIso8601, dayFolderFor,
  formatCameraClock, layoutIsUsable,
} from '../src/clock.mjs';
import { DATE_SOURCE } from '../src/dateSource.mjs';
import { FILESYSTEM_DATE_USE } from '../src/dating.mjs';
import { PLACEMENT, UNDATED_FOLDER_NAME, buildPlan } from '../src/plan.mjs';
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
const probeOver = (pathsThatExist, sameBytes = []) => ({
  exists: (candidatePath) => pathsThatExist.includes(candidatePath),
  contentsMatch: (firstPath, secondPath) =>
    sameBytes.some((group) => group.includes(firstPath) && group.includes(secondPath)),
});

const candidate = (filePath, { clock = null, dateSource = null, sizeInBytes = 1000, fileTimestamp = new Date(2026, 7, 27, 12) } = {}) =>
  ({ path: filePath, sortRoot: '/card', sizeInBytes, fileTimestamp, clock, dateSource });

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
    plan.placements[0].targetPath === '/card/2026-08-27/P1.JPG');
  expect('a --dest sends the day folders elsewhere',
    buildPlan([candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00') })],
      { destination: '/library' }, probeOver([])).placements[0].targetPath === '/library/2026-08-27/P1.JPG');
}

function twoPhotosOfOneDaySharingAName() {
  const morning = candidate('/card/100/A9999.JPG', { clock: exif('2026:09:01 10:00:00'), sizeInBytes: 1000 });
  const evening = candidate('/card/101/A9999.JPG', { clock: exif('2026:09:01 18:00:00'), sizeInBytes: 1000 });
  const plan = buildPlan([evening, morning], {}, probeOver([]));

  expect('the earlier photo takes the first numbered subfolder',
    plan.placements[0].targetPath === '/card/2026-09-01/01/A9999.JPG', plan.placements[0].targetPath);
  expect('and the later one the second',
    plan.placements[1].targetPath === '/card/2026-09-01/02/A9999.JPG', plan.placements[1].targetPath);
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
    decideWhatToDo(['--day-start', '13', '/card']).problem
      === '--day-start must be an hour from 0 to 12');
  expect('--day-start that is not a whole number is refused',
    decideWhatToDo(['--day-start', 'noon', '/card']).problem !== undefined);
  expect('naming no folder to sort is refused',
    decideWhatToDo(['-n']).problem.startsWith('name the folder to sort'));
  expect('no arguments at all asks for the usage',
    decideWhatToDo([]).whatToDo === WHAT_TO_DO.printUsage);
  expect('--help asks for the usage',
    decideWhatToDo(['--help']).whatToDo === WHAT_TO_DO.printUsage);
  expect('-V asks for the version',
    decideWhatToDo(['-V']).whatToDo === WHAT_TO_DO.printVersion);
  expect('a well formed command line comes back as something to sort',
    decideWhatToDo(['/card']).whatToDo === WHAT_TO_DO.sort);
}

aParserReadsBytesWithNoFileUnderThem();
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
theCommandLineIsReadWithoutStartingAProcess();

console.log(failedCheckCount === 0 ? '\n  all unit checks passed\n' : `\n  ${failedCheckCount} failed\n`);
process.exit(failedCheckCount === 0 ? 0 : 1);
