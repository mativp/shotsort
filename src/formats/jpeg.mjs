// Walking a JPEG's segments as far as the Exif one, and no further: the image data itself
// is never read. Used both for real JPEGs and for the preview JPEG a raw carries.
import { readBytesAt, readTextAt, readUInt16At } from '../bytes.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';

const JPEG_START_OF_IMAGE = 0xffd8;
const JPEG_MARKER_PREFIX = 0xff;
const JPEG_MARKER_APP1 = 0xe1;
const JPEG_MARKER_START_OF_SCAN = 0xda;
const JPEG_MARKER_END_OF_IMAGE = 0xd9;
const JPEG_MARKERS_WITH_NO_LENGTH_FIELD = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8]);
const BYTES_IN_JPEG_MARKER = 2;
const BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD = 2;
const SHORTEST_VALID_JPEG_SEGMENT_LENGTH = 2;
const MOST_JPEG_SEGMENTS_BEFORE_THE_IMAGE_DATA = 64;

export const EXIF_HEADER = 'Exif\0\0';
const BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER = BYTES_IN_JPEG_MARKER + BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD;
const BYTES_FROM_SEGMENT_START_TO_TIFF_HEADER = BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER + EXIF_HEADER.length;

export const startsWithAJpegSignature = (byteSource) =>
  readUInt16At(byteSource, 0, false) === JPEG_START_OF_IMAGE;

export function readCameraClockFromJpeg(byteSource, jpegStart = 0) {
  if (readUInt16At(byteSource, jpegStart, false) !== JPEG_START_OF_IMAGE) return null;

  let segmentStart = jpegStart + BYTES_IN_JPEG_MARKER;
  for (let segmentIndex = 0; segmentIndex < MOST_JPEG_SEGMENTS_BEFORE_THE_IMAGE_DATA; segmentIndex++) {
    const markerBytes = readBytesAt(byteSource, segmentStart, BYTES_IN_JPEG_MARKER);
    if (markerBytes === null || markerBytes[0] !== JPEG_MARKER_PREFIX) return null;

    const marker = markerBytes[1];
    if (marker === JPEG_MARKER_START_OF_SCAN || marker === JPEG_MARKER_END_OF_IMAGE) return null;
    if (JPEG_MARKERS_WITH_NO_LENGTH_FIELD.has(marker)) {
      segmentStart += BYTES_IN_JPEG_MARKER;
      continue;
    }

    const segmentLength = readUInt16At(byteSource, segmentStart + BYTES_IN_JPEG_MARKER, false);
    if (segmentLength === null || segmentLength < SHORTEST_VALID_JPEG_SEGMENT_LENGTH) return null;

    const isExifSegment = marker === JPEG_MARKER_APP1
      && readTextAt(byteSource, segmentStart + BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER, EXIF_HEADER.length) === EXIF_HEADER;
    if (isExifSegment) {
      return readCameraClockFromTiff(byteSource, segmentStart + BYTES_FROM_SEGMENT_START_TO_TIFF_HEADER);
    }
    segmentStart += BYTES_IN_JPEG_MARKER + segmentLength;
  }
  return null;
}
