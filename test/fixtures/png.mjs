import { PADDING_CHUNK_BODY_BYTES } from './filler.mjs';
import { TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';
const PNG_CHECKSUM_TABLE = (() => {
  const table = new Int32Array(256);
  for (let byteValue = 0; byteValue < 256; byteValue++) {
    let remainder = byteValue;
    for (let bit = 0; bit < 8; bit++) {
      remainder = (remainder & 1) === 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
    }
    table[byteValue] = remainder;
  }
  return table;
})();

function pngChecksumOf(bytes) {
  let remainder = 0xffffffff;
  for (const byte of bytes) remainder = PNG_CHECKSUM_TABLE[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  return (remainder ^ 0xffffffff) >>> 0;
}

function pngChunk(chunkType, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typeAndBody = Buffer.concat([Buffer.from(chunkType, 'latin1'), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(pngChecksumOf(typeAndBody));
  return Buffer.concat([length, typeAndBody, checksum]);
}

const SMALLEST_PNG_HEADER = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const SHORTEST_DEFLATE_STREAM = Buffer.from([0x78, 0x9c, 0x62, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);

export function pngFileHolding(chunksBeforeTheImage, { chunksAfterTheImage = [] } = {}) {
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE, 'latin1'),
    pngChunk('IHDR', SMALLEST_PNG_HEADER),
    ...chunksBeforeTheImage,
    pngChunk('IDAT', SHORTEST_DEFLATE_STREAM),
    ...chunksAfterTheImage,
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export const pngExifChunk = (dateTimeOriginal) =>
  pngChunk('eXIf', tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }));

// iTXt puts a compression flag, a compression method, a language tag and a translated
// keyword between the keyword and the text.
export const pngTextChunk = (keyword, text, { international = false } = {}) => (international
  ? pngChunk('iTXt', Buffer.from(`${keyword}\0\0\0en\0${keyword}\0${text}`, 'latin1'))
  : pngChunk('tEXt', Buffer.from(`${keyword}\0${text}`, 'latin1')));

export function pngLastWrittenChunk(cameraClock, chunkType = 'tIME') {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const lastWritten = Buffer.alloc(7);
  lastWritten.writeUInt16BE(year, 0);
  lastWritten[2] = month;
  lastWritten[3] = day;
  lastWritten[4] = hour;
  lastWritten[5] = minute;
  lastWritten[6] = second;
  return pngChunk(chunkType, lastWritten);
}

export const pngPaddingChunks = (howMany) =>
  Array.from({ length: howMany }, () => pngChunk('gAMA', Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));

export const pngStill = (dateTimeOriginal) => pngFileHolding([pngExifChunk(dateTimeOriginal)]);

export const pngStillDatedOnlyInItsText = (dateWrittenOut) =>
  pngFileHolding([pngTextChunk('Creation Time', dateWrittenOut)]);

export const pngStillDatedOnlyByWhenItWasLastWritten = (cameraClock) =>
  pngFileHolding([pngLastWrittenChunk(cameraClock)]);

const CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH = 300;

export const pngStillBuriedUnderMoreChunksThanAreWalked = (dateTimeOriginal) =>
  pngFileHolding([...pngPaddingChunks(CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH), pngExifChunk(dateTimeOriginal)]);
