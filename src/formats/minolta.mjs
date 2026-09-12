// Minolta MRW is a chain of length-prefixed blocks, one of which is a whole TIFF.
import { readTextAt, readUInt32At } from '../bytes.mjs';
import { ISO_BOX_TYPE_FIELD_BYTES } from './isoBaseMedia.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';

const MINOLTA_RAW_MARK = '\0MRM';
const MINOLTA_BLOCK_HOLDING_A_TIFF = '\0TTW';
const BYTES_IN_A_MINOLTA_BLOCK_HEADER = 8;
const BYTES_IN_A_MINOLTA_BLOCK_TYPE = ISO_BOX_TYPE_FIELD_BYTES;

export const startsWithAMinoltaRawMark = (byteSource) =>
  readTextAt(byteSource, 0, MINOLTA_RAW_MARK.length) === MINOLTA_RAW_MARK;

export function readCameraClockFromMinoltaRaw(byteSource) {
  let blockStart = BYTES_IN_A_MINOLTA_BLOCK_HEADER;
  while (blockStart + BYTES_IN_A_MINOLTA_BLOCK_HEADER <= byteSource.sizeInBytes) {
    const blockType = readTextAt(byteSource, blockStart, BYTES_IN_A_MINOLTA_BLOCK_TYPE);
    const blockLength = readUInt32At(byteSource, blockStart + BYTES_IN_A_MINOLTA_BLOCK_TYPE, false);
    if (blockType === null || blockLength === null || blockLength <= 0) return null;

    const contentStart = blockStart + BYTES_IN_A_MINOLTA_BLOCK_HEADER;
    if (blockType === MINOLTA_BLOCK_HOLDING_A_TIFF) return readCameraClockFromTiff(byteSource, contentStart);
    blockStart = contentStart + blockLength;
  }
  return null;
}
