// JPEG XL, in the form that carries metadata: a box file, like HEIC and CR3, whose Exif
// sits in a top-level box rather than behind the item tables a HEIC uses. The other form
// is a bare codestream with nowhere to put a date, and is left alone.
import { readBytesAt } from '../bytes.mjs';
import { findIsoBox } from './isoBaseMedia.mjs';
import { readCameraClockFromExifPayload } from './heif.mjs';

const JPEG_XL_CONTAINER_SIGNATURE = '0000000c4a584c200d0a870a';
const EXIF_BOX_TYPE = 'Exif';

export const startsWithAJpegXlContainerSignature = (byteSource) =>
  readBytesAt(byteSource, 0, JPEG_XL_CONTAINER_SIGNATURE.length / 2)?.toString('hex') === JPEG_XL_CONTAINER_SIGNATURE;

export function readCameraClockFromJpegXl(byteSource) {
  if (!startsWithAJpegXlContainerSignature(byteSource)) return null;
  const exifBox = findIsoBox(byteSource, 0, byteSource.sizeInBytes, EXIF_BOX_TYPE);
  if (exifBox === null) return null;
  return readCameraClockFromExifPayload(byteSource, exifBox.contentStart, exifBox.contentEnd - exifBox.contentStart);
}
