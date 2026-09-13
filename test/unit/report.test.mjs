import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT, countPlacements } from '../../src/plan.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { fileAsItIsPlaced, formatByteSize, reportAsJson, reportForATerminal } from '../../cli/report.mjs';
import { cameraClockFrom } from '../../src/clock.mjs';

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

test('what the run says it did to a duplicate', async (context) => {
  const oneDuplicate = {
    placed: 0, alreadyInPlace: 0, duplicates: 1, failed: 0, emptyDirectoriesRemoved: 0, failures: [],
  };
  const wordingWhen = (options) =>
    linesPrintedBy(reportForATerminal, { plan: planOf([]), outcome: oneDuplicate, options }).printed.join();

  await context.test('a dry run that would copy says it would skip the duplicate',
    () => assert.ok(wordingWhen({ dryRun: true, moveInsteadOfCopying: false }).includes('1 duplicate to skip')));
  await context.test('a dry run that would move says it would drop it, the original being deleted',
    () => assert.ok(wordingWhen({ dryRun: true, moveInsteadOfCopying: true }).includes('1 duplicate to drop')));
  await context.test('a copy that happened says it skipped it',
    () => assert.ok(wordingWhen({ dryRun: false, moveInsteadOfCopying: false }).includes('1 duplicate skipped')));
  await context.test('a move that happened says it dropped it',
    () => assert.ok(wordingWhen({ dryRun: false, moveInsteadOfCopying: true }).includes('1 duplicate dropped')));

  const duplicate = placedInto('2026-08-27', PLACEMENT.duplicateOfAFileAlreadySorted);
  await context.test('and --verbose names the file it skipped as it goes',
    () => assert.ok(fileAsItIsPlaced(duplicate, false).endsWith('skipped, already at /card/2026-08-27/x.JPG')));
  await context.test('or the file it dropped, when it was moving them',
    () => assert.ok(fileAsItIsPlaced(duplicate, true).endsWith('dropped, already at /card/2026-08-27/x.JPG')));
  await context.test('a file placed is named with where it went', () => assert.equal(
    fileAsItIsPlaced(placedInto('2026-08-27', PLACEMENT.intoItsDayFolder), false),
    '/card/2026-08-27.JPG -> /card/2026-08-27/x.JPG',
  ));
  await context.test('a file already where it belongs is worth no line at all',
    () => assert.equal(fileAsItIsPlaced(placedInto('2026-08-27', PLACEMENT.alreadyInItsDayFolder), false), null));
});

test('the folder summary reads oldest day first', async (context) => {
  const { printed } = linesPrintedBy(reportForATerminal, {
    plan: planOf([
      placedInto('2026-08-29', PLACEMENT.intoItsDayFolder, 2048),
      placedInto('2026-08-27', PLACEMENT.intoItsDayFolder, 3 * 1024 * 1024),
      placedInto('2026-08-28', PLACEMENT.intoItsDayFolder, 512),
    ]),
    outcome: countPlacements([]),
    options: { dryRun: true, moveInsteadOfCopying: false, quiet: false, verbose: false },
  });

  await context.test('the days are listed oldest first however they were planned', () => assert.equal(
    printed.slice(0, 3).map((line) => line.slice(0, '2026-08-27'.length)).join(),
    '2026-08-27,2026-08-28,2026-08-29',
  ));
  await context.test('a size under a kilobyte is printed as the bytes it is',
    () => assert.ok(printed[1].endsWith('512 B'), printed[1]));
  await context.test('and a larger one is stepped up to the unit that suits it',
    () => assert.ok(printed[0].endsWith('3.0 MB'), printed[0]));
  await context.test('a day holding one file says file rather than files',
    () => assert.ok(printed[0].includes('1 file '), printed[0]));
});

test('the JSON says everything the terminal does', async (context) => {
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

  await context.test('the json carries the two counts the terminal draws its notes from',
    () => assert.ok(said.summary.datedByTheFilesystem === 1 && said.summary.leftUndated === 3));
  await context.test('and the names it had to split', () => assert.equal(said.summary.namesSplitIntoSubfolders, 1));
  await context.test('a failure is given both as a sentence and as the path and the reason apart', () => assert.ok(
    said.summary.errors[0] === '/card/DCIM/P1.JPG: EACCES'
    && said.summary.failures[0].reason === 'EACCES',
  ));
  await context.test('a file with no clock is reported as having no stamp rather than a made up one',
    () => assert.equal(said.actions[0].stamp, null));

  const datedEveryWay = planOf(Object.values(DATE_SOURCE).map((dateSource) => ({
    ...placedInto('2026-08-27', PLACEMENT.intoItsDayFolder), dateSource,
  })));
  const saidOfEachSource = JSON.parse(
    linesPrintedBy(reportAsJson, { plan: datedEveryWay, outcome, fileCount: 4, options: { dryRun: false } }).printed.join('\n'),
  );
  const everyVerdict = planOf(Object.values(PLACEMENT).map((placement) => placedInto('2026-08-27', placement)));
  await context.test('and so is each verdict', () => assert.deepEqual(
    JSON.parse(linesPrintedBy(reportAsJson, { plan: everyVerdict, outcome, fileCount: 4, options: { dryRun: false } }).printed.join('\n'))
      .actions.map((action) => action.verdict),
    ['place', 'in place', 'duplicate', 'failed'],
  ));
  await context.test('where each date came from is spelled the way a script reading the json was told it would be', () => assert.deepEqual(
    saidOfEachSource.actions.map((action) => action.dateFrom),
    ['exif', 'video', 'sibling', 'file-timestamp'],
  ));

  const quietly = { dryRun: false, moveInsteadOfCopying: false, quiet: true, verbose: false };
  const { printed: nothing, complained } = linesPrintedBy(reportForATerminal, { plan, outcome, options: quietly });

  await context.test('--quiet prints no summary at all', () => assert.deepEqual(nothing, []));
  await context.test('but it still says what failed, and why, on standard error',
    () => assert.ok(complained.some((line) => line.endsWith('/card/DCIM/P1.JPG: EACCES')), complained.join('\n')));
  await context.test('and still explains the files it left undated', () => assert.ok(
    complained.some((line) => line.includes('looks like the moment of a copy')),
    complained.join('\n'),
  ));
  await context.test('and the one name it had to split into a numbered subfolder', () => assert.ok(
    complained.some((line) => line.includes('1 file name is used by more than one photo')),
    complained.join('\n'),
  ));
});

