import { BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE } from './filler.mjs';
import { secondsSince1970For } from './moments.mjs';
import {
  TIFF_LITTLE_ENDIAN_MARK, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_TAG_MODIFY_DATE,
  tiffFileWithTheDateInItsMainDirectory,
} from './tiff.mjs';
import { isoBox } from './isoBaseMedia.mjs';
import { BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES } from './quicktime.mjs';

const CANON_METADATA_UUID = Buffer.from('85c0b687820f11e08111f4ce462b6a48', 'hex');

export const CANON_METADATA_UUID_BYTES = CANON_METADATA_UUID;

export function canonRawFile(dateTimeOriginal, {
  modifyDate = '2001:01:01 00:00:00', captureDateBox = null, boxesBeforeTheCanonUuid = [],
} = {}) {
  const movieHeader = Buffer.alloc(BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('crx crx isom', 'latin1')),
    isoBox('moov', Buffer.concat([
      isoBox('mvhd', movieHeader),
      ...boxesBeforeTheCanonUuid,
      isoBox('uuid', Buffer.concat([
        CANON_METADATA_UUID,
        isoBox('CMT1', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_MODIFY_DATE, modifyDate)),
        captureDateBox ?? isoBox('CMT2', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_DATE_TIME_ORIGINAL, dateTimeOriginal)),
      ])),
    ])),
    isoBox('mdat', Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)),
  ]);
}

const CIFF_HEADER_BYTES = 26;
export const CIFF_TAG_CAPTURE_TIME = 0x180e;
export const CIFF_TAG_IMAGE_PROPERTIES = 0x2807;
export const CIFF_TAG_THAT_HOLDS_NO_TIME = 0x1807;
const BYTES_PER_CIFF_DIRECTORY_ENTRY = 10;
const BYTES_IN_A_CIFF_CAPTURE_TIME = 12;

export function ciffCaptureTime(cameraClock) {
  const captureTime = Buffer.alloc(BYTES_IN_A_CIFF_CAPTURE_TIME);
  captureTime.writeUInt32LE(secondsSince1970For(cameraClock), 0);
  captureTime.writeInt32LE(0, 4);
  captureTime.writeUInt32LE(0, 8);
  return captureTime;
}

export function ciffEntry(tag, length, offset) {
  const buffer = Buffer.alloc(BYTES_PER_CIFF_DIRECTORY_ENTRY);
  buffer.writeUInt16LE(tag, 0);
  buffer.writeUInt32LE(length, 2);
  buffer.writeUInt32LE(offset, 6);
  return buffer;
}

// A heap is its data, then its directory, then a pointer back to that directory. Offsets
// in its entries count from the start of its data.
export function ciffHeap(data, entries, {
  declaredEntryCount = entries.length, bytesBetweenTheEntriesAndThePointer = 4,
} = {}) {
  const count = Buffer.alloc(2);
  count.writeUInt16LE(declaredEntryCount, 0);
  const pointer = Buffer.alloc(4);
  pointer.writeUInt32LE(data.length, 0);
  return Buffer.concat([data, count, ...entries, Buffer.alloc(bytesBetweenTheEntriesAndThePointer), pointer]);
}

export function canonCiffRawFileHolding(heap, { mark = 'HEAPCCDR' } = {}) {
  const header = Buffer.alloc(CIFF_HEADER_BYTES);
  header.write(TIFF_LITTLE_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt32LE(CIFF_HEADER_BYTES, 2);
  header.write(mark, 6, 'latin1');
  header.writeUInt32LE(0x00010002, 14);
  return Buffer.concat([header, heap]);
}

export function canonCiffRawFile(cameraClock, { heapsTheCaptureTimeIsBuriedUnder = 1 } = {}) {
  const captureTime = ciffCaptureTime(cameraClock);
  let heap = ciffHeap(captureTime, [ciffEntry(CIFF_TAG_CAPTURE_TIME, captureTime.length, 0)]);
  for (let level = 0; level < heapsTheCaptureTimeIsBuriedUnder; level++) {
    heap = ciffHeap(heap, [ciffEntry(CIFF_TAG_IMAGE_PROPERTIES, heap.length, 0)]);
  }
  return canonCiffRawFileHolding(heap);
}
