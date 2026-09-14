// Fujifilm RAF keeps no date of its own: the pointer near the top of the file leads to a
// preview JPEG, and that JPEG's Exif is the date.
import { readTextAt, readUInt32At } from '../bytes.mjs';
import { readCameraClockFromJpeg } from './jpeg.mjs';

const FUJIFILM_RAW_MARK = 'FUJIFILM';
const BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER = 84;

export const startsWithAFujifilmRawMark = (byteSource) =>
  readTextAt(byteSource, 0, FUJIFILM_RAW_MARK.length) === FUJIFILM_RAW_MARK;

export function readCameraClockFromFujifilmRaw(byteSource) {
  if (!startsWithAFujifilmRawMark(byteSource)) return null;
  const embeddedJpegStart = readUInt32At(byteSource, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER, false);
  return readCameraClockFromJpeg(byteSource, embeddedJpegStart);
}
