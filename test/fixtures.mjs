import fs from 'node:fs';
import path from 'node:path';

const SECONDS_BETWEEN_1904_AND_1970 = 2082844800;
const MILLISECONDS_PER_SECOND = 1000;

const TIFF_LITTLE_ENDIAN_MARK = 'II';
export const TIFF_STANDARD_SIGNATURE = 0x2a;
export const PANASONIC_RAW_SIGNATURE = 0x55;

const TIFF_TAG_JPEG_FROM_RAW = 0x002e;
const TIFF_TAG_EXIF_DIRECTORY_POINTER = 0x8769;
const TIFF_TAG_DATE_TIME_ORIGINAL = 0x9003;
const TIFF_VALUE_TYPE_ASCII = 2;
const TIFF_VALUE_TYPE_LONG = 4;
const TIFF_VALUE_TYPE_UNDEFINED = 7;

const BYTES_IN_TIFF_HEADER = 8;
const BYTES_IN_TIFF_ENTRY_COUNT_FIELD = 2;
const BYTES_PER_TIFF_DIRECTORY_ENTRY = 12;
const BYTES_IN_NEXT_DIRECTORY_POINTER = 4;
const BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY =
  BYTES_IN_TIFF_ENTRY_COUNT_FIELD + BYTES_PER_TIFF_DIRECTORY_ENTRY + BYTES_IN_NEXT_DIRECTORY_POINTER;

const JPEG_MARKER_PREFIX = 0xff;
const JPEG_MARKER_START_OF_IMAGE = 0xd8;
const JPEG_MARKER_END_OF_IMAGE = 0xd9;
const JPEG_MARKER_APP0_JFIF = 0xe0;
const JPEG_MARKER_APP1_EXIF = 0xe1;
const JPEG_MARKER_QUANTIZATION_TABLE = 0xdb;
const JPEG_MARKER_RESTART_ZERO = 0xd0;
const JPEG_MARKER_COMMENT = 0xfe;
const SEGMENTS_MORE_THAN_THE_PARSER_WILL_WALK = 70;
const BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD = 2;
const EXIF_HEADER = 'Exif\0\0';
const JFIF_SEGMENT_BODY = Buffer.from([0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);

const ISO_BOX_HEADER_BYTES = 8;
const ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES = 16;
const ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS = 1;
const ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END = 0;
const MOVIE_HEADER_VERSION_WITH_32_BIT_TIMES = 0;
const MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES = 1;
const BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME = 4;
const BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES = 100;
const BYTES_IN_MOVIE_HEADER_WITH_64_BIT_TIMES = 120;
const BYTES_OF_PRETEND_VIDEO_DATA = 4096;
const PRETEND_VIDEO_DATA_FILL_BYTE = 7;
const PRETEND_HLG_PHOTO_FILL_BYTE = 3;
const BYTES_IN_PRETEND_HLG_PHOTO = 64;
const TRANSPORT_STREAM_SYNC_BYTE = 0x47;
const BYTES_IN_PRETEND_AVCHD_CLIP = 2048;
const BYTES_IN_PRETEND_CLIP_INFO_SIDECAR = 64;
const BYTES_MAKING_THE_SECOND_PHOTO_DIFFERENT = 64;
const SECOND_PHOTO_FILL_BYTE = 9;

export function writeFixtureFile(filePath, contents, fileTimestamp) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  if (fileTimestamp) fs.utimesSync(filePath, fileTimestamp, fileTimestamp);
}

function tiffDirectoryEntry({ tag, valueType, valueCount, valueOrOffset }) {
  const entry = Buffer.alloc(BYTES_PER_TIFF_DIRECTORY_ENTRY);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(valueType, 2);
  entry.writeUInt32LE(valueCount, 4);
  entry.writeUInt32LE(valueOrOffset, 8);
  return entry;
}

function tiffDirectoryHolding(entries) {
  const entryCount = Buffer.alloc(BYTES_IN_TIFF_ENTRY_COUNT_FIELD);
  entryCount.writeUInt16LE(entries.length, 0);
  const noFurtherDirectories = Buffer.alloc(BYTES_IN_NEXT_DIRECTORY_POINTER);
  return Buffer.concat([entryCount, ...entries, noFurtherDirectories]);
}

