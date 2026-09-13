import test from 'node:test';
import assert from 'node:assert/strict';
import { PLACEMENT, countPlacements } from '../../src/plan.mjs';
import { fileAsItIsPlaced, reportAsJson, reportForATerminal } from '../../cli/report.mjs';

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
