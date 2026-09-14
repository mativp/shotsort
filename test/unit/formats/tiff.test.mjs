import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIFF_EXIF_POINTER, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_TAG_JPEG_FROM_RAW, TIFF_TAG_MODIFY_DATE, TIFF_VALUE_TYPE_UNDEFINED,
  bigTiffFile, tiffAsciiEntry, tiffEntryHolding, tiffFileLaidOut, tiffLongEntry,
} from '../../fixtures/tiff.mjs';
import { JPEG_MARKER_APP1_EXIF, JPEG_MARKER_START_OF_IMAGE, jpegFile, jpegMarker, jpegSegment } from '../../fixtures/jpeg.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const SHOT = '2026:08:27 12:00:00';
const WHEN_IT_WAS_SHOT = '2026-08-27 12:00:00';
const TIFF_TAG_IMAGE_WIDTH = 0x0100;
const TIFF_TAG_MAKE = 0x010f;
const A_TYPE_TIFF_DOES_NOT_DEFINE = 19;
const MOST_ENTRIES_READ = 512;

const laidOut = (layout) => clockTextInside(tiffFileLaidOut(layout));
const aWidth = tiffLongEntry(TIFF_TAG_IMAGE_WIDTH, 6000);

test('the entries of a TIFF directory', async (context) => {
  await context.test('a date that is not the first entry, behind an Exif pointer that is not the first either, is read', () => assert.equal(
    laidOut({ mainEntries: [aWidth, TIFF_EXIF_POINTER], exifEntries: [aWidth, tiffAsciiEntry(TIFF_TAG_DATE_TIME_ORIGINAL, SHOT)] }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('an entry past the count the directory declares is not read', () => assert.equal(
    laidOut({ mainEntries: [aWidth, tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT)], declaredMainEntryCount: 1 }),
    null,
  ));
  await context.test('a directory declaring as many entries as are worth reading is read', () => assert.equal(
    laidOut({ mainEntries: [...Array.from({ length: MOST_ENTRIES_READ - 1 }, () => aWidth), tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT)] }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('and one declaring an entry more is not', () => assert.equal(
    laidOut({ mainEntries: [...Array.from({ length: MOST_ENTRIES_READ }, () => aWidth), tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT)] }),
    null,
  ));
});

test('the date entries of a TIFF', async (context) => {
  await context.test('a date written with spaces around it is read', () => assert.equal(
    laidOut({ mainEntries: [tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, `  ${SHOT}  `)] }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('an entry with a date tag but not written as text is passed over', () => assert.equal(
    laidOut({ mainEntries: [
      tiffEntryHolding(TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_UNDEFINED, Buffer.from('2026:01:01 00:00:00\0', 'latin1')),
      tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT),
    ] }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('and so is text under a tag that is no date', () => assert.equal(
    laidOut({ mainEntries: [tiffAsciiEntry(TIFF_TAG_MAKE, 'Panasonic'), tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT)] }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('a preferred date that does not read as one leaves the next to be read', () => assert.equal(
    laidOut({ mainEntries: [TIFF_EXIF_POINTER, tiffAsciiEntry(TIFF_TAG_MODIFY_DATE, SHOT)], exifEntries: [tiffAsciiEntry(TIFF_TAG_DATE_TIME_ORIGINAL, 'not a date')] }),
    WHEN_IT_WAS_SHOT,
  ));
});

test('the preview JPEG a raw dressed up as a TIFF carries', async (context) => {
  const aRawHolding = (mainEntries) => clockTextInside(tiffFileLaidOut({ mainEntries, signature: 0x55 }));
  const thePreview = jpegFile(SHOT);
  await context.test('is found behind the raw\'s other entries', () => assert.equal(
    aRawHolding([aWidth, tiffEntryHolding(TIFF_TAG_JPEG_FROM_RAW, TIFF_VALUE_TYPE_UNDEFINED, thePreview)]),
    WHEN_IT_WAS_SHOT,
  ));

  // Four values of a type TIFF does not define are taken to be a byte each, so they sit in
  // the entry itself; read as a pointer instead, these four bytes would lead to the preview.
  const pointerToAPreviewAfterIt = tiffEntryHolding(TIFF_TAG_JPEG_FROM_RAW, A_TYPE_TIFF_DOES_NOT_DEFINE, Buffer.alloc(4), 4);
  const laidOutWithIt = tiffFileLaidOut({ mainEntries: [pointerToAPreviewAfterIt], signature: 0x55 });
  laidOutWithIt.writeUInt32LE(laidOutWithIt.length, 8 + 2 + 8);
  await context.test('an entry of a type TIFF does not define is measured a byte to a value', () => assert.equal(
    clockTextInside(Buffer.concat([laidOutWithIt, thePreview])),
    null,
  ));

  const anExifSegmentWithAPreviewEntry = jpegSegment(JPEG_MARKER_APP1_EXIF, Buffer.concat([
    Buffer.from('Exif\0\0', 'latin1'),
    tiffFileLaidOut({ mainEntries: [tiffEntryHolding(TIFF_TAG_JPEG_FROM_RAW, TIFF_VALUE_TYPE_UNDEFINED, thePreview)] }),
  ]));
  await context.test('is not followed from a JPEG\'s own Exif, which is not a raw', () => assert.equal(
    clockTextInside(Buffer.concat([jpegMarker(JPEG_MARKER_START_OF_IMAGE), anExifSegmentWithAPreviewEntry])),
    null,
  ));
});

test('the header of a TIFF', async (context) => {
  await context.test('a BigTIFF declaring offsets of other than eight bytes is refused',
    () => assert.equal(clockTextInside(bigTiffFile(SHOT, { offsetSize: 4 })), null));

  // Read from four bytes in, the header and the directory after it happen to spell out a
  // directory whose second entry is a DateTimeOriginal pointing at the date.
  const pointingInsideItsHeader = Buffer.alloc(38);
  pointingInsideItsHeader.write('II', 0, 'latin1');
  pointingInsideItsHeader.writeUInt16LE(0x2a, 2);
  pointingInsideItsHeader.writeUInt32LE(4, 4);
  pointingInsideItsHeader.writeUInt16LE(2, 8);
  pointingInsideItsHeader.writeUInt16LE(TIFF_TAG_IMAGE_WIDTH, 10);
  pointingInsideItsHeader.writeUInt16LE(4, 12);
  pointingInsideItsHeader.writeUInt32LE(1, 14);
  pointingInsideItsHeader.writeUInt32LE(0x00029003, 18);
  pointingInsideItsHeader.writeUInt16LE(0x0014, 22);
  pointingInsideItsHeader.writeUInt32LE(38, 26);
  await context.test('a first directory said to start inside the header is refused, even where the bytes would read as one', () => assert.equal(
    clockTextInside(Buffer.concat([pointingInsideItsHeader, Buffer.from(`${SHOT}\0`, 'latin1')])),
    null,
  ));
});
