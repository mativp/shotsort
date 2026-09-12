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
  jpegFileBehindAsManySegmentsAsAPhotoReallyHas, jpegFilePaddedTo, TIFF_VALUE_TYPE_LONG,
  pngStill, pngStillDatedOnlyInItsText, pngStillDatedOnlyByWhenItWasLastWritten, webPStill, jpegXlStill,
  digitalVideoClip, redcodeClip,
  aviFileRecordingWhenItWasShot, aviFileSayingOnlyWhenItWasCreated, matroskaMovie, windowsMediaMovie,
  movieFile, canonRawFile, fujifilmRawFile, heifStill, bigTiffFile,
  movieFileSayingWhichZoneItsClockIsIn, movieFileCarryingACanonThumbnail, movieFileWithAnAppleCreationDate,
  minoltaRawFile, canonCiffRawFile, sigmaRawFile,
} from './fixtures.mjs';
import { readCameraClockFromFile } from '../src/formats/registry.mjs';
import { formatCameraClock } from '../src/clock.mjs';
import { NO_FREE_NAME_IN_THE_DAY_FOLDER, PLACEMENT, UNDATED_FOLDER_NAME } from '../src/plan.mjs';
import { applyPlan } from '../src/apply.mjs';
import { destinationProbeOverTheFilesystem } from '../src/destination.mjs';
import { FILESYSTEM_DATE_USE } from '../src/dating.mjs';
import { DATE_SOURCE } from '../src/dateSource.mjs';

// The parsers answer with a camera clock record now; these checks still read as the
// stamp a camera would have written, so they go on comparing the text of one.
const clockTextOf = (filePath) => {
  const found = readCameraClockFromFile(filePath, fs.statSync(filePath).size);
  return found === null ? null : formatCameraClock(found.clock);
};
const clockFoundIn = (filePath) => readCameraClockFromFile(filePath, fs.statSync(filePath).size);

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const COMMAND = path.join(testDirectory, '..', 'bin', 'shotsort.mjs');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'shotsort-'));

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

// The enum check walks the tree rather than naming files, so moving a module cannot
// quietly take it out of the check's reach.
function everySourceFileUnder(projectRoot) {
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((directoryEntry) => {
    const relativePath = path.relative(projectRoot, path.join(directory, directoryEntry.name));
    if (directoryEntry.isDirectory()) return walk(path.join(directory, directoryEntry.name));
    return directoryEntry.name.endsWith('.mjs') ? [relativePath] : [];
  });
  return ['bin', 'cli', 'src'].flatMap((topLevel) => walk(path.join(projectRoot, topLevel)));
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
    return clockFoundIn(filePath);
  };

  expect('a jpeg whose first marker carries no length is still read',
    formatCameraClock(dateOf('restart.jpg', jpegFileWithARestartMarkerFirst('2026:07:04 08:00:00')).clock) === '2026-07-04 08:00:00');
  expect('a movie box declaring that it runs to the end of the file is still read',
    formatCameraClock(dateOf('to-the-end.mp4', movieFileWhoseMovieBoxRunsToTheEnd('2026-07-04 10:00:00')).clock) === '2026-07-04 10:00:00');
  expect('a jpeg hiding its exif behind more segments than are worth walking gives up rather than hanging',
    dateOf('buried.jpg', jpegFileBuriedUnderManySegments('2026:07:04 09:00:00')) === null);

  const unreadable = path.join(dump, 'unreadable.jpg');
  writeFixtureFile(unreadable, jpegFile('2026:07:04 11:00:00'));
  fs.chmodSync(unreadable, 0o000);
  expect('a file that cannot be opened reports no date rather than throwing',
    clockFoundIn(unreadable) === null);
  fs.chmodSync(unreadable, 0o644);
}

function theRawEveryMakerWrites() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'brands-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return clockTextOf(filePath);
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
  expect('a raw whose signature belongs to no maker this knows is still read, the way exiftool reads one',
    dateOf('DSC_0004.IIQ', tiffFile({ signature: 0x4949, dateTimeOriginal: '2026:08:27 09:08:00' }))
    === '2026-08-27 09:08:00');
  expect('a big tiff pointing at its exif with a narrow offset is read whichever way round its bytes are',
    dateOf('L1000003.DNG', bigTiffFile('2026:08:27 09:09:00', { bigEndian: true, pointerType: TIFF_VALUE_TYPE_LONG }))
    === '2026-08-27 09:09:00');
  expect('a photo carrying the segments a colour managed photo really carries is read',
    dateOf('P1010001.JPG', jpegFileBehindAsManySegmentsAsAPhotoReallyHas('2026:08:27 09:10:00'))
    === '2026-08-27 09:10:00');
}

// Everything that is neither a TIFF, a JPEG nor a box tree. These are the formats a
// camera, a phone or a camcorder writes that used to leave a file undated.
function theFormatsThatAreBuiltSomeOtherWay() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'other-shapes-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return clockTextOf(filePath);
  };

  const eachOne = [
    ['a screenshot carrying exif', 'IMG_0100.PNG', pngStill('2026:08:27 10:00:00'), '2026-08-27 10:00:00'],
    ['a png dated only in its text', 'scan.PNG', pngStillDatedOnlyInItsText('Thu, 27 Aug 2026 10:01:00 +0000'), '2026-08-27 10:01:00'],
    ['a webp off a phone', 'IMG_0101.WEBP', webPStill('2026:08:27 10:02:00'), '2026-08-27 10:02:00'],
    ['a jpeg xl', 'IMG_0102.JXL', jpegXlStill('2026:08:27 10:03:00'), '2026-08-27 10:03:00'],
    ['an avi recording when it was shot', 'MVI_0103.AVI', aviFileRecordingWhenItWasShot('Thu Aug 27 10:04:00 2026'), '2026-08-27 10:04:00'],
    ['an avi saying only when it was created', 'MVI_0104.AVI', aviFileSayingOnlyWhenItWasCreated('2026-08-27 10:05:00'), '2026-08-27 10:05:00'],
    ['a matroska recording', 'CLIP0105.MKV', matroskaMovie('2026-08-27 10:06:00'), '2026-08-27 10:06:00'],
    ['a windows media clip', 'CLIP0106.WMV', windowsMediaMovie('2026-08-27 10:07:00'), '2026-08-27 10:07:00'],
    ['a tape camcorder clip', 'CLIP0107.DV', digitalVideoClip('2026-08-27 10:08:00'), '2026-08-27 10:08:00'],
    ['a cinema camera take', 'A001_C001.R3D', redcodeClip('2026-08-27 10:10:00'), '2026-08-27 10:10:00'],
    ['a cinema camera take whose header does not say where its directory is', 'A001_C002.R3D',
      redcodeClip('2026-08-27 10:11:00', { headerSaysWhereTheDirectoryIs: false }), '2026-08-27 10:11:00'],
    ['a png dated only by when it was written', 'export.PNG', pngStillDatedOnlyByWhenItWasLastWritten('2026-08-27 10:09:00'), '2026-08-27 10:09:00'],
  ];
  for (const [whatItIs, fileName, contents, whenItWasShot] of eachOne) {
    expect(`${whatItIs} is read for the date inside it`, dateOf(fileName, contents) === whenItWasShot);
  }

  expect('a png with nothing in it to go on is left undated rather than guessed at',
    dateOf('blank.PNG', pngStillDatedOnlyInItsText('no date here at all')) === null);
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

