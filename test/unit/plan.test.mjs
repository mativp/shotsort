import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraClockFromExifText as exif } from '../../src/clock.mjs';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { NO_FREE_NAME_IN_THE_DAY_FOLDER, PLACEMENT, buildPlan, countPlacements } from '../../src/plan.mjs';
import { asThisPlatformSpellsIt, candidate, probeOver } from '../support/inMemory.mjs';

test('a plan is settled with no disk involved', async (context) => {
  const plan = buildPlan([
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/DCIM/P2.JPG', { clock: exif('2026:08:28 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
  ], {}, probeOver([]));

  await context.test('each file is planned into the folder of its own day',
    () => assert.equal(plan.placements.map((entry) => entry.folderName).join(), '2026-08-27,2026-08-28'));
  await context.test('and every one of them is planned to be placed',
    () => assert.ok(plan.placements.every((entry) => entry.placement === PLACEMENT.intoItsDayFolder)));
  await context.test('the target path is the day folder under the card it came from',
    () => assert.equal(plan.placements[0].targetPath, asThisPlatformSpellsIt('/card/2026-08-27/P1.JPG')));
  await context.test('a --dest sends the day folders elsewhere', () => assert.equal(
    buildPlan([candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00') })],
      { destination: '/library' }, probeOver([])).placements[0].targetPath,
    asThisPlatformSpellsIt('/library/2026-08-27/P1.JPG'),
  ));
});

test('planning two photos of one day that share a name', async (context) => {
  const morning = candidate('/card/100/A9999.JPG', { clock: exif('2026:09:01 10:00:00'), sizeInBytes: 1000 });
  const evening = candidate('/card/101/A9999.JPG', { clock: exif('2026:09:01 18:00:00'), sizeInBytes: 1000 });
  const plan = buildPlan([evening, morning], {}, probeOver([]));

  await context.test('the earlier photo takes the first numbered subfolder',
    () => assert.equal(plan.placements[0].targetPath, asThisPlatformSpellsIt('/card/2026-09-01/01/A9999.JPG')));
  await context.test('and the later one the second',
    () => assert.equal(plan.placements[1].targetPath, asThisPlatformSpellsIt('/card/2026-09-01/02/A9999.JPG')));
  await context.test('the plan says how many names had to be split',
    () => assert.equal(plan.namesSplitIntoSubfolders, 1));

  const twoCopiesOfOnePhoto = buildPlan(
    [candidate('/card/100/A9999.JPG', { clock: exif('2026:09:01 10:00:00') }),
      candidate('/card/101/A9999.JPG', { clock: exif('2026:09:01 10:00:00') })],
    {}, probeOver([], [['/card/100/A9999.JPG', '/card/101/A9999.JPG']]),
  );
  await context.test('but two copies of one photo are not split, the second being a duplicate', () => assert.equal(
    twoCopiesOfOnePhoto.placements.map((entry) => entry.placement).join(),
    `${PLACEMENT.intoItsDayFolder},${PLACEMENT.duplicateOfAFileAlreadySorted}`,
  ));
  await context.test('and no name is reported as split',
    () => assert.equal(twoCopiesOfOnePhoto.namesSplitIntoSubfolders, 0));
});

test('a file already where it belongs', async (context) => {
  const alreadySorted = candidate('/card/2026-08-27/P1.JPG', { clock: exif('2026:08:27 10:00:00') });
  await context.test('a file already in its day folder is left alone', () => assert.equal(
    buildPlan([alreadySorted], {}, probeOver(['/card/2026-08-27/P1.JPG'])).placements[0].placement,
    PLACEMENT.alreadyInItsDayFolder,
  ));

  const inANumberedSubfolder = candidate('/card/2026-08-27/01/P1.JPG', { clock: exif('2026:08:27 10:00:00') });
  await context.test('so is one already in a numbered subfolder, which is not nested deeper', () => assert.equal(
    buildPlan([inANumberedSubfolder], {}, probeOver(['/card/2026-08-27/01/P1.JPG'])).placements[0].placement,
    PLACEMENT.alreadyInItsDayFolder,
  ));
});

test('the same files always give the same plan', async (context) => {
  const files = [
    candidate('/card/a/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 10) }),
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/b/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 11), sizeInBytes: 2000 }),
  ];
  const folderOrderOf = (order) => buildPlan(order, {}, probeOver([]))
    .placements.map((entry) => `${entry.sourcePath}->${entry.targetPath}`).join('|');

  const oneWayRound = folderOrderOf(files);
  const theOther = folderOrderOf([...files].reverse());
  await context.test('the plan does not depend on the order the files were found in',
    () => assert.equal(oneWayRound, theOther));

  const planned = buildPlan(files, {}, probeOver([]));
  await context.test('and planning the same files twice plans the same thing, nothing having been mutated',
    () => assert.deepEqual(planned, buildPlan(files, {}, probeOver([]))));
});

