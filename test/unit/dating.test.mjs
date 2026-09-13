import test from 'node:test';
import assert from 'node:assert/strict';
import { DATE_SOURCE } from '../../src/dateSource.mjs';
import { FILESYSTEM_DATE_USE } from '../../src/dating.mjs';
import { UNDATED_FOLDER_NAME, buildPlan } from '../../src/plan.mjs';
import { candidate, exif, probeOver } from '../support/inMemory.mjs';

test('a file that records no date', async (context) => {
  const undated = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) });
  const dated = candidate('/card/DCIM/P1.JPG', {
    clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata,
  });

  const trusted = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.always }, probeOver([]));
  await context.test('--use-filesystem-date files an undated clip by the date the filesystem keeps', () => assert.equal(
    trusted.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    '2026-08-27',
  ));
  await context.test('and says so in the counts',
    () => assert.equal(trusted.filesystemDateUseCounts.filesDatedByTheFilesystem, 1));

  const ignored = buildPlan([dated, undated], { filesystemDateUse: FILESYSTEM_DATE_USE.never }, probeOver([]));
  await context.test('--ignore-filesystem-date sends it to the undated folder instead', () => assert.equal(
    ignored.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    UNDATED_FOLDER_NAME,
  ));
  await context.test('and counts it as left undated',
    () => assert.equal(ignored.filesystemDateUseCounts.filesLeftUndated, 1));

  const copiedLongAfterTheShoot = candidate('/card/DCIM/CLIP.MTS', { fileTimestamp: new Date(2026, 8, 15, 14) });
  const byDefault = buildPlan([dated, copiedLongAfterTheShoot], {}, probeOver([]));
  await context.test('left to itself it refuses a filesystem date that looks like the moment of a copy', () => assert.equal(
    byDefault.placements.find((entry) => entry.sourcePath.endsWith('CLIP.MTS')).folderName,
    UNDATED_FOLDER_NAME,
  ));
});

test('a raw takes the date of its jpeg', async (context) => {
  const plan = buildPlan([
    candidate('/card/DCIM/P1.JPG', { clock: exif('2026:08:27 10:00:00'), dateSource: DATE_SOURCE.exifMetadata }),
    candidate('/card/DCIM/P1.RW2'),
  ], {}, probeOver([]));

  const raw = plan.placements.find((entry) => entry.sourcePath.endsWith('.RW2'));
  await context.test('a raw recording no date follows the jpeg of the same shot',
    () => assert.equal(raw.folderName, '2026-08-27'));
  await context.test('and is marked as having taken its date from a sibling',
    () => assert.equal(raw.dateSource, DATE_SOURCE.siblingFile));
});

test('a card holding nothing that records its own date', async (context) => {
  // Nothing on the card says when it was shot, so there is no newest shot to measure a
  // filesystem date against and no reason to distrust one.
  const nothingDated = [
    candidate('/card/DCIM/CLIP1.MTS', { fileTimestamp: new Date(2026, 7, 27, 14) }),
    candidate('/card/DCIM/CLIP2.MTS', { fileTimestamp: new Date(2026, 7, 28, 9) }),
  ];
  const plan = buildPlan(nothingDated, {}, probeOver([]));

  await context.test('with no shot on the card to measure against, a filesystem date is taken as it stands',
    () => assert.equal(plan.placements.map((entry) => entry.folderName).join(), '2026-08-27,2026-08-28'));
  await context.test('and both files are counted as dated by the filesystem',
    () => assert.equal(plan.filesystemDateUseCounts.filesDatedByTheFilesystem, 2));
});