function theContainersThatHoldTheirExifSomewhereElse() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'containers-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return clockTextOf(filePath);
  };
  const shotAt = '2026:08:27 09:07:01';
  const whenItWasShot = '2026-08-27 09:07:01';

  expect('a Canon CR3 is read from the Exif Canon buries in moov/uuid/CMT2',
    dateOf('IMG_0001.CR3', canonRawFile(shotAt)) === whenItWasShot);
  expect('a Canon CRM, which is the same container, is read the same way',
    dateOf('A001C001.CRM', canonRawFile(shotAt)) === whenItWasShot);
  expect('a Fujifilm RAF is read from the JPEG its header points at',
    dateOf('DSCF0001.RAF', fujifilmRawFile(shotAt)) === whenItWasShot);

  const heifShapes = [
    ['the usual shape', {}],
    ['an item location written the older way, without a construction method', { itemLocationVersion: 0 }],
    ['long item ids throughout', { itemLocationVersion: 2, itemEntryVersion: 3 }],
    ['a payload that does not spell out the Exif marker', { spellsOutTheExifMarker: false }],
  ];
  heifShapes.forEach(([whatIsUnusualAboutIt, shape], shapeIndex) => {
    expect(`a HEIF still is read for its date, with ${whatIsUnusualAboutIt}`,
      dateOf(`IMG_100${shapeIndex}.HIF`, heifStill(shotAt, shape)) === whenItWasShot);
  });

  expect('a BigTIFF raw is read, its counts and offsets being eight bytes wide rather than four',
    dateOf('L1000001.DNG', bigTiffFile(shotAt)) === whenItWasShot);
  expect('and the same file written most significant byte first',
    dateOf('L1000002.DNG', bigTiffFile(shotAt, { bigEndian: true })) === whenItWasShot);
}

function theRawFormatsThatPredateTiff() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'legacy-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return clockTextOf(filePath);
  };
  const whenItWasShot = '2026-08-27 09:07:01';

  expect('a Minolta MRW is read from the TIFF block it wraps',
    dateOf('PICT0001.MRW', minoltaRawFile('2026:08:27 09:07:01')) === whenItWasShot);
  expect('a Canon CRW is read from the capture time in its CIFF heap, nested directory and all',
    dateOf('CRW_0001.CRW', canonCiffRawFile(whenItWasShot)) === whenItWasShot);
  expect('a Sigma X3F is read from the TIME property in its property list',
    dateOf('SDIM0001.X3F', sigmaRawFile(whenItWasShot)) === whenItWasShot);

  const aCrwThatIsNotReallyOne = Buffer.alloc(128);
  aCrwThatIsNotReallyOne.write('II', 0, 'latin1');
  aCrwThatIsNotReallyOne.writeUInt32LE(26, 2);
  aCrwThatIsNotReallyOne.write('HEAPCCDR', 6, 'latin1');
  expect('a CIFF file holding no capture time reports none rather than inventing one',
    dateOf('CRW_0002.CRW', aCrwThatIsNotReallyOne) === null);
  expect('and a Sigma raw whose directory pointer leads nowhere does the same',
    dateOf('SDIM0002.X3F', Buffer.concat([Buffer.from('FOVb', 'latin1'), Buffer.alloc(60, 9)])) === null);
}

function videoFiledByTheClockTheCameraWasSetTo() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'video-clocks-'));
  const dateOf = (fileName, contents) => {
    const filePath = path.join(dump, fileName);
    writeFixtureFile(filePath, contents);
    return clockTextOf(filePath);
  };
  const theClockOnTheCamera = '2026-08-27 09:07:01';
  const theSameMomentInUtc = '2026-08-27 07:07:01';

  expect('a clip whose movie header is in UTC is filed by the local time its user data spells out',
    dateOf('MVI_0001.MOV', movieFileSayingWhichZoneItsClockIsIn(theSameMomentInUtc, '2026-08-27T09:07:01+0200'))
      === theClockOnTheCamera);
  expect('a Canon clip is filed by the Exif in the thumbnail Canon stores beside the video',
    dateOf('MVI_0002.MOV', movieFileCarryingACanonThumbnail(theSameMomentInUtc, '2026:08:27 09:07:01'))
      === theClockOnTheCamera);
  expect('an iPhone clip is filed by the creation date Apple writes into its metadata keys',
    dateOf('IMG_0003.MP4', movieFileWithAnAppleCreationDate(theSameMomentInUtc, '2026-08-27T09:07:01+0200'))
      === theClockOnTheCamera);

  expect('a spelled-out date that says only that it is UTC is passed over, leaving the movie header to answer',
    dateOf('MVI_0004.MOV', movieFileSayingWhichZoneItsClockIsIn(theClockOnTheCamera, '2026-08-27T09:07:01Z'))
      === theClockOnTheCamera);
  expect('a clip that spells out no zone at all is still read from its movie header, as Panasonic clips are',
    dateOf('P1000005.MP4', movieFile(theClockOnTheCamera)) === theClockOnTheCamera);
}

