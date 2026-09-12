// Canon, twice over. CR3 is an ISO box file with the Exif hidden inside a uuid box, and
// CRW is CIFF: a heap whose directory sits at the end and whose capture time is seconds
// since 1970 rather than text.
import { readBytesAt, readTextAt, readUInt16At, readUInt32At } from '../bytes.mjs';
import {
  BYTES_IN_AN_ISO_UUID, MOVIE_BOX_TYPE, UUID_BOX_TYPE, findIsoBox, findIsoBoxWhere,
} from './isoBaseMedia.mjs';
import { byteOrderAt, readCameraClockFromTiff } from './tiff.mjs';
import { cameraClockFromSecondsSince1970, onlyIfPlausible } from '../clock.mjs';

const CANON_METADATA_UUID = '85c0b687820f11e08111f4ce462b6a48';
const CANON_EXIF_BOX_TYPES_IN_PREFERENCE_ORDER = ['CMT2', 'CMT1'];

// CIFF names its own flavour after the mark: HEAPCCDR for the raw, HEAPJPGM for the
// thumbnail written beside it. Both keep the capture time in the same place.
const CANON_CIFF_MARKS = ['HEAPCCDR', 'HEAPJPGM'];
const BYTES_IN_A_CIFF_MARK = 8;
const BYTES_FROM_FILE_START_TO_THE_CIFF_HEAP = 2;
const BYTES_FROM_FILE_START_TO_THE_CIFF_MARK = 6;
const CIFF_TAG_CAPTURE_TIME = 0x180e;
const CIFF_DATA_TYPE_MASK = 0x3800;
const CIFF_DATA_TYPE_SUBDIRECTORY = 0x2800;
const BYTES_PER_CIFF_DIRECTORY_ENTRY = 10;
const BYTES_IN_A_CIFF_DIRECTORY_POINTER = 4;
const BYTES_IN_A_CIFF_ENTRY_COUNT_FIELD = 2;
const MOST_ENTRIES_A_REAL_CIFF_DIRECTORY_HAS = 512;
const DEEPEST_A_REAL_CIFF_DIRECTORY_NESTS = 8;

export function readCameraClockFromCanonRaw(byteSource) {
  const movieBox = findIsoBox(byteSource, 0, byteSource.sizeInBytes, MOVIE_BOX_TYPE);
  if (movieBox === null) return null;

  const canonMetadata = findIsoBoxWhere(byteSource, movieBox.contentStart, movieBox.contentEnd,
    (boxType, box) => boxType === UUID_BOX_TYPE
      && readBytesAt(byteSource, box.contentStart, BYTES_IN_AN_ISO_UUID)?.toString('hex') === CANON_METADATA_UUID);
  if (canonMetadata === null) return null;

  const insideTheUuid = canonMetadata.contentStart + BYTES_IN_AN_ISO_UUID;
  for (const boxType of CANON_EXIF_BOX_TYPES_IN_PREFERENCE_ORDER) {
    const exifBox = findIsoBox(byteSource, insideTheUuid, canonMetadata.contentEnd, boxType);
    if (exifBox === null) continue;
    const clock = readCameraClockFromTiff(byteSource, exifBox.contentStart);
    if (clock !== null) return clock;
  }
  return null;
}

export const startsWithACanonCiffMark = (byteSource) =>
  CANON_CIFF_MARKS.includes(readTextAt(byteSource, BYTES_FROM_FILE_START_TO_THE_CIFF_MARK, BYTES_IN_A_CIFF_MARK));

function findCaptureTimeInCiffHeap(byteSource, heapStart, heapEnd, isLittleEndian, howDeep) {
  if (howDeep > DEEPEST_A_REAL_CIFF_DIRECTORY_NESTS) return null;
  const directoryPointerAt = heapEnd - BYTES_IN_A_CIFF_DIRECTORY_POINTER;
  if (directoryPointerAt < heapStart) return null;

  const directoryOffset = readUInt32At(byteSource, directoryPointerAt, isLittleEndian);
  if (directoryOffset === null) return null;
  const directoryStart = heapStart + directoryOffset;
  if (directoryStart < heapStart || directoryStart + BYTES_IN_A_CIFF_ENTRY_COUNT_FIELD > heapEnd) return null;

  const entryCount = readUInt16At(byteSource, directoryStart, isLittleEndian);
  if (entryCount === null || entryCount === 0 || entryCount > MOST_ENTRIES_A_REAL_CIFF_DIRECTORY_HAS) return null;

  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const entryStart = directoryStart + BYTES_IN_A_CIFF_ENTRY_COUNT_FIELD
      + entryIndex * BYTES_PER_CIFF_DIRECTORY_ENTRY;
    const tag = readUInt16At(byteSource, entryStart, isLittleEndian);
    const valueLength = readUInt32At(byteSource, entryStart + 2, isLittleEndian);
    const valueOffset = readUInt32At(byteSource, entryStart + 6, isLittleEndian);
    if (tag === null || valueLength === null || valueOffset === null) return null;

    const valueStart = heapStart + valueOffset;
    const valueEnd = valueStart + valueLength;
    if (valueStart < heapStart || valueEnd > heapEnd) continue;

    if ((tag & CIFF_DATA_TYPE_MASK) === CIFF_DATA_TYPE_SUBDIRECTORY) {
      const found = findCaptureTimeInCiffHeap(byteSource, valueStart, valueEnd, isLittleEndian, howDeep + 1);
      if (found !== null) return found;
    } else if (tag === CIFF_TAG_CAPTURE_TIME) {
      const secondsSince1970 = readUInt32At(byteSource, valueStart, isLittleEndian);
      if (secondsSince1970 === null || secondsSince1970 === 0) continue;
      const clock = onlyIfPlausible(cameraClockFromSecondsSince1970(secondsSince1970));
      if (clock !== null) return clock;
    }
  }
  return null;
}

export function readCameraClockFromCanonCiffRaw(byteSource) {
  const byteOrder = byteOrderAt(byteSource, 0);
  if (byteOrder === null) return null;

  const heapStart = readUInt32At(byteSource, BYTES_FROM_FILE_START_TO_THE_CIFF_HEAP, byteOrder.isLittleEndian);
  if (heapStart === null || heapStart <= 0 || heapStart >= byteSource.sizeInBytes) return null;
  return findCaptureTimeInCiffHeap(byteSource, heapStart, byteSource.sizeInBytes, byteOrder.isLittleEndian, 0);
}
