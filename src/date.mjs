import fs from 'node:fs';

export const MEDIA_FILE_EXTENSIONS = new Set([
  '.JPG', '.JPEG', '.MPO', '.HSP', '.HIF', '.HEIC',
  '.RW2', '.RAW', '.RWL', '.DNG', '.TIF', '.TIFF',
  '.MP4', '.MOV', '.MTS', '.M2TS', '.AVI',
]);

export const DATE_SOURCE = {
  exifMetadata: 'exif',
  videoHeader: 'video',
  siblingFile: 'sibling',
  fileTimestamp: 'file-timestamp',
};

const SECONDS_BETWEEN_1904_AND_1970 = 2082844800;
const MILLISECONDS_PER_SECOND = 1000;
const EARLIEST_PLAUSIBLE_YEAR = 1995;
const LATEST_PLAUSIBLE_YEAR = 2100;

const TIFF_LITTLE_ENDIAN_MARK = 'II';
const TIFF_BIG_ENDIAN_MARK = 'MM';
const TIFF_STANDARD_SIGNATURE = 0x2a;
const PANASONIC_RAW_SIGNATURE = 0x55;
const TIFF_SIGNATURE_POSITION = 2;
const TIFF_FIRST_DIRECTORY_POINTER_POSITION = 4;

const TIFF_TAG_MODIFY_DATE = 0x0132;
const TIFF_TAG_JPEG_FROM_RAW = 0x002e;
const TIFF_TAG_EXIF_DIRECTORY_POINTER = 0x8769;
const TIFF_TAG_DATE_TIME_ORIGINAL = 0x9003;
const TIFF_TAG_CREATE_DATE = 0x9004;

const TIFF_VALUE_TYPE_ASCII = 2;
const BYTES_PER_TIFF_VALUE_TYPE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
const BYTES_PER_UNKNOWN_TIFF_VALUE_TYPE = 1;
const BYTES_IN_TIFF_ENTRY_COUNT_FIELD = 2;
const BYTES_PER_TIFF_DIRECTORY_ENTRY = 12;
const BYTES_FROM_ENTRY_START_TO_VALUE_FIELD = 8;
const LARGEST_VALUE_STORED_INSIDE_AN_ENTRY_IN_BYTES = 4;
const MOST_ENTRIES_A_REAL_DIRECTORY_HAS = 512;
const LONGEST_DATE_STRING_IN_BYTES = 32;

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
const EXIF_HEADER = 'Exif\0\0';
const BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER = BYTES_IN_JPEG_MARKER + BYTES_IN_JPEG_SEGMENT_LENGTH_FIELD;
const BYTES_FROM_SEGMENT_START_TO_TIFF_HEADER = BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER + EXIF_HEADER.length;

const ISO_BOX_HEADER_BYTES = 8;
const ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES = 16;
const ISO_BOX_SIZE_FIELD_BYTES = 4;
const ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS = 1;
const ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END = 0;
const ISO_BOX_TYPE_FIELD_BYTES = 4;
const MOVIE_BOX_TYPE = 'moov';
const MOVIE_HEADER_BOX_TYPE = 'mvhd';
const MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES = 1;
const BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME = 4;
const BYTES_IN_32_BIT_CREATION_TIME = 4;
const BYTES_IN_64_BIT_CREATION_TIME = 8;

const EXIF_DATE_TIME_PATTERN = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})/;
const TIMESTAMP_YEAR_RANGE = [0, 4];
const TIMESTAMP_MONTH_RANGE = [5, 7];
const TIMESTAMP_DAY_RANGE = [8, 10];
const TIMESTAMP_HOUR_RANGE = [11, 13];

const twoDigits = (number) => String(number).padStart(2, '0');

const formatTimestamp = ({ year, month, day, hour, minute, second }) =>
  `${year}-${twoDigits(month)}-${twoDigits(day)} ${twoDigits(hour)}:${twoDigits(minute)}:${twoDigits(second)}`;

const readBytesAt = (fileDescriptor, position, byteCount) => {
  const buffer = Buffer.alloc(byteCount);
  const bytesRead = fs.readSync(fileDescriptor, buffer, 0, byteCount, position);
  return bytesRead === byteCount ? buffer : null;
};

const readTextAt = (fileDescriptor, position, byteCount) =>
  readBytesAt(fileDescriptor, position, byteCount)?.toString('latin1') ?? null;

