// Minolta MRW is a chain of length-prefixed blocks, one of which is a whole TIFF.
import { readTextAt, readUInt32At } from '../bytes.mjs';
import { ISO_BOX_TYPE_FIELD_BYTES } from './isoBaseMedia.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';

// Minolta wrote \0MRM; Konica Minolta's later bodies wrote \0MRI. The blocks inside are
// laid out the same either way.
const MINOLTA_RAW_MARKS = ['\0MRM', '\0MRI'];
const BYTES_IN_A_MINOLTA_RAW_MARK = 4;
const MINOLTA_BLOCK_HOLDING_A_TIFF = '\0TTW';
const BYTES_IN_A_MINOLTA_BLOCK_HEADER = 8;
const BYTES_IN_A_MINOLTA_BLOCK_TYPE = ISO_BOX_TYPE_FIELD_BYTES;

export const startsWithAMinoltaRawMark = (byteSource) =>
  MINOLTA_RAW_MARKS.includes(readTextAt(byteSource, 0, BYTES_IN_A_MINOLTA_RAW_MARK));

export function readCameraClockFromMinoltaRaw(byteSource) {
  if (!startsWithAMinoltaRawMark(byteSource)) return null;
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