test('a day folder with no free name left', async (context) => {
  // Every name in the day folder and in all its numbered subfolders is taken, and none of
  // them by this photo: there is nowhere left to put it and the plan has to say so rather
  // than overwrite one of them.
  const everyNameTaken = { exists: () => true, contentsMatch: () => false };
  const plan = buildPlan([candidate('/card/DCIM/P1.JPG', { clock: exif('2026:09:01 10:00:00') })], {}, everyNameTaken);

  await context.test('a photo with nowhere left to go is reported as placed nowhere',
    () => assert.equal(plan.placements[0].placement, PLACEMENT.couldNotBePlaced));
  await context.test('and it is given no target path rather than a made up one',
    () => assert.equal(plan.placements[0].targetPath, null));
  await context.test('and it says why, which is what the run prints at the end',
    () => assert.equal(plan.placements[0].failureReason, NO_FREE_NAME_IN_THE_DAY_FOLDER));
  await context.test('a placement counted without the disk being touched counts it as failed',
    () => assert.equal(countPlacements(plan.placements).failed, 1));
});

test('two files alike in every way but their path', async (context) => {
  // Same moment, same size: neither the clock nor the size settles the order, so the path
  // does. Without that last step the sort would be free to order them either way round.
  const shotAt = exif('2026:09:01 10:00:00');
  const inOneOrder = buildPlan([
    candidate('/card/b/SAME.JPG', { clock: shotAt }), candidate('/card/a/SAME.JPG', { clock: shotAt }),
  ], {}, probeOver([]));
  const inTheOther = buildPlan([
    candidate('/card/a/SAME.JPG', { clock: shotAt }), candidate('/card/b/SAME.JPG', { clock: shotAt }),
  ], {}, probeOver([]));

  await context.test('two files alike in clock and size are ordered by their path, so the plan is settled', () => assert.equal(
    inOneOrder.placements.map((entry) => entry.sourcePath).join(),
    inTheOther.placements.map((entry) => entry.sourcePath).join(),
  ));
  await context.test('and the one whose path sorts first takes the first numbered subfolder',
    () => assert.equal(inOneOrder.placements[0].targetPath, asThisPlatformSpellsIt('/card/2026-09-01/01/SAME.JPG')));
});

const shotAt = (filePath, exifText, sizeInBytes = 1000) => candidate(filePath, { clock: exif(exifText), sizeInBytes });
const targetOf = (plan, sourceEnd) => plan.placements.find((entry) => entry.sourcePath.endsWith(sourceEnd)).targetPath;

test('the order two same-named photos of a day are numbered in', async (context) => {
  await context.test('the earlier one takes the first subfolder, however large it is and wherever it sits', () => assert.equal(
    targetOf(buildPlan([shotAt('/card/100/A1.JPG', '2026:09:01 18:00:00', 1000), shotAt('/card/101/A1.JPG', '2026:09:01 10:00:00', 9000)], {}, probeOver([])), '101/A1.JPG'),
    asThisPlatformSpellsIt('/card/2026-09-01/01/A1.JPG'),
  ));
  await context.test('of two taken at one moment, the smaller does', () => assert.equal(
    targetOf(buildPlan([shotAt('/card/100/A1.JPG', '2026:09:01 10:00:00', 9000), shotAt('/card/101/A1.JPG', '2026:09:01 10:00:00', 1000)], {}, probeOver([])), '101/A1.JPG'),
    asThisPlatformSpellsIt('/card/2026-09-01/01/A1.JPG'),
  ));
  await context.test('and of two the same size too, the one whose path sorts first', () => assert.equal(
    targetOf(buildPlan([shotAt('/card/101/A1.JPG', '2026:09:01 10:00:00'), shotAt('/card/100/A1.JPG', '2026:09:01 10:00:00')], {}, probeOver([])), '100/A1.JPG'),
    asThisPlatformSpellsIt('/card/2026-09-01/01/A1.JPG'),
  ));
  await context.test('two files of different sizes are never the same photo, whatever the probe says of their contents', () => assert.equal(
    buildPlan([shotAt('/card/100/A1.JPG', '2026:09:01 10:00:00', 1000), shotAt('/card/101/A1.JPG', '2026:09:01 10:00:00', 2000)],
      {}, probeOver([], [['/card/100/A1.JPG', '/card/101/A1.JPG']])).namesSplitIntoSubfolders,
    1,
  ));
});