function aRawAndItsJpegOnDifferentCards() {
  const twoSlots = fs.mkdtempSync(path.join(temporaryDirectory, 'two-slots-'));
  const rawOn = (slot, name, contents) => writeFixtureFile(path.join(twoSlots, slot, 'DCIM', '100NC_Z9', name), contents);

  rawOn('SLOT1', 'DSC_0001.HSP', Buffer.alloc(64, 1));
  rawOn('SLOT2', 'DSC_0001.JPG', jpegFile('2026:08:27 09:07:01'));
  const plan = runCommand(['-n', '--json', twoSlots]);
  expect('a file with no date of its own takes it from its twin on the other card slot',
    folderChosenFor(plan.standardOutput, 'DSC_0001.HSP') === '2026-08-27', plan.standardOutput);

  const twoCameras = fs.mkdtempSync(path.join(temporaryDirectory, 'two-cameras-'));
  writeFixtureFile(path.join(twoCameras, 'A', 'DSC_0001.JPG'), jpegFile('2026:08:27 09:07:01'));
  writeFixtureFile(path.join(twoCameras, 'B', 'DSC_0001.JPG'), jpegFile('2026:09:14 18:00:00'));
  writeFixtureFile(path.join(twoCameras, 'C', 'DSC_0001.HSP'), Buffer.alloc(64, 2));

  const guessed = runCommand(['-n', '--json', '--ignore-filesystem-date', twoCameras]);
  expect('but when two cameras used that name on different days it guesses at neither',
    folderChosenFor(guessed.standardOutput, 'DSC_0001.HSP') === UNDATED_FOLDER_NAME, guessed.standardOutput);
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

function theSummaryTheUserReads() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'summary-'));
  const shotAt = (day, hour) => `2026:01:${String(day).padStart(2, '0')} ${String(hour).padStart(2, '0')}:00:00`;

  writeFixtureFile(path.join(dump, 'a', 'BYTES.JPG'), jpegFilePaddedTo(shotAt(1, 10), 512));
  writeFixtureFile(path.join(dump, 'a', 'EDGE.JPG'), jpegFilePaddedTo(shotAt(2, 10), 1023));
  writeFixtureFile(path.join(dump, 'a', 'ONEKB.JPG'), jpegFilePaddedTo(shotAt(3, 10), 1024));
  writeFixtureFile(path.join(dump, 'a', 'HALF.JPG'), jpegFilePaddedTo(shotAt(4, 10), 1536));
  writeFixtureFile(path.join(dump, 'a', 'PAIR1.JPG'), jpegFilePaddedTo(shotAt(5, 10), 1024));
  writeFixtureFile(path.join(dump, 'a', 'PAIR2.JPG'), jpegFilePaddedTo(shotAt(5, 11), 1024));
  writeFixtureFile(path.join(dump, 'a', 'NODATE.HSP'), Buffer.alloc(2048, 3), new Date('2026-01-06T10:00:00'));

  const rows = runCommand(['-n', dump]).standardOutput.split('\n').filter((line) => /^\d{4}-/.test(line));
  const rowFor = (day) => rows.find((line) => line.startsWith(day)) ?? `(no row for ${day})`;

  expect('a size under a kilobyte is shown as whole bytes',
    /\s512 B$/.test(rowFor('2026-01-01')), rowFor('2026-01-01'));
  expect('one byte below a kilobyte is still shown as bytes',
    /\s1023 B$/.test(rowFor('2026-01-02')), rowFor('2026-01-02'));
  expect('exactly a kilobyte steps up to KB with one decimal',
    /\s1\.0 KB$/.test(rowFor('2026-01-03')), rowFor('2026-01-03'));
  expect('a size between units keeps its one decimal',
    /\s1\.5 KB$/.test(rowFor('2026-01-04')), rowFor('2026-01-04'));
  expect('a day holding one file says file, not files',
    / {4}1 file {2}/.test(rowFor('2026-01-01')), rowFor('2026-01-01'));
  expect('a day holding two says files, and their sizes are added',
    / {4}2 files/.test(rowFor('2026-01-05')) && /\s2\.0 KB$/.test(rowFor('2026-01-05')),
    rowFor('2026-01-05'));
  expect('a day dated only by the filesystem is marked with a tilde',
    /^2026-01-06 ~ /.test(rowFor('2026-01-06')), rowFor('2026-01-06'));
  expect('a day whose files carry their own dates is not marked',
    /^2026-01-01 {2}/.test(rowFor('2026-01-01')), rowFor('2026-01-01'));
  expect('the rows run oldest first',
    JSON.stringify(rows.map((line) => line.slice(0, 10)))
      === JSON.stringify([...rows.map((line) => line.slice(0, 10))].sort()),
    rows.map((line) => line.slice(0, 10)).join(' '));
  expect('every row is aligned to the same width',
    new Set(rows.map((line) => line.indexOf(' file'))).size === 1,
    rows.join('\n'));
}

function theVerbsInTheClosingLine() {
  const forRun = (commandArguments) => {
    const dump = freshCardDump('verbs');
    return runCommand([...commandArguments, dump]).standardOutput.trim().split('\n').pop();
  };
  expect('copying is what a plain run reports',
    /^11 copied$/.test(forRun([])), forRun([]));
  expect('moving is what --move reports',
    /^11 moved,/.test(forRun(['-m'])), forRun(['-m']));
  expect('a dry run says it would copy, not that it did',
    /^11 to copy {2}\(dry run\)$/.test(forRun(['-n'])), forRun(['-n']));
  expect('a dry run with --move says it would move',
    /^11 to move {2}\(dry run\)$/.test(forRun(['-n', '-m'])), forRun(['-n', '-m']));
}

function theQuietAndVerboseSwitches() {
  const quietly = freshCardDump('quiet');
  const quietRun = runCommand(['-q', quietly]);
  expect('--quiet prints nothing at all on a run that succeeds',
    quietRun.standardOutput === '' && quietRun.exitCode === EXIT_EVERYTHING_PLACED,
    JSON.stringify(quietRun.standardOutput));
  expect('and still does the sorting',
    fs.existsSync(path.join(quietly, '2026-08-27', 'P1000002.JPG')));

  const clustered = freshCardDump('clustered');
  const clusteredRun = runCommand(['-nq', clustered]);
  expect('clustered short options combine, so -nq is -n and -q together',
    clusteredRun.standardOutput === ''
    && clusteredRun.exitCode === EXIT_EVERYTHING_PLACED
    && fs.existsSync(path.join(clustered, 'DCIM', '100_PANA', 'P1000001.JPG')),
    JSON.stringify(clusteredRun.standardOutput));

  const longForm = freshCardDump('long-form-dry-run');
  const longFormRun = runCommand(['--dry-run', longForm]);
  expect('--dry-run spelled out does the same as -n',
    /\(dry run\)$/m.test(longFormRun.standardOutput)
    && fs.existsSync(path.join(longForm, 'DCIM', '100_PANA', 'P1000001.JPG')),
    longFormRun.standardOutput);

  const valueLast = freshCardDump('value-last');
  const valueLastDestination = path.join(temporaryDirectory, 'value-last-library');
  const valueLastRun = runCommand(['-nd', valueLastDestination, valueLast]);
  expect('a value-taking short option may end a cluster, so -nd DIR is -n -d DIR',
    /\(dry run\)$/m.test(valueLastRun.standardOutput) && valueLastRun.exitCode === EXIT_EVERYTHING_PLACED,
    valueLastRun.standardOutput + valueLastRun.standardError);

  const valueNotLast = runCommand(['-sn', valueLast]);
  expect('but a value-taking short option in the middle of a cluster is refused, not silently ignored',
    valueNotLast.exitCode === EXIT_BAD_COMMAND_LINE
    && /option '-s' takes a value, so it has to be the last letter of '-sn'/.test(valueNotLast.standardError),
    valueNotLast.standardError);

  const clusteredVerbose = freshCardDump('clustered-verbose');
  const verboseRun = runCommand(['-vm', clusteredVerbose]);
  expect('and -vm is -v and -m together',
    verboseRun.standardOutput.split('\n').filter((line) => line.includes(' -> ')).length === 11
    && !fs.existsSync(path.join(clusteredVerbose, 'DCIM')),
    verboseRun.standardOutput.slice(0, 200));
}

