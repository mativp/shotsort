import { EXIF_HEADER, TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';

const JPEG_MARKER_PREFIX = 0xff;
const JPEG_MARKER_START_OF_IMAGE = 0xd8;
const JPEG_MARKER_END_OF_IMAGE = 0xd9;
const JPEG_MARKER_APP0_JFIF = 0xe0;
const JPEG_MARKER_APP1_EXIF = 0xe1;
const JPEG_MARKER_QUANTIZATION_TABLE = 0xdb;
const JPEG_MARKER_RESTART_ZERO = 0xd0;
const JPEG_MARKER_COMMENT = 0xfe;
const JPEG_MARKER_APP2_ICC_PROFILE = 0xe2;
const SEGMENTS_MORE_THAN_THE_PARSER_WILL_WALK = 4100;
const SEGMENTS_A_COLOUR_MANAGED_PHOTO_REALLY_CARRIES = 96;
const BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD = 2;

const JFIF_SEGMENT_BODY = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

function jpegMarker(markerByte) {
  return Buffer.from([JPEG_MARKER_PREFIX, markerByte]);
}

function jpegSegment(markerByte, body) {
  const length = Buffer.alloc(BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD);
  length.writeUInt16BE(body.length + BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD, 0);
  return Buffer.concat([jpegMarker(markerByte), length, body]);
}

export function jpegFile(dateTimeOriginal) {
  const exifBody = Buffer.concat([
    Buffer.from(EXIF_HEADER, 'latin1'),
    tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
  ]);
  return Buffer.concat([
    jpegMarker(JPEG_MARKER_START_OF_IMAGE),
    jpegSegment(JPEG_MARKER_APP0_JFIF, JFIF_SEGMENT_BODY),
    jpegSegment(JPEG_MARKER_APP1_EXIF, exifBody),
    jpegSegment(JPEG_MARKER_QUANTIZATION_TABLE, Buffer.alloc(2)),
    jpegMarker(JPEG_MARKER_END_OF_IMAGE),
  ]);
}

export function jpegFileWithARestartMarkerFirst(dateTimeOriginal) {
  const complete = jpegFile(dateTimeOriginal);
  const afterTheStartOfImage = complete.subarray(2);
  return Buffer.concat([
    jpegMarker(JPEG_MARKER_START_OF_IMAGE),
    jpegMarker(JPEG_MARKER_RESTART_ZERO),
    afterTheStartOfImage,
  ]);
}

export function jpegFileBuriedUnderManySegments(dateTimeOriginal) {
  const complete = jpegFile(dateTimeOriginal);
  const afterTheStartOfImage = complete.subarray(2);
  const filler = [];
  for (let segment = 0; segment < SEGMENTS_MORE_THAN_THE_PARSER_WILL_WALK; segment++) {
    filler.push(jpegSegment(JPEG_MARKER_COMMENT, Buffer.alloc(2)));
  }
  return Buffer.concat([jpegMarker(JPEG_MARKER_START_OF_IMAGE), ...filler, afterTheStartOfImage]);
}

// What a photo with a large ICC profile and a depth map actually looks like: the Exif is
// still the first APP1, but a great many segments stand in front of it.
export function jpegFileBehindAsManySegmentsAsAPhotoReallyHas(dateTimeOriginal) {
  const complete = jpegFile(dateTimeOriginal);
  const afterTheStartOfImage = complete.subarray(2);
  const filler = [];
  for (let segment = 0; segment < SEGMENTS_A_COLOUR_MANAGED_PHOTO_REALLY_CARRIES; segment++) {
    filler.push(jpegSegment(JPEG_MARKER_APP2_ICC_PROFILE, Buffer.alloc(2)));
  }
  return Buffer.concat([jpegMarker(JPEG_MARKER_START_OF_IMAGE), ...filler, afterTheStartOfImage]);
}

export function jpegFilePaddedTo(dateTimeOriginal, totalBytes) {
  const complete = jpegFile(dateTimeOriginal);
  if (totalBytes < complete.length) {
    throw new Error(`a jpeg carrying a date cannot be smaller than ${complete.length} bytes`);
  }
  return Buffer.concat([complete, Buffer.alloc(totalBytes - complete.length)]);
}