function tiffHeaderPointingAtFirstDirectory(signature, firstDirectoryOffset) {
  const header = Buffer.alloc(BYTES_IN_TIFF_HEADER);
  header.write(TIFF_LITTLE_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt16LE(signature, 2);
  header.writeUInt32LE(firstDirectoryOffset, 4);
  return header;
}

export function tiffFile({ signature, dateTimeOriginal }) {
  const mainDirectoryOffset = BYTES_IN_TIFF_HEADER;
  const header = tiffHeaderPointingAtFirstDirectory(signature, mainDirectoryOffset);

  if (dateTimeOriginal === null) {
    return Buffer.concat([header, tiffDirectoryHolding([])]);
  }

  const exifDirectoryOffset = mainDirectoryOffset + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValueOffset = exifDirectoryOffset + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValue = Buffer.from(`${dateTimeOriginal}\0`, 'latin1');

  const mainDirectory = tiffDirectoryHolding([tiffDirectoryEntry({
    tag: TIFF_TAG_EXIF_DIRECTORY_POINTER,
    valueType: TIFF_VALUE_TYPE_LONG,
    valueCount: 1,
    valueOrOffset: exifDirectoryOffset,
  })]);
  const exifDirectory = tiffDirectoryHolding([tiffDirectoryEntry({
    tag: TIFF_TAG_DATE_TIME_ORIGINAL,
    valueType: TIFF_VALUE_TYPE_ASCII,
    valueCount: dateValue.length,
    valueOrOffset: dateValueOffset,
  })]);
  return Buffer.concat([header, mainDirectory, exifDirectory, dateValue]);
}

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

export function panasonicRawWithDateOnlyInEmbeddedJpeg(dateTimeOriginal) {
  const embeddedJpeg = jpegFile(dateTimeOriginal);
  const mainDirectoryOffset = BYTES_IN_TIFF_HEADER;
  const embeddedJpegOffset = mainDirectoryOffset + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY;

  const header = tiffHeaderPointingAtFirstDirectory(PANASONIC_RAW_SIGNATURE, mainDirectoryOffset);
  const mainDirectory = tiffDirectoryHolding([tiffDirectoryEntry({
    tag: TIFF_TAG_JPEG_FROM_RAW,
    valueType: TIFF_VALUE_TYPE_UNDEFINED,
    valueCount: embeddedJpeg.length,
    valueOrOffset: embeddedJpegOffset,
  })]);
  return Buffer.concat([header, mainDirectory, embeddedJpeg]);
}

function isoBox(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_BYTES);
  header.writeUInt32BE(body.length + ISO_BOX_HEADER_BYTES, 0);
  header.write(boxType, 4, 'latin1');
  return Buffer.concat([header, body]);
}

function isoBoxWith64BitSize(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES);
  header.writeUInt32BE(ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS, 0);
  header.write(boxType, 4, 'latin1');
  header.writeBigUInt64BE(BigInt(body.length + ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES), 8);
  return Buffer.concat([header, body]);
}

function cameraClockToSecondsSince1904(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const asIfTheClockWereUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  return asIfTheClockWereUTC / MILLISECONDS_PER_SECOND + SECONDS_BETWEEN_1904_AND_1970;
}

function movieHeaderBox(cameraClock, creationTimeIs64Bit) {
  const secondsSince1904 = cameraClockToSecondsSince1904(cameraClock);
  const body = Buffer.alloc(creationTimeIs64Bit ? BYTES_IN_MOVIE_HEADER_WITH_64_BIT_TIMES : BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES);

  if (creationTimeIs64Bit) {
    body[0] = MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES;
    body.writeBigUInt64BE(BigInt(secondsSince1904), BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME);
  } else {
    body[0] = MOVIE_HEADER_VERSION_WITH_32_BIT_TIMES;
    body.writeUInt32BE(secondsSince1904, BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME);
  }
  return isoBox('mvhd', body);
}