function theFoldersLeftBehind() {
  const copied = freshCardDump('tidy-copy');
  const emptyOnTheCard = path.join(copied, 'DCIM', '103_PANA');
  fs.mkdirSync(emptyOnTheCard, { recursive: true });
  const copiedLibrary = path.join(temporaryDirectory, 'tidy-copy-library');
  runCommand(['-s', copied, '-d', copiedLibrary]);
  expect('copying leaves every source folder standing, the already-empty ones included',
    fs.existsSync(emptyOnTheCard) && fs.existsSync(path.join(copied, 'DCIM', '100_PANA')),
    JSON.stringify(filesUnder(copied)));

  const moved = freshCardDump('tidy-move');
  runCommand(['--move', moved]);
  expect('moving removes the folders it emptied',
    !fs.existsSync(path.join(moved, 'DCIM')));
  expect('but never the folder you named, even once nothing of ours is left in it',
    fs.existsSync(moved));

  const emptiedEntirely = fs.mkdtempSync(path.join(temporaryDirectory, 'sole-'));
  writeFixtureFile(path.join(emptiedEntirely, 'ONLY.JPG'), jpegFile('2026:04:02 08:00:00'));
  const elsewhere = path.join(temporaryDirectory, 'sole-library');
  runCommand(['--move', '-s', emptiedEntirely, '-d', elsewhere]);
  expect('and a source folder the move empties completely is still left standing',
    fs.existsSync(emptiedEntirely) && fs.existsSync(path.join(elsewhere, '2026-04-02', 'ONLY.JPG')),
    `${fs.existsSync(emptiedEntirely)} / ${JSON.stringify(filesUnder(elsewhere))}`);
}

function foldersTheWalkMustNotEnter() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'skip-'));
  const shot = '2026:04:03 09:00:00';
  writeFixtureFile(path.join(dump, 'DCIM', 'KEEP.JPG'), jpegFile(shot));
  for (const skipped of ['.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN']) {
    writeFixtureFile(path.join(dump, skipped, 'IGNORED.JPG'), jpegFile('1999:01:01 00:00:00'));
  }
  writeFixtureFile(path.join(dump, 'holiday.', 'TAKEN.JPG'), jpegFile(shot));

  runCommand(['--move', dump]);
  const sorted = filesUnder(dump).filter((sortedPath) => sortedPath.startsWith('2026-'));

  expect('a system folder is skipped even when its name does not start with a dot',
    !sorted.some((sortedPath) => sortedPath.endsWith('IGNORED.JPG')), JSON.stringify(sorted));
  expect('every one of those folders keeps its own file where it was',
    ['.Spotlight-V100', '.Trashes', 'System Volume Information', '$RECYCLE.BIN']
      .every((skipped) => fs.existsSync(path.join(dump, skipped, 'IGNORED.JPG'))));
  expect('a folder whose name merely ends with a dot is walked like any other',
    sorted.includes('2026-04-03/TAKEN.JPG') && sorted.includes('2026-04-03/KEEP.JPG'),
    JSON.stringify(sorted));
}

function tellingTwoPhotosApartByTheirBytes() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'same-size-'));
  const shot = '2026:04:04 10:00:00';
  const onePhoto = jpegFilePaddedTo(shot, 900);
  const another = Buffer.from(onePhoto);
  another[another.length - 1] = 0xAB;

  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'SAME.JPG'), onePhoto);
  writeFixtureFile(path.join(dump, 'DCIM', '101_PANA', 'SAME.JPG'), another);
  runCommand(['--move', dump]);

  expect('two photos of identical size but different bytes are kept apart, not collapsed',
    JSON.stringify(visibleFilesUnder(dump))
      === JSON.stringify(['2026-04-04/01/SAME.JPG', '2026-04-04/02/SAME.JPG']),
    JSON.stringify(visibleFilesUnder(dump)));

  const fresh = fs.mkdtempSync(path.join(temporaryDirectory, 'incoming-'));
  const standingLibrary = path.join(temporaryDirectory, 'standing-library');
  writeFixtureFile(path.join(standingLibrary, '2026-04-04', 'SAME.JPG'), jpegFilePaddedTo(shot, 1200));
  writeFixtureFile(path.join(fresh, 'DCIM', 'SAME.JPG'), onePhoto);
  runCommand(['--move', '-s', fresh, '-d', standingLibrary]);
  expect('a file already in the library under that name, but a different size, is a clash not a duplicate',
    JSON.stringify(filesUnder(standingLibrary))
      === JSON.stringify(['2026-04-04/01/SAME.JPG', '2026-04-04/SAME.JPG']),
    JSON.stringify(filesUnder(standingLibrary)));

  const twins = fs.mkdtempSync(path.join(temporaryDirectory, 'twins-'));
  writeFixtureFile(path.join(twins, 'DCIM', '100_PANA', 'SAME.JPG'), onePhoto);
  writeFixtureFile(path.join(twins, 'DCIM', '101_PANA', 'SAME.JPG'), Buffer.from(onePhoto));
  runCommand(['--move', twins]);
  expect('while two copies of one photo collapse to a single file',
    JSON.stringify(visibleFilesUnder(twins)) === JSON.stringify(['2026-04-04/SAME.JPG']),
    JSON.stringify(visibleFilesUnder(twins)));
}

function matchingTheShotWhateverTheCase() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'case-'));
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'P1000009.JPG'), jpegFile('2026:04:05 11:00:00'));
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'p1000009.rw2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }));

  runCommand(['--move', dump]);
  expect('a raw matches its jpeg whatever case the card wrote the names in',
    visibleFilesUnder(dump).includes('2026-04-05/p1000009.rw2'),
    JSON.stringify(visibleFilesUnder(dump)));

  const ambiguous = fs.mkdtempSync(path.join(temporaryDirectory, 'ambiguous-'));
  for (const [folder, shot] of [['100_PANA', '2026:04:05 09:00:00'], ['101_PANA', '2026:04:09 15:00:00']]) {
    writeFixtureFile(path.join(ambiguous, 'DCIM', folder, 'IMG_0001.JPG'), jpegFile(shot));
    writeFixtureFile(path.join(ambiguous, 'DCIM', folder, 'img_0001.rw2'),
      tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }));
  }
  runCommand(['--move', ambiguous]);
  expect('and where one name is used on two days, each raw takes the date of its own folder',
    JSON.stringify(visibleFilesUnder(ambiguous)) === JSON.stringify([
      '2026-04-05/IMG_0001.JPG', '2026-04-05/img_0001.rw2',
      '2026-04-09/IMG_0001.JPG', '2026-04-09/img_0001.rw2',
    ]), JSON.stringify(visibleFilesUnder(ambiguous)));
}

function theEdgeOfTrustingTheFilesystem() {
  const dayOfTheShoot = '2026:04:06 12:00:00';
  const newestShot = new Date('2026-04-06T12:00:00').getTime();
  const hours = (howMany) => new Date(newestShot + howMany * 60 * 60 * 1000);

  const dumpFor = (name, stampedAt) => {
    const dump = fs.mkdtempSync(path.join(temporaryDirectory, `${name}-`));
    writeFixtureFile(path.join(dump, 'DCIM', 'DATED.JPG'), jpegFile(dayOfTheShoot));
    writeFixtureFile(path.join(dump, 'DCIM', 'UNDATED.HSP'), Buffer.alloc(64, 3), stampedAt);
    runCommand(['--move', dump]);
    return visibleFilesUnder(dump);
  };

  expect('a filesystem date 36 hours after the newest shot is still trusted',
    dumpFor('edge-in', hours(36)).some((sortedPath) => /^2026-04-0[78]\/UNDATED\.HSP$/.test(sortedPath)),
    JSON.stringify(dumpFor('edge-in2', hours(36))));
  expect('one minute past that it is treated as the moment of a copy',
    dumpFor('edge-out', new Date(newestShot + 36 * 60 * 60 * 1000 + 60000))
      .includes('undated/UNDATED.HSP'),
    JSON.stringify(dumpFor('edge-out2', new Date(newestShot + 36 * 60 * 60 * 1000 + 60000))));
}

