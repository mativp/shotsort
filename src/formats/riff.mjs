// RIFF: a chain of length-prefixed chunks, some of which are lists of more chunks. AVI off
// a camcorder or a compact's movie mode, and WebP off a phone, are both built this way.
//
// Three places hold a date and they are not equally trustworthy. A WebP's EXIF chunk is a
// whole Exif block and says what the camera recorded; AVI's IDIT chunk is the camcorder's
// own recording time; ICRD in the INFO list is whatever wrote the file last, which on a
// camera is still the shoot but in an editor is the edit.
import { readTextAt, readUInt32At } from '../bytes.mjs';
import { cameraClockFromDateWrittenOut, onlyIfPlausible } from '../clock.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';
import { EXIF_HEADER } from './jpeg.mjs';

const RIFF_MARK = 'RIFF';
const RIFF_MARK_FOR_A_FILE_PAST_FOUR_GIGABYTES = 'RF64';
const RIFF_LIST_CHUNK = 'LIST';
const BYTES_IN_A_RIFF_CHUNK_HEADER = 8;
const BYTES_IN_A_RIFF_CHUNK_TYPE = 4;
const BYTES_IN_A_RIFF_FORM_TYPE = 4;

const RECORDING_DATE_CHUNK = 'IDIT';
const DATE_THE_FILE_WAS_CREATED_CHUNK = 'ICRD';
const EXIF_CHUNK_TYPES = ['EXIF', 'exif'];
const LONGEST_DATE_CHUNK_WORTH_READING = 64;
const MOST_CHUNKS_A_REAL_LIST_HAS = 1024;
const DEEPEST_A_REAL_LIST_NESTS = 4;

export const startsWithARiffMark = (byteSource) => {
  const mark = readTextAt(byteSource, 0, BYTES_IN_A_RIFF_CHUNK_TYPE);
  return mark === RIFF_MARK || mark === RIFF_MARK_FOR_A_FILE_PAST_FOUR_GIGABYTES;
};

// A chunk is padded to an even length, and the pad byte is not counted in the length.
const afterChunk = (chunkStart, chunkLength) =>
  chunkStart + BYTES_IN_A_RIFF_CHUNK_HEADER + chunkLength + (chunkLength % 2);

function eachChunkIn(byteSource, searchStart, searchEnd, visit) {
  let chunkStart = searchStart;
  for (let chunkIndex = 0; chunkIndex < MOST_CHUNKS_A_REAL_LIST_HAS; chunkIndex++) {
    if (chunkStart + BYTES_IN_A_RIFF_CHUNK_HEADER > searchEnd) return null;
    const chunkType = readTextAt(byteSource, chunkStart, BYTES_IN_A_RIFF_CHUNK_TYPE);
    const chunkLength = readUInt32At(byteSource, chunkStart + BYTES_IN_A_RIFF_CHUNK_TYPE, true);

    const contentStart = chunkStart + BYTES_IN_A_RIFF_CHUNK_HEADER;
    const contentEnd = Math.min(contentStart + chunkLength, searchEnd);
    const found = visit(chunkType, contentStart, contentEnd);
    if (found !== null) return found;

    chunkStart = afterChunk(chunkStart, chunkLength);
  }
  return null;
}

const dateWrittenInChunk = (byteSource, contentStart, contentEnd) => onlyIfPlausible(
  cameraClockFromDateWrittenOut(
    readTextAt(byteSource, contentStart, Math.min(contentEnd - contentStart, LONGEST_DATE_CHUNK_WORTH_READING)),
  ),
);

// An Exif chunk may hold the Exif header a JPEG segment would carry, or start straight at
// the TIFF byte order mark; WebP writes it one way and the compacts that put Exif in an
// AVI write it the other.
function readExifChunk(byteSource, contentStart) {
  const preamble = readTextAt(byteSource, contentStart, EXIF_HEADER.length);
  const tiffStart = preamble === EXIF_HEADER ? contentStart + EXIF_HEADER.length : contentStart;
  return readCameraClockFromTiff(byteSource, tiffStart);
}

function findDateIn(byteSource, searchStart, searchEnd, wantedTypes, howDeep) {
  return eachChunkIn(byteSource, searchStart, searchEnd, (chunkType, contentStart, contentEnd) => {
    if (chunkType === RIFF_LIST_CHUNK) {
      if (howDeep >= DEEPEST_A_REAL_LIST_NESTS) return null;
      return findDateIn(byteSource, contentStart + BYTES_IN_A_RIFF_FORM_TYPE, contentEnd, wantedTypes, howDeep + 1);
    }
    if (!wantedTypes.includes(chunkType)) return null;
    return EXIF_CHUNK_TYPES.includes(chunkType)
      ? readExifChunk(byteSource, contentStart)
      : dateWrittenInChunk(byteSource, contentStart, contentEnd);
  });
}

export function readCameraClockFromRiff(byteSource) {
  if (!startsWithARiffMark(byteSource)) return null;
  const insideTheFile = BYTES_IN_A_RIFF_CHUNK_HEADER + BYTES_IN_A_RIFF_FORM_TYPE;

  const chunksInTheOrderTheyAreTrusted = [EXIF_CHUNK_TYPES, [RECORDING_DATE_CHUNK], [DATE_THE_FILE_WAS_CREATED_CHUNK]];
  for (const wantedTypes of chunksInTheOrderTheyAreTrusted) {
    const clock = findDateIn(byteSource, insideTheFile, byteSource.sizeInBytes, wantedTypes, 0);
    if (clock !== null) return clock;
  }
  return null;
}