export function movieFile(cameraClock, { creationTimeIs64Bit = false, videoDataUses64BitBoxSize = false } = {}) {
  const videoData = Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    videoDataUses64BitBoxSize ? isoBoxWith64BitSize('mdat', videoData) : isoBox('mdat', videoData),
    isoBox('moov', Buffer.concat([
      isoBox('udta', Buffer.alloc(16)),
      movieHeaderBox(cameraClock, creationTimeIs64Bit),
    ])),
  ]);
}

function isoBoxRunningToTheEndOfTheFile(boxType, body) {
  const header = Buffer.alloc(ISO_BOX_HEADER_BYTES);
  header.writeUInt32BE(ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END, 0);
  header.write(boxType, 4, 'latin1');
  return Buffer.concat([header, body]);
}

export function movieFileWhoseMovieBoxRunsToTheEnd(cameraClock) {
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    isoBox('mdat', Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)),
    isoBoxRunningToTheEndOfTheFile('moov', movieHeaderBox(cameraClock, false)),
  ]);
}

export function buildCardDump(directory, { everyFileStampedAt = null } = {}) {
  const stampFor = (whenItWasShot) => new Date(everyFileStampedAt ?? whenItWasShot);
  const firstCardFolder = path.join(directory, 'DCIM', '100_PANA');
  const secondCardFolder = path.join(directory, 'DCIM', '101_PANA');
  const avchdStreamFolder = path.join(directory, 'PRIVATE', 'AVCHD', 'BDMV', 'STREAM');
  const avchdClipInfoFolder = path.join(directory, 'PRIVATE', 'AVCHD', 'BDMV', 'CLIPINF');

  const rawAndJpegOfTheSameShot = '2026:08:27 09:07:01';
  writeFixtureFile(path.join(firstCardFolder, 'P1000001.JPG'), jpegFile(rawAndJpegOfTheSameShot), stampFor('2026-08-27T09:07:01'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000001.RW2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: rawAndJpegOfTheSameShot }), stampFor('2026-08-27T09:07:01'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000002.JPG'), jpegFile('2026:08:27 10:15:00'), stampFor('2026-08-27T10:15:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000002.RW2'),
    tiffFile({ signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: null }), stampFor('2026-08-27T10:15:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000003.RW2'),
    panasonicRawWithDateOnlyInEmbeddedJpeg('2026:08:27 11:00:00'), stampFor('2026-08-27T11:00:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000004.HSP'),
    Buffer.alloc(BYTES_IN_PRETEND_HLG_PHOTO, PRETEND_HLG_PHOTO_FILL_BYTE), stampFor('2026-08-27T12:00:00'));

  writeFixtureFile(path.join(firstCardFolder, 'P1000005.MP4'), movieFile('2026-08-28 00:20:00'), stampFor('2026-08-28T00:20:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000006.MP4'),
    movieFile('2026-08-28 14:00:00', { creationTimeIs64Bit: true, videoDataUses64BitBoxSize: true }), stampFor('2026-08-28T14:00:00'));
  writeFixtureFile(path.join(firstCardFolder, 'P1000007.MOV'), movieFile('2026-08-29 08:30:00'), stampFor('2026-08-29T08:30:00'));

  const differentPhotoReusingTheSameFileNumber = Buffer.concat([
    jpegFile('2026:08:27 18:00:00'),
    Buffer.alloc(BYTES_MAKING_THE_SECOND_PHOTO_DIFFERENT, SECOND_PHOTO_FILL_BYTE),
  ]);
  writeFixtureFile(path.join(secondCardFolder, 'P1000001.JPG'), differentPhotoReusingTheSameFileNumber, stampFor('2026-08-27T18:00:00'));

  writeFixtureFile(path.join(avchdStreamFolder, '00000.MTS'),
    Buffer.alloc(BYTES_IN_PRETEND_AVCHD_CLIP, TRANSPORT_STREAM_SYNC_BYTE), stampFor('2026-08-29T21:10:00'));
  writeFixtureFile(path.join(avchdClipInfoFolder, '00000.CPI'), Buffer.alloc(BYTES_IN_PRETEND_CLIP_INFO_SIDECAR));
  writeFixtureFile(path.join(directory, '.Spotlight-V100', 'junk.JPG'), jpegFile('1999:01:01 00:00:00'));

  return directory;
}
