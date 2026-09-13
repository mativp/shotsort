import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANON_METADATA_UUID_BYTES, CIFF_TAG_CAPTURE_TIME, CIFF_TAG_IMAGE_PROPERTIES, CIFF_TAG_THAT_HOLDS_NO_TIME,
  canonCiffRawFile, canonCiffRawFileHolding, canonRawFile, ciffCaptureTime, ciffEntry, ciffHeap,
} from '../../fixtures/canon.mjs';
import { isoBox } from '../../fixtures/isoBaseMedia.mjs';
import { TIFF_TAG_DATE_TIME_ORIGINAL, tiffFileWithTheDateInItsMainDirectory } from '../../fixtures/tiff.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const SHOT = '2026-08-27 11:40:00';
const SHOT_AS_EXIF_WRITES_IT = '2026:08:27 11:40:00';
const SOMETHING_ELSE = '2026-01-01 00:00:00';

test('the uuid box a CR3 keeps its Exif in', async (context) => {
  const aCaptureDateBoxSaying = (date) => isoBox('CMT2', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_DATE_TIME_ORIGINAL, date));
  await context.test('a box of another type that starts with Canon\'s uuid is not taken for it', () => assert.equal(
    clockTextInside(canonRawFile(SHOT_AS_EXIF_WRITES_IT, {
      boxesBeforeTheCanonUuid: [isoBox('free', Buffer.concat([CANON_METADATA_UUID_BYTES, aCaptureDateBoxSaying('2026:01:01 00:00:00')]))],
    })),
    SHOT,
  ));
  await context.test('nor is a uuid box with some other uuid', () => assert.equal(
    clockTextInside(canonRawFile(SHOT_AS_EXIF_WRITES_IT, {
      boxesBeforeTheCanonUuid: [isoBox('uuid', Buffer.concat([Buffer.alloc(16, 0xbe), aCaptureDateBoxSaying('2026:01:01 00:00:00')]))],
    })),
    SHOT,
  ));
  await context.test('CMT1 is read when there is no CMT2', () => assert.equal(
    clockTextInside(canonRawFile(SHOT_AS_EXIF_WRITES_IT, { modifyDate: '2026:08:28 09:00:00', captureDateBox: Buffer.alloc(0) })),
    '2026-08-28 09:00:00',
  ));
  await context.test('and when CMT2 holds no date', () => assert.equal(
    clockTextInside(canonRawFile(SHOT_AS_EXIF_WRITES_IT, { modifyDate: '2026:08:28 09:00:00', captureDateBox: isoBox('CMT2', Buffer.alloc(32)) })),
    '2026-08-28 09:00:00',
  ));
});

const seconds = (cameraClock) => ciffCaptureTime(cameraClock).subarray(0, 4);
const aCrwHolding = (heap, layout) => clockTextInside(canonCiffRawFileHolding(heap, layout));
const aHeapOfTheCaptureTime = (cameraClock) => ciffHeap(seconds(cameraClock), [ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)]);
const inAHeap = (subheaps) => {
  let offset = 0;
  const entries = subheaps.map((subheap) => {
    const entry = ciffEntry(CIFF_TAG_IMAGE_PROPERTIES, subheap.length, offset);
    offset += subheap.length;
    return entry;
  });
  return ciffHeap(Buffer.concat(subheaps), entries);
};