function recognisingAFolderItAlreadySortedInto() {
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'resort-'));
  const shot = '2026:04:07 13:00:00';
  writeFixtureFile(path.join(dump, 'DCIM', '100_PANA', 'CLASH.JPG'), jpegFilePaddedTo(shot, 800));
  writeFixtureFile(path.join(dump, 'DCIM', '101_PANA', 'CLASH.JPG'), jpegFilePaddedTo(shot, 900));
  runCommand(['--move', dump]);

  const afterFirstRun = visibleFilesUnder(dump);
  expect('a clash lands in two numbered subfolders',
    JSON.stringify(afterFirstRun)
      === JSON.stringify(['2026-04-07/01/CLASH.JPG', '2026-04-07/02/CLASH.JPG']),
    JSON.stringify(afterFirstRun));

  const secondRun = runCommand(['--move', dump]);
  expect('and sorting again recognises those numbered subfolders rather than nesting deeper',
    /2 already in place/.test(secondRun.standardOutput)
    && JSON.stringify(visibleFilesUnder(dump)) === JSON.stringify(afterFirstRun),
    secondRun.standardOutput + JSON.stringify(visibleFilesUnder(dump)));
}

function theCountsInTheNotes() {
  const dump = freshCardDump('counts');
  const run = runCommand(['-n', dump]);
  expect('the tilde note counts the files dated from the filesystem, and there are two',
    /shotsort: ~ marks days holding 2 file\(s\)/.test(run.standardError), run.standardError);

  const clashing = fs.mkdtempSync(path.join(temporaryDirectory, 'clash-count-'));
  const shot = '2026:04:08 14:00:00';
  for (const [folder, size] of [['100_PANA', 800], ['101_PANA', 900], ['102_PANA', 1000]]) {
    writeFixtureFile(path.join(clashing, 'DCIM', folder, 'DUP.JPG'), jpegFilePaddedTo(shot, size));
    writeFixtureFile(path.join(clashing, 'DCIM', folder, 'OTHER.JPG'), jpegFilePaddedTo(shot, size + 1));
  }
  const clashRun = runCommand(['-n', clashing]);
  expect('the subfolder note counts the names that clashed, and there are two',
    /shotsort: 2 file names are used by more than one photo/.test(clashRun.standardError), clashRun.standardError);
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
  expect("and shows '.' for the folder you are standing in, which has to be named like any other",
    /^ {2}shotsort \. +the folder you are standing in$/m.test(refusedFor(['-n'])), refusedFor(['-n']));

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

  expect('running it with no arguments prints the brief on standard output',
    bareInvocation.standardOutput.startsWith('Usage: shotsort') && bareInvocation.standardError === '',
    bareInvocation.standardOutput.slice(0, 120) + bareInvocation.standardError);
  // What someone who typed the name came for: the three things anyone does with it, said
  // for the folder they are in and for one named somewhere else.
  const shownInTheBrief = (command) => new RegExp(`^ +${command.replace(/[.\\/-]/g, '\\$&')} *(?: |$)`, 'm')
    .test(bareInvocation.standardOutput);
  expect('the brief shows previewing, copying and moving, both here and between two folders',
    ['shotsort -n .', 'shotsort .', 'shotsort -m .',
      'shotsort -n -s ~/Import -d ~/Pictures/2026',
      'shotsort -s ~/Import -d ~/Pictures/2026',
      'shotsort -m ~/Import -d ~/Pictures/2026'].every(shownInTheBrief),
    bareInvocation.standardOutput);
  expect('and it is brief: no manual, and it says where the manual is',
    !bareInvocation.standardOutput.includes('Exit status:')
    && bareInvocation.standardOutput.length < askedForHelp.standardOutput.length / 2
    && /--help/.test(bareInvocation.standardOutput),
    `${bareInvocation.standardOutput.length} against ${askedForHelp.standardOutput.length}`);
  // A brief that named an option the full text did not would be the two drifting apart.
  const optionsNamedIn = (text) => new Set(text.match(/(?<![-\w])--[a-z][a-z-]+/g) ?? []);
  const optionsInTheFullText = optionsNamedIn(askedForHelp.standardOutput);
  const onlyInTheBrief = [...optionsNamedIn(bareInvocation.standardOutput)]
    .filter((option) => !optionsInTheFullText.has(option));
  expect('every option the brief names is in the full text too',
    onlyInTheBrief.length === 0, onlyInTheBrief.join(', '));
  expect('running it with no arguments exits 2, having been asked to do nothing',
    bareInvocation.exitCode === EXIT_BAD_COMMAND_LINE, String(bareInvocation.exitCode));
  expect('--help prints the whole manual instead, and exits 0, having been asked for it',
    askedForHelp.standardOutput !== bareInvocation.standardOutput
    && (askedForHelp.standardOutput.match(/^ {2,6}-/gm) ?? []).length >= 9
    && askedForHelp.standardOutput.includes('Examples:')
    && askedForHelp.standardOutput.includes('Exit status:')
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

// Every way carrying out a plan can go wrong, which is the half of the program a real disk
// will not perform on demand: a rename that crosses a disk boundary, a copy that comes up
// short, a target that appeared between the plan and the move. The filesystem is handed in
// wrapped, so the failure is exactly the one being asked about and everything else is the
// real thing happening in a real directory.
const aFilesystemThat = (whatItDoesDifferently) => ({ ...fs, ...whatItDoesDifferently });
const throwing = (code) => () => {
  throw Object.assign(new Error(`pretend ${code}`), { code });
};

function anEntryFor(sourcePath, targetPath, placement) {
  return {
    sourcePath,
    targetPath,
    folderName: '2026-08-27',
    clock: null,
    dateSource: null,
    sizeInBytes: fs.existsSync(sourcePath) ? fs.statSync(sourcePath).size : 0,
    fileTimestamp: new Date(2026, 7, 27, 9, 7, 1),
    placement,
    failureReason: placement === PLACEMENT.couldNotBePlaced ? NO_FREE_NAME_IN_THE_DAY_FOLDER : null,
  };
}

function aDirectoryHolding(name, files) {
  const directory = fs.mkdtempSync(path.join(temporaryDirectory, `${name}-`));
  for (const [relativePath, contents] of Object.entries(files)) {
    writeFixtureFile(path.join(directory, relativePath), contents);
  }
  return directory;
}

function aMoveOntoAnotherDisk() {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('another-disk', { 'DCIM/P1.JPG': photo });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');

  // rename is what fails when the destination is on another disk, and the only thing that
  // does: the copy and the delete that stand in for it are the real ones.
  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], {
    moveInsteadOfCopying: true,
    filesystem: aFilesystemThat({ renameSync: throwing('EXDEV') }),
  });

  expect('a move onto another disk is carried out as a copy and a delete',
    outcome.placed === 1 && outcome.failed === 0, JSON.stringify(outcome));
  expect('and the photo arrives whole',
    fs.existsSync(target) && fs.readFileSync(target).equals(photo));
  expect('and the original is gone, which is what makes it a move',
    !fs.existsSync(source));
  expect('and the file keeps the time it was shot rather than the time it was copied',
    Math.abs(fs.statSync(target).mtime.getTime() - new Date(2026, 7, 27, 9, 7, 1).getTime()) < 1000,
    String(fs.statSync(target).mtime));
}