test('the lines a terminal is given', async (context) => {
  const dated = (folderName, sizeInBytes, dateSource = DATE_SOURCE.exifMetadata) => ({ ...placedInto(folderName, PLACEMENT.intoItsDayFolder, sizeInBytes), dateSource });
  const plan = planOf([dated('2026-08-27', 2048), dated('2026-08-27', 1024, DATE_SOURCE.fileTimestamp), dated('undated', 500)], {
    filesystemDateUseCounts: { filesDatedByTheFilesystem: 1, filesLeftUndated: 1 }, namesSplitIntoSubfolders: 2,
  });
  const everythingHappened = { placed: 3, alreadyInPlace: 1, duplicates: 2, failed: 1, emptyDirectoriesRemoved: 1, failures: [] };
  const asCopied = { dryRun: false, moveInsteadOfCopying: false, quiet: false, verbose: false };
  const { printed, complained } = linesPrintedBy(reportForATerminal, { plan, outcome: everythingHappened, options: asCopied });

  await context.test('each day folder gets a line, marked where it holds a file dated by the filesystem, then what happened', () => assert.deepEqual(printed, [
    '2026-08-27 ~     2 files     3.0 KB',
    'undated          1 file       500 B',
    '3 copied, 1 already in place, 2 duplicates skipped, 1 empty folder removed, 1 failed',
  ]));
  await context.test('and standard error is told what the marks and the undated and numbered folders mean', () => assert.deepEqual(complained, [
    'shotsort: ~ marks days holding 1 file(s) that record no date inside themselves, filed by their filesystem date',
    "shotsort: 1 file(s) record no date inside themselves and their filesystem date looks like the moment of a copy rather than a shooting time, so they went to undated/. Re-copy the card with 'ditto', 'cp -p' or 'rsync -a' to keep the real times, or pass --use-filesystem-date to take them as they are.",
    'shotsort: 2 file names are used by more than one photo on the same day; each photo went into a numbered subfolder of that day, oldest first',
  ]));

  const linesFor = (outcome, options) => linesPrintedBy(reportForATerminal, {
    plan: planOf([]), outcome: { alreadyInPlace: 0, duplicates: 0, failed: 0, emptyDirectoriesRemoved: 0, failures: [], ...outcome }, options: { ...asCopied, ...options },
  });
  const outcomeLineFor = (outcome, options) => linesFor(outcome, options).printed;
  await context.test('no file dated by the filesystem, left undated or split into a subfolder means nothing on standard error',
    () => assert.deepEqual(linesFor({ placed: 0 }, {}).complained, []));
  await context.test('nothing that did not happen is mentioned, and an empty plan has no folder lines', () => assert.deepEqual(outcomeLineFor({ placed: 0 }, {}), ['0 copied']));
  await context.test('a dry run says what it would do', () => assert.deepEqual(
    [outcomeLineFor({ placed: 1 }, { dryRun: true }), outcomeLineFor({ placed: 1, duplicates: 1, emptyDirectoriesRemoved: 2 }, { dryRun: true, moveInsteadOfCopying: true })],
    [['1 to copy  (dry run)'], ['1 to move, 1 duplicate to drop, 2 empty folders removed  (dry run)']],
  ));
  await context.test('a move says it moved', () => assert.deepEqual(outcomeLineFor({ placed: 2, duplicates: 1 }, { moveInsteadOfCopying: true }), ['2 moved, 1 duplicate dropped']));
});

test('a size as a person reads it', async (context) => {
  await context.test('is given in the largest unit it fills, up to terabytes and no further', () => assert.deepEqual(
    [0, 1023, 1024, 1024 ** 2, 1024 ** 4, 1024 ** 5].map(formatByteSize),
    ['0 B', '1023 B', '1.0 KB', '1.0 MB', '1.0 TB', '1024.0 TB'],
  ));
});

test('the json stamp of a file with a clock', async (context) => {
  const withAClock = { ...placedInto('2026-08-27', PLACEMENT.intoItsDayFolder), clock: cameraClockFrom(2026, 8, 27, 10, 30, 0) };
  const outcome = { placed: 1, alreadyInPlace: 0, duplicates: 0, failed: 0, emptyDirectoriesRemoved: 0, failures: [] };
  await context.test('is the clock written out', () => assert.equal(
    JSON.parse(linesPrintedBy(reportAsJson, { plan: planOf([withAClock]), outcome, fileCount: 1, options: { dryRun: false } }).printed.join('\n')).actions[0].stamp,
    '2026-08-27 10:30:00',
  ));
});
