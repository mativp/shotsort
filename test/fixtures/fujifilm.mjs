import { BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE } from './filler.mjs';
import { jpegFile } from './jpeg.mjs';

const FUJIFILM_RAW_HEADER_BYTES = 148;
const BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER = 84;

export function fujifilmRawFile(dateTimeOriginal) {
  const header = Buffer.alloc(FUJIFILM_RAW_HEADER_BYTES);
  header.write('FUJIFILMCCD-RAW 0201FF129502', 0, 'latin1');
  header.write('X-T5', 32, 'latin1');
  const embeddedJpeg = jpegFile(dateTimeOriginal);
  header.writeUInt32BE(FUJIFILM_RAW_HEADER_BYTES, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER);
  header.writeUInt32BE(embeddedJpeg.length, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER + 4);
  return Buffer.concat([header, embeddedJpeg, Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)]);
}
