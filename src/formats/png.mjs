// PNG, which is what a phone screenshot and a good deal of what a scanner writes. Its
// chunks are length-prefixed and three of them can hold a date: an eXIf chunk holding a
// whole Exif block, which is what a phone writes; a tEXt keyword called Creation Time,
// which is what everything older writes; and a tIME chunk, which is only ever the moment
// the image was last written and so is the last thing tried.
import { readBytesAt, readTextAt, readUInt16At, readUInt32At } from '../bytes.mjs';
import { cameraClockFrom, cameraClockFromDateWrittenOut, cameraClockFromIso8601, onlyIfPlausible } from '../clock.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';
const BYTES_IN_A_PNG_CHUNK_LENGTH_FIELD = 4;
const BYTES_IN_A_PNG_CHUNK_TYPE = 4;
const BYTES_IN_A_PNG_CHUNK_CHECKSUM = 4;

const EXIF_CHUNK_TYPE = 'eXIf';
const LAST_WRITTEN_CHUNK_TYPE = 'tIME';
const BYTES_IN_A_LAST_WRITTEN_CHUNK = 7;
const TEXT_CHUNK_TYPES = ['tEXt', 'iTXt'];
const IMAGE_DATA_CHUNK_TYPE = 'IDAT';
const CREATION_TIME_KEYWORD = 'Creation Time';
const LONGEST_TEXT_CHUNK_WORTH_READING = 256;
const MOST_CHUNKS_BEFORE_THE_IMAGE_DATA = 256;

export const startsWithAPngSignature = (byteSource) =>
  readTextAt(byteSource, 0, PNG_SIGNATURE.length) === PNG_SIGNATURE;

// A text chunk is a keyword, a zero byte, and then the text. iTXt puts a compression flag,
// a compression method and two more zero-terminated strings in between, so the text is
// taken as whatever follows the last zero byte rather than counted to.
function creationTimeInTextChunk(byteSource, contentStart, contentEnd) {
  const text = readTextAt(byteSource, contentStart, Math.min(contentEnd - contentStart, LONGEST_TEXT_CHUNK_WORTH_READING));
  if (text === null) return null;
  const parts = text.split('\0');
  if (parts[0] !== CREATION_TIME_KEYWORD) return null;

  const written = parts[parts.length - 1];
  return onlyIfPlausible(cameraClockFromIso8601(written) ?? cameraClockFromDateWrittenOut(written));
}

// Year, month, day, hour, minute, second, one field after another, with only the year
// taking two bytes.
function lastWrittenTimeInChunk(byteSource, contentStart) {
  const fields = readBytesAt(byteSource, contentStart, BYTES_IN_A_LAST_WRITTEN_CHUNK);
  if (fields === null) return null;
  const year = readUInt16At(byteSource, contentStart, false);
  return onlyIfPlausible(cameraClockFrom(year, fields[2], fields[3], fields[4], fields[5], fields[6]));
}

export function readCameraClockFromPng(byteSource) {
  if (!startsWithAPngSignature(byteSource)) return null;

  let chunkStart = PNG_SIGNATURE.length;
  let creationTime = null;
  let lastWritten = null;
  const whateverWasFound = () => creationTime ?? lastWritten;

  for (let chunkIndex = 0; chunkIndex < MOST_CHUNKS_BEFORE_THE_IMAGE_DATA; chunkIndex++) {
    const contentLength = readUInt32At(byteSource, chunkStart, false);
    const chunkType = readTextAt(byteSource, chunkStart + BYTES_IN_A_PNG_CHUNK_LENGTH_FIELD, BYTES_IN_A_PNG_CHUNK_TYPE);
    if (chunkType === IMAGE_DATA_CHUNK_TYPE) return whateverWasFound();

    const contentStart = chunkStart + BYTES_IN_A_PNG_CHUNK_LENGTH_FIELD + BYTES_IN_A_PNG_CHUNK_TYPE;
    if (chunkType === EXIF_CHUNK_TYPE) {
      const clock = readCameraClockFromTiff(byteSource, contentStart);
      if (clock !== null) return clock;
    } else if (TEXT_CHUNK_TYPES.includes(chunkType)) {
      creationTime ??= creationTimeInTextChunk(byteSource, contentStart, contentStart + contentLength);
    } else if (chunkType === LAST_WRITTEN_CHUNK_TYPE) {
      lastWritten ??= lastWrittenTimeInChunk(byteSource, contentStart);
    }
    chunkStart = contentStart + contentLength + BYTES_IN_A_PNG_CHUNK_CHECKSUM;
  }
  return whateverWasFound();
}