function aCopyOntoAnotherDiskThatCameUpShort() {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('short-copy', { 'DCIM/P1.JPG': photo });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');

  // The copy lands, but the card is pulled before it is whole: the file at the far end is
  // shorter than the one it came from, and the original must survive that.
  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], {
    moveInsteadOfCopying: true,
    filesystem: aFilesystemThat({
      renameSync: throwing('EXDEV'),
      statSync: (askedAbout, ...rest) => (askedAbout === target
        ? { size: fs.statSync(askedAbout, ...rest).size - 1 }
        : fs.statSync(askedAbout, ...rest)),
    }),
  });

  expect('a copy that came up short is counted as a failure rather than as a move',
    outcome.placed === 0 && outcome.failed === 1, JSON.stringify(outcome));
  expect('and it says what went wrong in words, there being no error code to give',
    outcome.failures[0].reason === 'copy was incomplete, original left untouched',
    outcome.failures[0].reason);
  expect('the half written copy is taken away rather than left to look like the photo',
    !fs.existsSync(target));
  expect('and the original is still on the card',
    fs.existsSync(source) && fs.readFileSync(source).equals(photo));
}

function aTargetThatAppearedAfterThePlanWasMade() {
  const disk = aDirectoryHolding('target-appeared', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    '2026-08-27/P1.JPG': jpegFile('2026:08:27 18:00:00'),
  });
  const source = path.join(disk, 'DCIM', 'P1.JPG');
  const target = path.join(disk, '2026-08-27', 'P1.JPG');
  const somethingElseThere = fs.readFileSync(target);

  const outcome = applyPlan([anEntryFor(source, target, PLACEMENT.intoItsDayFolder)], { moveInsteadOfCopying: true });

  expect('a move onto a name that filled up after the plan was made is refused',
    outcome.failed === 1 && outcome.failures[0].reason === 'EEXIST', JSON.stringify(outcome));
  expect('and neither the photo that was there nor the one being moved is lost',
    fs.readFileSync(target).equals(somethingElseThere) && fs.existsSync(source));
}

function aRenameThatFailedForSomeOtherReason() {
  const disk = aDirectoryHolding('rename-refused', { 'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01') });
  const source = path.join(disk, 'DCIM', 'P1.JPG');

  const outcome = applyPlan(
    [anEntryFor(source, path.join(disk, '2026-08-27', 'P1.JPG'), PLACEMENT.intoItsDayFolder)],
    { moveInsteadOfCopying: true, filesystem: aFilesystemThat({ renameSync: throwing('EACCES') }) },
  );

  expect('a rename refused for any reason but a disk boundary is reported, not copied around',
    outcome.failed === 1 && outcome.failures[0].reason === 'EACCES', JSON.stringify(outcome));
  expect('and the original is left where it was',
    fs.existsSync(source));
}

function whatIsCountedWithoutAnythingBeingWritten() {
  const disk = aDirectoryHolding('counted', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/P2.JPG': jpegFile('2026:08:27 10:00:00'),
    '2026-08-27/P3.JPG': jpegFile('2026:08:27 11:00:00'),
  });
  const named = [];
  const outcome = applyPlan([
    anEntryFor(path.join(disk, 'DCIM', 'P1.JPG'), null, PLACEMENT.couldNotBePlaced),
    anEntryFor(path.join(disk, '2026-08-27', 'P3.JPG'), path.join(disk, '2026-08-27', 'P3.JPG'),
      PLACEMENT.alreadyInItsDayFolder),
    anEntryFor(path.join(disk, 'DCIM', 'P2.JPG'), path.join(disk, '2026-08-27', 'P2.JPG'),
      PLACEMENT.duplicateOfAFileAlreadySorted),
  ], { moveInsteadOfCopying: true, onFilePlaced: (entry) => named.push(path.basename(entry.sourcePath)) });

  expect('a photo the plan found nowhere for is counted as failed, with the reason the plan gave',
    outcome.failed === 1 && outcome.failures[0].reason === NO_FREE_NAME_IN_THE_DAY_FOLDER,
    JSON.stringify(outcome.failures));
  expect('a photo already in its day folder is counted as being in place',
    outcome.alreadyInPlace === 1);
  expect('and --verbose names it, nothing having been written for it',
    named.includes('P3.JPG'), named.join());
  expect('a duplicate is dropped from the card when files are being moved',
    outcome.duplicates === 1 && !fs.existsSync(path.join(disk, 'DCIM', 'P2.JPG')));
  expect('and the photo it duplicates is left alone',
    fs.existsSync(path.join(disk, '2026-08-27', 'P3.JPG')));
  expect('a photo the plan found nowhere for is not named as placed',
    !named.includes('P1.JPG'), named.join());
}

function tidyingUpFoldersItCannotRead() {
  const disk = aDirectoryHolding('tidying', { 'DCIM/100/P1.JPG': jpegFile('2026:08:27 09:07:01') });
  fs.unlinkSync(path.join(disk, 'DCIM', '100', 'P1.JPG'));

  const cannotBeRead = applyPlan([], {
    moveInsteadOfCopying: true,
    directoriesToTidy: [disk],
    filesystem: aFilesystemThat({ readdirSync: throwing('EACCES') }),
  });
  expect('a folder that cannot be read is left alone rather than bringing the run down',
    cannotBeRead.emptyDirectoriesRemoved === 0);

  const cannotBeRemoved = applyPlan([], {
    moveInsteadOfCopying: true,
    directoriesToTidy: [disk],
    filesystem: aFilesystemThat({ rmdirSync: throwing('ENOTEMPTY') }),
  });
  expect('nor does a folder that will not be removed',
    cannotBeRemoved.emptyDirectoriesRemoved === 0 && fs.existsSync(path.join(disk, 'DCIM', '100')));

  const tidied = applyPlan([], { moveInsteadOfCopying: true, directoriesToTidy: [disk] });
  expect('and the folders the card emptied out are taken away once they can be',
    tidied.emptyDirectoriesRemoved === 2 && !fs.existsSync(path.join(disk, 'DCIM')), JSON.stringify(tidied));
  expect('while the folder the user named is kept, empty or not',
    fs.existsSync(disk));

  expect('a copy run tidies nothing, every original still being where it was',
    applyPlan([], { moveInsteadOfCopying: false, directoriesToTidy: [disk] }).emptyDirectoriesRemoved === 0);
}

// Permissions are the one thing a Windows runner will not honour: chmod there leaves a
// folder readable and writable, so the checks that turn on being refused say so rather
// than failing for a reason that is not the program's.
const THE_FILESYSTEM_HONOURS_PERMISSIONS = process.platform !== 'win32';

