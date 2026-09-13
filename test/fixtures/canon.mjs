import { BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE } from './filler.mjs';
import { secondsSince1970For } from './moments.mjs';
import {
  TIFF_LITTLE_ENDIAN_MARK, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_TAG_MODIFY_DATE,
  tiffFileWithTheDateInItsMainDirectory,
} from './tiff.mjs';
import { isoBox } from './isoBaseMedia.mjs';
import { BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES } from './quicktime.mjs';

const CANON_METADATA_UUID = Buffer.from('85c0b687820f11e08111f4ce462b6a48', 'hex');

export function canonRawFile(dateTimeOriginal, { modifyDate = '2001:01:01 00:00:00' } = {}) {
  const movieHeader = Buffer.alloc(BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('crx crx isom', 'latin1')),
    isoBox('moov', Buffer.concat([
      isoBox('mvhd', movieHeader),
      isoBox('uuid', Buffer.concat([
        CANON_METADATA_UUID,
        isoBox('CMT1', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_MODIFY_DATE, modifyDate)),
        isoBox('CMT2', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_DATE_TIME_ORIGINAL, dateTimeOriginal)),
      ])),
    ])),
    isoBox('mdat', Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)),
  ]);
}

const CIFF_HEADER_BYTES = 26;
const CIFF_TAG_CAPTURE_TIME = 0x180e;
const CIFF_TAG_IMAGE_PROPERTIES = 0x2807;
const BYTES_PER_CIFF_DIRECTORY_ENTRY = 10;
const BYTES_IN_A_CIFF_CAPTURE_TIME = 12;

export function canonCiffRawFile(cameraClock, { heapsTheCaptureTimeIsBuriedUnder = 1 } = {}) {
  const captureTime = Buffer.alloc(BYTES_IN_A_CIFF_CAPTURE_TIME);
  captureTime.writeUInt32LE(secondsSince1970For(cameraClock), 0);
  captureTime.writeInt32LE(0, 4);
  captureTime.writeUInt32LE(0, 8);

  // A heap is its data, then its directory, then a pointer back to that directory.
  const heapHolding = (entries, data) => {
    const count = Buffer.alloc(2);
    count.writeUInt16LE(entries.length, 0);
    const directory = Buffer.concat([count, ...entries, Buffer.alloc(4)]);
    const pointer = Buffer.alloc(4);
    pointer.writeUInt32LE(data.length, 0);
    return Buffer.concat([data, directory, pointer]);
  };
  const entry = (tag, length, offset) => {
    const buffer = Buffer.alloc(BYTES_PER_CIFF_DIRECTORY_ENTRY);
    buffer.writeUInt16LE(tag, 0);
    buffer.writeUInt32LE(length, 2);
    buffer.writeUInt32LE(offset, 6);
    return buffer;
  };

  let heap = heapHolding([entry(CIFF_TAG_CAPTURE_TIME, captureTime.length, 0)], captureTime);
  for (let level = 0; level < heapsTheCaptureTimeIsBuriedUnder; level++) {
    heap = heapHolding([entry(CIFF_TAG_IMAGE_PROPERTIES, heap.length, 0)], heap);
  }

  const header = Buffer.alloc(CIFF_HEADER_BYTES);
  header.write(TIFF_LITTLE_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt32LE(CIFF_HEADER_BYTES, 2);
  header.write('HEAPCCDR', 6, 'latin1');
  header.writeUInt32LE(0x00010002, 14);
  return Buffer.concat([header, heap]);
}