test('the heaps of a CIFF raw', async (context) => {
  await context.test('the thumbnail CIFF writes beside the raw, marked HEAPJPGM, is read too',
    () => assert.equal(aCrwHolding(aHeapOfTheCaptureTime(SHOT), { mark: 'HEAPJPGM' }), SHOT));
  await context.test('a capture time buried as deep as heaps are looked into is read',
    () => assert.equal(clockTextInside(canonCiffRawFile(SHOT, { heapsTheCaptureTimeIsBuriedUnder: 8 })), SHOT));
  await context.test('a directory whose entries end right where its pointer begins is read', () => assert.equal(
    aCrwHolding(ciffHeap(seconds(SHOT), [ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)], { bytesBetweenTheEntriesAndThePointer: 0 })),
    SHOT,
  ));
  await context.test('the first of two heaps holding no capture time leaves the second to be read',
    () => assert.equal(aCrwHolding(inAHeap([ciffHeap(Buffer.alloc(4), []), aHeapOfTheCaptureTime(SHOT)])), SHOT));

  const aHeapPointingPastItsOwnEnd = Buffer.concat([seconds(SHOT), Buffer.from([8, 0, 0, 0])]);
  const aDirectoryJustPastIt = Buffer.concat([Buffer.from([1, 0]), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)]);
  await context.test('a heap whose pointer leads past its own end is not read from what follows it', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([aHeapPointingPastItsOwnEnd, aDirectoryJustPastIt]), [ciffEntry(CIFF_TAG_IMAGE_PROPERTIES, 8, 0)])),
    null,
  ));
});

test('the entries of a CIFF directory', async (context) => {
  await context.test('the capture time is found when it is not the first entry and not at the start of the data', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([Buffer.alloc(8), seconds(SHOT)]), [
      ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 8, 0), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 8),
    ])),
    SHOT,
  ));
  await context.test('the value of another tag is not taken for the capture time, however it reads', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([seconds(SOMETHING_ELSE), seconds(SHOT)]), [
      ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 4, 0), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 4),
    ])),
    SHOT,
  ));
  await context.test('a capture time that is no plausible moment leaves a later one to be read', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([Buffer.from([1, 0, 0, 0]), seconds(SHOT)]), [
      ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 4),
    ])),
    SHOT,
  ));
  // The count claims three entries where one fits; the third would be read out of the
  // bytes after the heap, which hold a capture time entry pointing back into it.
  const aHeapCountingMoreEntriesThanFit = ciffHeap(seconds(SHOT), [ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 0, 0)], {
    declaredEntryCount: 3, bytesBetweenTheEntriesAndThePointer: 0,
  });
  const whatFollowsIt = Buffer.concat([Buffer.alloc(6), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)]);
  await context.test('a directory counting more entries than fit before its pointer is refused rather than read past its heap', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([aHeapCountingMoreEntriesThanFit, whatFollowsIt]), [
      ciffEntry(CIFF_TAG_IMAGE_PROPERTIES, aHeapCountingMoreEntriesThanFit.length, 0),
    ])),
    null,
  ));
  await context.test('an entry past the count the directory declares is not read', () => assert.equal(
    aCrwHolding(ciffHeap(seconds(SHOT), [ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 0, 0), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)], { declaredEntryCount: 1 })),
    null,
  ));
  await context.test('a capture time whose length runs to the very end of its heap is read', () => assert.equal(
    aCrwHolding(ciffHeap(seconds(SHOT), [ciffEntry(CIFF_TAG_CAPTURE_TIME, 24, 0)])),
    SHOT,
  ));
  const aHeapPointingPastItsEnd = ciffHeap(Buffer.alloc(4), [ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 24)]);
  await context.test('a capture time lying past the end of its heap is not read', () => assert.equal(
    aCrwHolding(ciffHeap(Buffer.concat([aHeapPointingPastItsEnd, seconds(SHOT)]), [ciffEntry(CIFF_TAG_IMAGE_PROPERTIES, aHeapPointingPastItsEnd.length, 0)])),
    null,
  ));
  await context.test('a directory declaring as many entries as are worth reading is read', () => assert.equal(
    aCrwHolding(ciffHeap(seconds(SHOT), [...Array.from({ length: 511 }, () => ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 0, 0)), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)])),
    SHOT,
  ));
  await context.test('and one declaring an entry more is not', () => assert.equal(
    aCrwHolding(ciffHeap(seconds(SHOT), [...Array.from({ length: 512 }, () => ciffEntry(CIFF_TAG_THAT_HOLDS_NO_TIME, 0, 0)), ciffEntry(CIFF_TAG_CAPTURE_TIME, 4, 0)])),
    null,
  ));
});
