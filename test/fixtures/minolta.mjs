import { bigEndianUInt32 } from './bytes.mjs';
import { bigEndianTiffFile } from './tiff.mjs';

export function minoltaRawFile(dateTimeOriginal) {
  const minoltaBlock = (blockType, body) => {
    const header = Buffer.alloc(8);
    header.write(blockType, 0, 'latin1');
    header.writeUInt32BE(body.length, 4);
    return Buffer.concat([header, body]);
  };
  const thumbnail = minoltaBlock('\0PRD', Buffer.alloc(24, 3));
  const exifBlock = minoltaBlock('\0TTW', bigEndianTiffFile(dateTimeOriginal));
  const whiteBalance = minoltaBlock('\0WBG', Buffer.alloc(16, 4));
  const body = Buffer.concat([thumbnail, exifBlock, whiteBalance]);
  return Buffer.concat([minoltaBlock('\0MRM', Buffer.alloc(0)).subarray(0, 4),
    bigEndianUInt32(body.length),
    body, Buffer.alloc(64, 5)]);
}