function namingOneFileRatherThanAFolder() {
  const disk = aDirectoryHolding('one-file', {
    'DCIM/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/notes.txt': Buffer.from('not a photo'),
  });
  const onePhoto = path.join(disk, 'DCIM', 'P1.JPG');

  const sorted = runCommand([onePhoto]);
  expect('a single photo may be named instead of a folder',
    sorted.exitCode === EXIT_EVERYTHING_PLACED, sorted.standardOutput + sorted.standardError);
  expect('and its day folder is made beside it rather than under it',
    fs.existsSync(path.join(disk, 'DCIM', '2026-08-27', 'P1.JPG')),
    filesUnder(disk).join('\n'));

  const notAPhoto = runCommand([path.join(disk, 'DCIM', 'notes.txt')]);
  expect('a named file that is no kind of photo or video is nothing to sort',
    notAPhoto.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && /no photos or video found/.test(notAPhoto.standardError), notAPhoto.standardError);

  const missing = runCommand([path.join(disk, 'DCIM', 'NOT-THERE.JPG')]);
  expect('a folder or file that is not there is reported with its path and its reason',
    missing.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND
    && missing.standardError.includes('NOT-THERE.JPG') && /ENOENT/.test(missing.standardError),
    missing.standardError);
}

function aFolderTheWalkIsNotAllowedInto() {
  if (!THE_FILESYSTEM_HONOURS_PERMISSIONS) {
    expect('skipped: this filesystem does not refuse a folder to its owner', true);
    return;
  }
  const disk = aDirectoryHolding('unreadable-subfolder', {
    'DCIM/100/P1.JPG': jpegFile('2026:08:27 09:07:01'),
    'DCIM/101/P2.JPG': jpegFile('2026:08:28 09:07:01'),
  });
  const shut = path.join(disk, 'DCIM', '101');
  fs.chmodSync(shut, 0o000);

  const sorted = runCommand(['-n', disk]);
  expect('a folder the walk is not allowed into is stepped over rather than bringing the run down',
    sorted.exitCode === EXIT_EVERYTHING_PLACED && /2026-08-27/.test(sorted.standardOutput)
    && !/2026-08-28/.test(sorted.standardOutput), sorted.standardOutput + sorted.standardError);

  fs.chmodSync(shut, 0o700);
}

function askingTheDiskWhetherTwoFilesAreTheSamePhoto() {
  const photo = jpegFile('2026:08:27 09:07:01');
  const disk = aDirectoryHolding('same-photo', {
    'a/P1.JPG': photo,
    'b/P1.JPG': photo,
    'c/P1.JPG': jpegFile('2026:08:27 18:00:00'),
    'short/P1.JPG': photo.subarray(0, photo.length - 1),
  });
  const at = (relativePath) => path.join(disk, relativePath);
  const probe = destinationProbeOverTheFilesystem();

  expect('a path with nothing at it is not there', !probe.exists(at('a/NOTHING.JPG')));
  expect('and one with a file at it is', probe.exists(at('a/P1.JPG')));

  expect('two files of the same bytes are the same photo',
    probe.contentsMatch(at('a/P1.JPG'), at('b/P1.JPG'), photo.length));
  expect('and the answer does not depend on which of the two is asked about first',
    probe.contentsMatch(at('b/P1.JPG'), at('a/P1.JPG'), photo.length));
  expect('two files of the same length but different bytes are not',
    !probe.contentsMatch(at('a/P1.JPG'), at('c/P1.JPG'), photo.length));
  expect('nor are two of different lengths',
    !probe.contentsMatch(at('a/P1.JPG'), at('short/P1.JPG'), photo.length));
  expect('and a file that is not there is no photo to match',
    !probe.contentsMatch(at('a/P1.JPG'), at('a/NOTHING.JPG'), photo.length));
}

// A raw file is tens of megabytes and is compared a megabyte at a time, so the loop that
// walks it in chunks only ever runs once on anything a fixture is small enough to be.
// These two are built large enough to make it go round more than once.
const BYTES_COMPARED_PER_READ = 1024 * 1024;

function comparingTwoFilesLargerThanOneRead() {
  const disk = fs.mkdtempSync(path.join(temporaryDirectory, 'chunked-'));
  const longer = path.join(disk, 'longer.JPG');
  const shorter = path.join(disk, 'shorter.JPG');
  const stopsPartWay = path.join(disk, 'stops-part-way.JPG');

  const firstMegabyte = Buffer.alloc(BYTES_COMPARED_PER_READ, 0x41);
  fs.writeFileSync(longer, Buffer.concat([firstMegabyte, Buffer.alloc(BYTES_COMPARED_PER_READ, 0x42)]));
  fs.writeFileSync(shorter, Buffer.concat([firstMegabyte, Buffer.alloc(BYTES_COMPARED_PER_READ / 2, 0x42)]));
  fs.writeFileSync(stopsPartWay, firstMegabyte);

  const probe = destinationProbeOverTheFilesystem();
  const sizeOfTheShorter = fs.statSync(shorter).size;

  expect('a file that runs out part way through the one it is compared against is not the same photo',
    !probe.contentsMatch(longer, shorter, sizeOfTheShorter));
  expect('nor is one that stops before the comparison has read as far as it was told to',
    !probe.contentsMatch(stopsPartWay, longer, fs.statSync(longer).size));
  expect('and two files longer than a single read that do match are still found to match',
    probe.contentsMatch(longer, longer, fs.statSync(longer).size));
}

function aFileThatCannotBeOpenedAtAll() {
  expect('a file that is not there is read as no date rather than throwing',
    readCameraClockFromFile(path.join(temporaryDirectory, 'not-there-at-all.JPG'), 1000) === null);
}

function aCardWithNothingOnItAndAMachineReadingTheAnswer() {
  const empty = fs.mkdtempSync(path.join(temporaryDirectory, 'empty-card-'));
  const asJson = runCommand(['--json', empty]);

  expect('an empty card still answers in json when json was asked for',
    asJson.exitCode === EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND, asJson.standardOutput + asJson.standardError);
  const said = JSON.parse(asJson.standardOutput);
  expect('and the answer says plainly that it found nothing',
    said.summary.found === 0 && said.actions.length === 0, asJson.standardOutput);
  expect('rather than printing a sentence a script would have to read',
    asJson.standardError === '', asJson.standardError);
}

function installedWithoutItsManifest() {
  // npm always installs the manifest; a copy made by hand may not. Asked its version then,
  // it has nowhere to read one from and has to say so rather than fall over.
  const installation = fs.mkdtempSync(path.join(temporaryDirectory, 'no-manifest-'));
  const projectRoot = path.join(testDirectory, '..');
  for (const directory of ['bin', 'cli', 'src']) {
    fs.cpSync(path.join(projectRoot, directory), path.join(installation, directory), { recursive: true });
  }

  const asked = spawnSync('node', [path.join(installation, 'bin', 'shotsort.mjs'), '--version'], { encoding: 'utf8' });
  expect('a copy installed without its manifest says its version is unknown rather than failing',
    asked.status === EXIT_EVERYTHING_PLACED && asked.stdout.trim() === 'unknown',
    `${asked.status}: ${asked.stdout}${asked.stderr}`);

  const withTheManifest = runCommand(['--version']);
  expect('and a proper installation says the version the manifest gives',
    withTheManifest.stdout === undefined || /^\d+\.\d+\.\d+$/.test(withTheManifest.standardOutput.trim()),
    withTheManifest.standardOutput);
}