const readUInt16At = (fileDescriptor, position, isLittleEndian) => {
  const bytes = readBytesAt(fileDescriptor, position, 2);
  if (bytes === null) return null;
  return isLittleEndian ? bytes.readUInt16LE() : bytes.readUInt16BE();
};

const readUInt32At = (fileDescriptor, position, isLittleEndian) => {
  const bytes = readBytesAt(fileDescriptor, position, 4);
  if (bytes === null) return null;
  return isLittleEndian ? bytes.readUInt32LE() : bytes.readUInt32BE();
};

const readUInt64At = (fileDescriptor, position) => {
  const bytes = readBytesAt(fileDescriptor, position, 8);
  return bytes === null ? null : Number(bytes.readBigUInt64BE());
};

function exifDateTimeToTimestamp(exifDateTime) {
  const parts = EXIF_DATE_TIME_PATTERN.exec(exifDateTime);
  if (parts === null) return null;
  const [, year, month, day, timeOfDay] = parts;
  return `${year}-${month}-${day} ${timeOfDay}`;
}

function readTiffDirectoryEntries(fileDescriptor, tiffStart, directoryStart, isLittleEndian) {
  const entryCount = readUInt16At(fileDescriptor, directoryStart, isLittleEndian);
  if (entryCount === null || entryCount === 0 || entryCount > MOST_ENTRIES_A_REAL_DIRECTORY_HAS) return [];

  const entries = [];
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const entryStart = directoryStart + BYTES_IN_TIFF_ENTRY_COUNT_FIELD + entryIndex * BYTES_PER_TIFF_DIRECTORY_ENTRY;
    const valueFieldStart = entryStart + BYTES_FROM_ENTRY_START_TO_VALUE_FIELD;
    const tag = readUInt16At(fileDescriptor, entryStart, isLittleEndian);
    const valueType = readUInt16At(fileDescriptor, entryStart + 2, isLittleEndian);
    const valueCount = readUInt32At(fileDescriptor, entryStart + 4, isLittleEndian);
    if (tag === null || valueCount === null) break;

    const bytesPerValue = BYTES_PER_TIFF_VALUE_TYPE[valueType] ?? BYTES_PER_UNKNOWN_TIFF_VALUE_TYPE;
    const valueSizeInBytes = bytesPerValue * valueCount;
    const valueIsStoredInsideTheEntry = valueSizeInBytes <= LARGEST_VALUE_STORED_INSIDE_AN_ENTRY_IN_BYTES;
    const valueStart = valueIsStoredInsideTheEntry
      ? valueFieldStart
      : tiffStart + readUInt32At(fileDescriptor, valueFieldStart, isLittleEndian);

    entries.push({ tag, valueType, valueStart, valueSizeInBytes });
  }
  return entries;
}

function readAsciiEntry(fileDescriptor, entry) {
  const text = readTextAt(fileDescriptor, entry.valueStart, Math.min(entry.valueSizeInBytes, LONGEST_DATE_STRING_IN_BYTES));
  return text === null ? null : text.split('\0')[0].trim();
}

function findEntry(entries, tag, valueType) {
  return entries.find((entry) => entry.tag === tag && entry.valueType === valueType) ?? null;
}

function readTimestampFromTiff(fileDescriptor, tiffStart, { mayFallBackToEmbeddedJpeg }) {
  const byteOrderMark = readTextAt(fileDescriptor, tiffStart, 2);
  if (byteOrderMark !== TIFF_LITTLE_ENDIAN_MARK && byteOrderMark !== TIFF_BIG_ENDIAN_MARK) return null;
  const isLittleEndian = byteOrderMark === TIFF_LITTLE_ENDIAN_MARK;

  const signature = readUInt16At(fileDescriptor, tiffStart + TIFF_SIGNATURE_POSITION, isLittleEndian);
  if (signature !== TIFF_STANDARD_SIGNATURE && signature !== PANASONIC_RAW_SIGNATURE) return null;

  const firstDirectoryOffset = readUInt32At(fileDescriptor, tiffStart + TIFF_FIRST_DIRECTORY_POINTER_POSITION, isLittleEndian);
  if (firstDirectoryOffset === null) return null;

  const mainEntries = readTiffDirectoryEntries(fileDescriptor, tiffStart, tiffStart + firstDirectoryOffset, isLittleEndian);
  const exifDirectoryPointer = mainEntries.find((entry) => entry.tag === TIFF_TAG_EXIF_DIRECTORY_POINTER) ?? null;
  const exifDirectoryOffset = exifDirectoryPointer === null
    ? null
    : readUInt32At(fileDescriptor, exifDirectoryPointer.valueStart, isLittleEndian);
  const exifEntries = exifDirectoryOffset === null
    ? []
    : readTiffDirectoryEntries(fileDescriptor, tiffStart, tiffStart + exifDirectoryOffset, isLittleEndian);

  const dateEntriesInPreferenceOrder = [
    findEntry(exifEntries, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII),
    findEntry(exifEntries, TIFF_TAG_CREATE_DATE, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_MODIFY_DATE, TIFF_VALUE_TYPE_ASCII),
  ];
  for (const entry of dateEntriesInPreferenceOrder) {
    if (entry === null) continue;
    const timestamp = exifDateTimeToTimestamp(readAsciiEntry(fileDescriptor, entry) ?? '');
    if (timestamp !== null) return timestamp;
  }

  if (!mayFallBackToEmbeddedJpeg) return null;
  const embeddedJpeg = mainEntries.find(
    (entry) => entry.tag === TIFF_TAG_JPEG_FROM_RAW && entry.valueSizeInBytes > LARGEST_VALUE_STORED_INSIDE_AN_ENTRY_IN_BYTES,
  );
  return embeddedJpeg === undefined ? null : readTimestampFromJpeg(fileDescriptor, embeddedJpeg.valueStart);
}

