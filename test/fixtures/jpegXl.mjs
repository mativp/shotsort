import { TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';
import { isoBox } from './isoBaseMedia.mjs';

const JPEG_XL_CONTAINER_SIGNATURE = Buffer.from('0000000c4a584c200d0a870a', 'hex');
const BYTES_IN_A_JPEG_XL_EXIF_PREAMBLE = 4;

export function jpegXlStill(dateTimeOriginal) {
  const exifPayload = Buffer.concat([
    Buffer.alloc(BYTES_IN_A_JPEG_XL_EXIF_PREAMBLE),
    tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
  ]);
  return Buffer.concat([
    JPEG_XL_CONTAINER_SIGNATURE,
    isoBox('ftyp', Buffer.from('jxl jxl ', 'latin1')),
    isoBox('Exif', exifPayload),
    isoBox('jxlc', Buffer.alloc(32)),
  ]);
}