test('the folders a file is placed into', async (context) => {
  await context.test('a file with no date goes to the folder named undated',
    () => assert.equal(buildPlan([candidate('/card/DCIM/CLIP.MTS')], { filesystemDateUse: 'never' }, probeOver([])).placements[0].folderName, 'undated'));
  await context.test('the layout and the hour the day starts at decide the day folder', () => assert.equal(
    buildPlan([shotAt('/card/DCIM/P1.JPG', '2026:08:28 01:30:00')], { layout: '%Y/%F', hourTheDayStartsAt: 4 }, probeOver([])).placements[0].folderName,
    '2026/2026-08-27',
  ));

  const inAFolderOfItsDay = (folder) => buildPlan([shotAt(`/card/2026-08-27/${folder}/P1.JPG`, '2026:08:27 10:00:00')], {}, probeOver([])).placements[0];
  await context.test('a photo in a folder of its day that is not numbered is placed in the day folder itself', () => assert.deepEqual(
    ['raw', 'x01', '01x'].map((folder) => inAFolderOfItsDay(folder).targetPath),
    ['raw', 'x01', '01x'].map(() => asThisPlatformSpellsIt('/card/2026-08-27/P1.JPG')),
  ));
  await context.test('and so is one in a numbered folder that is not under its day', () => assert.equal(
    buildPlan([shotAt('/card/01/P1.JPG', '2026:08:27 10:00:00')], {}, probeOver([])).placements[0].targetPath,
    asThisPlatformSpellsIt('/card/2026-08-27/P1.JPG'),
  ));

  const alreadyThere = shotAt('/card/2026-08-27/P1.JPG', '2026:08:27 10:00:00');
  const anotherPhotoOfThatName = shotAt('/card/DCIM/P1.JPG', '2026:08:27 11:00:00');
  await context.test('a photo already in its day folder stays there, though another photo of that day shares its name', () => assert.equal(
    buildPlan([alreadyThere, anotherPhotoOfThatName], {}, probeOver(['/card/2026-08-27/P1.JPG'])).placements[0].placement,
    PLACEMENT.alreadyInItsDayFolder,
  ));
});

test('a day folder filling up', async (context) => {
  const firstNinetyEightTaken = ['/card/2026-08-27/P1.JPG', ...Array.from({ length: 98 }, (unused, index) => `/card/2026-08-27/${String(index + 1).padStart(2, '0')}/P1.JPG`)];
  const plan = buildPlan([shotAt('/card/DCIM/P1.JPG', '2026:08:27 10:00:00')], {}, probeOver(firstNinetyEightTaken));
  await context.test('the ninety-ninth numbered subfolder is still used', () => assert.equal(plan.placements[0].targetPath, asThisPlatformSpellsIt('/card/2026-08-27/99/P1.JPG')));
  await context.test('and a file placed there carries no failure', () => assert.equal(plan.placements[0].failureReason, null));
  await context.test('a failure says what ran out', () => assert.equal(NO_FREE_NAME_IN_THE_DAY_FOLDER, 'no free name in the day folder or its first 99 subfolders'));

  const secondsOwnSubfolderTaken = buildPlan([
    shotAt('/card/100/P1.JPG', '2026:08:27 10:00:00'), shotAt('/card/101/P1.JPG', '2026:08:27 11:00:00'),
  ], {}, probeOver(['/card/2026-08-27/02/P1.JPG']));
  await context.test('a photo whose own numbered subfolder is taken walks past the one another photo claimed, not taking it for a copy', () => assert.deepEqual(
    [targetOf(secondsOwnSubfolderTaken, '101/P1.JPG'), secondsOwnSubfolderTaken.placements[1].placement],
    [asThisPlatformSpellsIt('/card/2026-08-27/03/P1.JPG'), PLACEMENT.intoItsDayFolder],
  ));
  await context.test('a day folder already holding the same photo makes it a duplicate of that file', () => assert.deepEqual(
    (({ targetPath, placement }) => [targetPath, placement])(buildPlan([shotAt('/card/DCIM/P1.JPG', '2026:08:27 10:00:00')], {},
      probeOver(['/card/2026-08-27/P1.JPG'], [['/card/DCIM/P1.JPG', '/card/2026-08-27/P1.JPG']])).placements[0]),
    [asThisPlatformSpellsIt('/card/2026-08-27/P1.JPG'), PLACEMENT.duplicateOfAFileAlreadySorted],
  ));
});

test('counting what a plan does', async (context) => {
  const counted = countPlacements([PLACEMENT.intoItsDayFolder, PLACEMENT.intoItsDayFolder, PLACEMENT.alreadyInItsDayFolder,
    PLACEMENT.duplicateOfAFileAlreadySorted, PLACEMENT.couldNotBePlaced].map((placement) => ({ placement })));
  await context.test('each placement is counted apart, and nothing has failed yet', () => assert.deepEqual(
    counted,
    { placed: 2, alreadyInPlace: 1, duplicates: 1, failed: 1, emptyDirectoriesRemoved: 0, failures: [] },
  ));
});