function readTimestampFromJpeg(fileDescriptor, jpegStart = 0) {
  if (readUInt16At(fileDescriptor, jpegStart, false) !== JPEG_START_OF_IMAGE) return null;

  let segmentStart = jpegStart + BYTES_IN_JPEG_MARKER;
  for (let segmentIndex = 0; segmentIndex < MOST_JPEG_SEGMENTS_BEFORE_THE_IMAGE_DATA; segmentIndex++) {
    const markerBytes = readBytesAt(fileDescriptor, segmentStart, BYTES_IN_JPEG_MARKER);
    if (markerBytes === null || markerBytes[0] !== JPEG_MARKER_PREFIX) return null;

    const marker = markerBytes[1];
    if (marker === JPEG_MARKER_START_OF_SCAN || marker === JPEG_MARKER_END_OF_IMAGE) return null;
    if (JPEG_MARKERS_WITH_NO_LENGTH_FIELD.has(marker)) {
      segmentStart += BYTES_IN_JPEG_MARKER;
      continue;
    }

    const segmentLength = readUInt16At(fileDescriptor, segmentStart + BYTES_IN_JPEG_MARKER, false);
    if (segmentLength === null || segmentLength < SHORTEST_VALID_JPEG_SEGMENT_LENGTH) return null;

    const isExifSegment = marker === JPEG_MARKER_APP1
      && readTextAt(fileDescriptor, segmentStart + BYTES_FROM_SEGMENT_START_TO_EXIF_HEADER, EXIF_HEADER.length) === EXIF_HEADER;
    if (isExifSegment) {
      return readTimestampFromTiff(fileDescriptor, segmentStart + BYTES_FROM_SEGMENT_START_TO_TIFF_HEADER, {
        mayFallBackToEmbeddedJpeg: false,
      });
    }
    segmentStart += BYTES_IN_JPEG_MARKER + segmentLength;
  }
  return null;
}

function findIsoBox(fileDescriptor, searchStart, searchEnd, wantedType) {
  let boxStart = searchStart;
  while (boxStart + ISO_BOX_HEADER_BYTES <= searchEnd) {
    const declaredSize = readUInt32At(fileDescriptor, boxStart, false);
    const boxType = readTextAt(fileDescriptor, boxStart + ISO_BOX_SIZE_FIELD_BYTES, ISO_BOX_TYPE_FIELD_BYTES);
    if (declaredSize === null || boxType === null) return null;

    let headerSize = ISO_BOX_HEADER_BYTES;
    let boxSize = declaredSize;
    if (declaredSize === ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS) {
      boxSize = readUInt64At(fileDescriptor, boxStart + ISO_BOX_HEADER_BYTES);
      headerSize = ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES;
      if (boxSize === null) return null;
    } else if (declaredSize === ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END) {
      boxSize = searchEnd - boxStart;
    }
    if (boxSize < headerSize) return null;

    if (boxType === wantedType) {
      return { contentStart: boxStart + headerSize, contentEnd: Math.min(boxStart + boxSize, searchEnd) };
    }
    boxStart += boxSize;
  }
  return null;
}