// A pipe holds a limited amount before a write to it blocks, so this has to be a listing
// too long to fit in one: a shorter one lands in the pipe whole and the reader going away
// is never noticed.
const FILES_ENOUGH_TO_FILL_A_PIPE = 700;

function outputCutOffBySomethingReadingIt() {
  // `shotsort --json card | head -1` closes the pipe the moment it has its line. Writing to
  // a pipe nobody is reading is an error, and one the run must take as its cue to stop
  // rather than as a fault to report.
  if (process.platform === 'win32') {
    expect('skipped: this shell does not pipe the way the check needs', true);
    return;
  }
  const dump = fs.mkdtempSync(path.join(temporaryDirectory, 'cut-off-'));
  for (let fileNumber = 0; fileNumber < FILES_ENOUGH_TO_FILL_A_PIPE; fileNumber++) {
    writeFixtureFile(path.join(dump, `P${String(fileNumber).padStart(7, '0')}.JPG`),
      jpegFile('2026:08:27 09:07:01'));
  }

  // pipefail so the answer is the program's own rather than the exit status of whatever
  // was reading it.
  const pipeline = spawnSync('bash', ['-c',
    `set -o pipefail; node ${JSON.stringify(COMMAND)} --json -n ${JSON.stringify(dump)} | head -1`],
  { encoding: 'utf8' });

  expect('output cut off by something reading only the start of it is not an error',
    pipeline.status === EXIT_EVERYTHING_PLACED, `status ${pipeline.status}, signal ${pipeline.signal}: ${pipeline.stderr}`);
  expect('and nothing is said about the broken pipe',
    !/EPIPE/.test(pipeline.stderr ?? ''), pipeline.stderr);
}

function everyEnumMemberTheCodeRefersToExists() {
  const enumsByName = { PLACEMENT, FILESYSTEM_DATE_USE, DATE_SOURCE };
  const projectRoot = path.join(testDirectory, '..');
  const sourceFiles = everySourceFileUnder(projectRoot);
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

// The refactor's whole point was that some modules decide things and others touch the
// disk, and that the two sets do not overlap. A boundary nothing checks is a boundary that
// drifts, so this is the check.
function theModulesThatMustNotTouchTheDisk() {
  const projectRoot = path.join(testDirectory, '..');
  const mustStayPure = [
    'src/clock.mjs', 'src/plan.mjs', 'src/dating.mjs', 'src/extensions.mjs', 'src/dateSource.mjs',
    'cli/options.mjs', 'cli/report.mjs', 'cli/usage.mjs',
    ...everySourceFileUnder(projectRoot).filter((relativePath) => relativePath.startsWith('src/formats/')),
  ];
  const reachesForTheDisk = /from 'node:fs'|require\('node:fs'\)|\bfs\./;

  const impure = mustStayPure.filter((relativePath) => {
    const sourceText = fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
    // registry.mjs opens the file it was asked about; that is its whole job, and it does it
    // through the one helper in bytes.mjs rather than reaching for fs itself.
    return reachesForTheDisk.test(sourceText);
  });
  expect('the modules that decide things never touch the disk themselves',
    impure.length === 0, `reach for fs: ${impure.join(', ')}`);

  const onlyTheseMayUseFs = ['src/bytes.mjs', 'src/scan.mjs', 'src/apply.mjs', 'src/destination.mjs', 'bin/shotsort.mjs'];
  const unexpected = everySourceFileUnder(projectRoot)
    .filter((relativePath) => /from 'node:fs'/.test(fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')))
    .filter((relativePath) => !onlyTheseMayUseFs.includes(relativePath));
  expect('and only the modules whose job is the disk import it at all',
    unexpected.length === 0, `unexpectedly import fs: ${unexpected.join(', ')}`);

  const planSource = fs.readFileSync(path.join(projectRoot, 'src', 'plan.mjs'), 'utf8');
  expect('planning asks the disk nothing except through the probe it was handed',
    /probe\.exists/.test(planSource) && /probe\.contentsMatch/.test(planSource) && !/existsSync/.test(planSource));
}

function theDocumentationSaysTheSameAsTheProgram() {
  const programSource = fs.readFileSync(path.join(testDirectory, '..', 'cli', 'options.mjs'), 'utf8');
  const longOptions = [...programSource.matchAll(/optionName === '(--[a-z-]+)'/g)].map(([, option]) => option);
  const shortOptions = [...programSource.matchAll(/letter === '([a-zA-Z0-9])'/g)].map(([, letter]) => `-${letter}`);
  const everyOption = [...new Set([...longOptions, ...shortOptions])];

  const projectRoot = path.join(testDirectory, '..');
  const manualPageAsPlainText = fs.readFileSync(path.join(projectRoot, 'man', 'shotsort.1'), 'utf8')
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
theModulesThatMustNotTouchTheDisk();
theDocumentationSaysTheSameAsTheProgram();
sortingACardDumpInPlace();
twoPhotosOnOneDaySharingAName();
twoCardFoldersReusingTheSameFileNumber();
nothingIsWrittenUntilTheWholePlanIsSettled();
containersThatAreLegalButUnusual();
theRawEveryMakerWrites();
theFormatsThatAreBuiltSomeOtherWay();
aCardFromAnotherMakerSortsToo();
theContainersThatHoldTheirExifSomewhereElse();
theRawFormatsThatPredateTiff();
videoFiledByTheClockTheCameraWasSetTo();
aRawAndItsJpegOnDifferentCards();
whenTheFilesystemRefuses();
theCameraClockIsTheOnlyClock();
aCardCopiedWithoutPreservingTimes();
theOtherWaysToRunIt();
theSummaryTheUserReads();
theVerbsInTheClosingLine();
theQuietAndVerboseSwitches();
theFoldersLeftBehind();
foldersTheWalkMustNotEnter();
tellingTwoPhotosApartByTheirBytes();
matchingTheShotWhateverTheCase();
theEdgeOfTrustingTheFilesystem();
recognisingAFolderItAlreadySortedInto();
theCountsInTheNotes();
theCommandLineItself();
aMoveOntoAnotherDisk();
aCopyOntoAnotherDiskThatCameUpShort();
aTargetThatAppearedAfterThePlanWasMade();
aRenameThatFailedForSomeOtherReason();
whatIsCountedWithoutAnythingBeingWritten();
tidyingUpFoldersItCannotRead();
namingOneFileRatherThanAFolder();
aFolderTheWalkIsNotAllowedInto();
askingTheDiskWhetherTwoFilesAreTheSamePhoto();
comparingTwoFilesLargerThanOneRead();
aFileThatCannotBeOpenedAtAll();
aCardWithNothingOnItAndAMachineReadingTheAnswer();
installedWithoutItsManifest();
outputCutOffBySomethingReadingIt();

fs.rmSync(temporaryDirectory, { recursive: true, force: true });
console.log(failedCheckCount === 0 ? '\n  all checks passed\n' : `\n  ${failedCheckCount} failed\n`);
process.exit(failedCheckCount === 0 ? EXIT_EVERYTHING_PLACED : EXIT_SOMETHING_FAILED_OR_NOTHING_FOUND);
