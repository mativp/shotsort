import test from 'node:test';
import assert from 'node:assert/strict';
import {
  riffChunk, riffDateCreatedChunk, riffExifChunk, riffFile, riffJunkChunks, riffListsNested, riffRecordingDateChunk,
} from '../../fixtures/riff.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const RECORDED = 'Thu Aug 27 10:40:00 2026';
const WHEN_IT_WAS_RECORDED = '2026-08-27 10:40:00';
const MOST_CHUNKS_WALKED_IN_A_LIST = 1024;
const DEEPEST_LISTS_ARE_LOOKED_INTO = 4;

const aviHolding = (...chunks) => clockTextInside(riffFile('AVI ', chunks));

test('the chunks a RIFF file is walked through', async (context) => {
  await context.test('a file past four gigabytes, marked RF64, is read like any other', () => assert.equal(
    clockTextInside(riffFile('AVI ', [riffRecordingDateChunk(RECORDED)], { mark: 'RF64' })),
    WHEN_IT_WAS_RECORDED,
  ));
  await context.test('a chunk of odd length is stepped over together with the byte padding it out', () => assert.equal(
    aviHolding(riffChunk('strn', Buffer.from('odd', 'latin1')), riffRecordingDateChunk(RECORDED)),
    WHEN_IT_WAS_RECORDED,
  ));
  await context.test('a date in the last chunk walked is still read', () => assert.equal(
    aviHolding(...riffJunkChunks(MOST_CHUNKS_WALKED_IN_A_LIST - 1), riffRecordingDateChunk(RECORDED)),
    WHEN_IT_WAS_RECORDED,
  ));
  await context.test('and one a chunk further is not', () => assert.equal(
    aviHolding(...riffJunkChunks(MOST_CHUNKS_WALKED_IN_A_LIST), riffRecordingDateChunk(RECORDED)),
    null,
  ));
  await context.test('a date in lists nested as deep as are looked into is read', () => assert.equal(
    aviHolding(...riffListsNested(DEEPEST_LISTS_ARE_LOOKED_INTO, [riffRecordingDateChunk(RECORDED)])),
    WHEN_IT_WAS_RECORDED,
  ));
  await context.test('and one a list deeper is not', () => assert.equal(
    aviHolding(...riffListsNested(DEEPEST_LISTS_ARE_LOOKED_INTO + 1, [riffRecordingDateChunk(RECORDED)])),
    null,
  ));
  await context.test('a recording date that ends the file is read up to the end of it',
    () => assert.equal(aviHolding(riffChunk('movi', Buffer.alloc(8)), riffRecordingDateChunk(RECORDED)), WHEN_IT_WAS_RECORDED));

  const claimingMoreThanTheFileHolds = riffRecordingDateChunk(RECORDED);
  claimingMoreThanTheFileHolds.writeUInt32LE(4096, 4);
  await context.test('and one whose length claims more than the file holds is read as far as the file goes',
    () => assert.equal(aviHolding(claimingMoreThanTheFileHolds), WHEN_IT_WAS_RECORDED));
});

test('the Exif chunk a RIFF file may carry', async (context) => {
  const shotAt = '2026:08:27 10:41:00';
  await context.test('is read under its lower-case name too',
    () => assert.equal(aviHolding(riffExifChunk(shotAt, { chunkType: 'exif' })), '2026-08-27 10:41:00'));
  await context.test('and when it starts straight at the TIFF byte order mark, with no Exif header',
    () => assert.equal(aviHolding(riffExifChunk(shotAt, { startsWithTheExifHeader: false })), '2026-08-27 10:41:00'));
});

test('the order a RIFF file\'s dates are trusted in', async (context) => {
  await context.test('the recording date is trusted over the date the file was created, whichever comes first',
    () => assert.equal(aviHolding(riffDateCreatedChunk('2026-09-01 18:00:00'), riffRecordingDateChunk(RECORDED)), WHEN_IT_WAS_RECORDED));
  await context.test('and Exif over the recording date, whichever comes first', () => assert.equal(
    aviHolding(riffRecordingDateChunk('Tue Sep 01 18:00:00 2026'), riffExifChunk('2026:08:27 10:41:00')),
    '2026-08-27 10:41:00',
  ));
});
