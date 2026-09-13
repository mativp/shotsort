import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { NO_FREE_NAME_IN_THE_DAY_FOLDER, PLACEMENT, buildPlan, countPlacements } from '../../src/plan.mjs';
import { asThisPlatformSpellsIt, candidate, exif, probeOver } from '../support/inMemory.mjs';

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

test('two photos of one day sharing a name', async (context) => {
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
