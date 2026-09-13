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

function pngFileHolding(chunksBeforeTheImage) {
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE, 'latin1'),
    pngChunk('IHDR', SMALLEST_PNG_HEADER),
    ...chunksBeforeTheImage,
    pngChunk('IDAT', SHORTEST_DEFLATE_STREAM),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pngStill(dateTimeOriginal) {
  return pngFileHolding([
    pngChunk('eXIf', tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal })),
  ]);
}

export function pngStillDatedOnlyInItsText(dateWrittenOut) {
  return pngFileHolding([
    pngChunk('tEXt', Buffer.from(`Creation Time\0${dateWrittenOut}`, 'latin1')),
  ]);
}

export function pngStillDatedOnlyByWhenItWasLastWritten(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const lastWritten = Buffer.alloc(7);
  lastWritten.writeUInt16BE(year, 0);
  lastWritten[2] = month;
  lastWritten[3] = day;
  lastWritten[4] = hour;
  lastWritten[5] = minute;
  lastWritten[6] = second;
  return pngFileHolding([pngChunk('tIME', lastWritten)]);
}

const CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH = 300;

export function pngStillBuriedUnderMoreChunksThanAreWalked(dateTimeOriginal) {
  const padding = Array.from({ length: CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH },
    () => pngChunk('gAMA', Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));
  return pngFileHolding([...padding, pngChunk('eXIf', tiffFile({
    signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal,
  }))]);
}