function readCameraClockFromSecondsSince1904(secondsSince1904) {
  const asIfTheSecondsWereUTC = new Date((secondsSince1904 - SECONDS_BETWEEN_1904_AND_1970) * MILLISECONDS_PER_SECOND);
  return {
    year: asIfTheSecondsWereUTC.getUTCFullYear(),
    month: asIfTheSecondsWereUTC.getUTCMonth() + 1,
    day: asIfTheSecondsWereUTC.getUTCDate(),
    hour: asIfTheSecondsWereUTC.getUTCHours(),
    minute: asIfTheSecondsWereUTC.getUTCMinutes(),
    second: asIfTheSecondsWereUTC.getUTCSeconds(),
  };
}

function readTimestampFromMovie(fileDescriptor, fileSizeInBytes) {
  const movieBox = findIsoBox(fileDescriptor, 0, fileSizeInBytes, MOVIE_BOX_TYPE);
  if (movieBox === null) return null;
  const movieHeaderBox = findIsoBox(fileDescriptor, movieBox.contentStart, movieBox.contentEnd, MOVIE_HEADER_BOX_TYPE);
  if (movieHeaderBox === null) return null;

  const version = readBytesAt(fileDescriptor, movieHeaderBox.contentStart, 1)?.[0] ?? null;
  const creationTimeStart = movieHeaderBox.contentStart + BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME;
  const secondsSince1904 = version === MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES
    ? readUInt64At(fileDescriptor, creationTimeStart)
    : readUInt32At(fileDescriptor, creationTimeStart, false);
  if (secondsSince1904 === null || secondsSince1904 === 0) return null;

  const clock = readCameraClockFromSecondsSince1904(secondsSince1904);
  if (clock.year < EARLIEST_PLAUSIBLE_YEAR || clock.year > LATEST_PLAUSIBLE_YEAR) return null;
  return formatTimestamp(clock);
}

const fileStartsWithJpegSignature = (fileDescriptor) =>
  readUInt16At(fileDescriptor, 0, false) === JPEG_START_OF_IMAGE;

const fileStartsWithTiffByteOrderMark = (fileDescriptor) => {
  const byteOrderMark = readTextAt(fileDescriptor, 0, 2);
  return byteOrderMark === TIFF_LITTLE_ENDIAN_MARK || byteOrderMark === TIFF_BIG_ENDIAN_MARK;
};

export function readTimestampFromFile(filePath, fileSizeInBytes) {
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(filePath, 'r');

    if (fileStartsWithJpegSignature(fileDescriptor)) {
      const timestamp = readTimestampFromJpeg(fileDescriptor);
      return timestamp === null ? null : { timestamp, source: DATE_SOURCE.exifMetadata };
    }
    if (fileStartsWithTiffByteOrderMark(fileDescriptor)) {
      const timestamp = readTimestampFromTiff(fileDescriptor, 0, { mayFallBackToEmbeddedJpeg: true });
      return timestamp === null ? null : { timestamp, source: DATE_SOURCE.exifMetadata };
    }
    const timestamp = readTimestampFromMovie(fileDescriptor, fileSizeInBytes);
    return timestamp === null ? null : { timestamp, source: DATE_SOURCE.videoHeader };
  } catch {
    return null;
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
}

export const timestampFromDate = (date) =>
  formatTimestamp({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
  });

export const timestampToMilliseconds = (timestamp) => Date.parse(timestamp.replace(' ', 'T'));

const numberFromTimestamp = (timestamp, [start, end]) => Number(timestamp.slice(start, end));

export function formatDayFolder(timestamp, { hourTheDayStartsAt = 0, layout = '%Y-%m-%d' } = {}) {
  const shootingDay = new Date(
    numberFromTimestamp(timestamp, TIMESTAMP_YEAR_RANGE),
    numberFromTimestamp(timestamp, TIMESTAMP_MONTH_RANGE) - 1,
    numberFromTimestamp(timestamp, TIMESTAMP_DAY_RANGE),
  );
  const wasShotBeforeTheDayTurned = numberFromTimestamp(timestamp, TIMESTAMP_HOUR_RANGE) < hourTheDayStartsAt;
  if (wasShotBeforeTheDayTurned) shootingDay.setDate(shootingDay.getDate() - 1);

  const year = String(shootingDay.getFullYear());
  const month = twoDigits(shootingDay.getMonth() + 1);
  const day = twoDigits(shootingDay.getDate());
  const expansions = { Y: year, m: month, d: day, F: `${year}-${month}-${day}`, '%': '%' };
  return layout.replace(/%(.)/g, (unexpanded, escapeLetter) => expansions[escapeLetter] ?? unexpanded);
}
