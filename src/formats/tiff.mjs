// TIFF directories, which is where most of the world's cameras put the date: plain TIFF,
// BigTIFF, the Exif segment of a JPEG, and the raw of Panasonic, Olympus and everyone
// else who dressed their raw up as a TIFF.
import { readTextAt, readUInt16At, readUInt32At, readUInt64EitherWayRoundAt } from '../bytes.mjs';
import { cameraClockFromExifText } from '../clock.mjs';

export const TIFF_LITTLE_ENDIAN_MARK = 'II';
export const TIFF_BIG_ENDIAN_MARK = 'MM';

const TIFF_STANDARD_SIGNATURE = 0x2a;
const PANASONIC_RAW_SIGNATURE = 0x55;
const OLYMPUS_RAW_SIGNATURE = 0x4f52;
const OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES = 0x5352;
const TIFF_SIGNATURES_WORTH_READING = new Set([
  TIFF_STANDARD_SIGNATURE,
  PANASONIC_RAW_SIGNATURE,
  OLYMPUS_RAW_SIGNATURE,
  OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES,
]);
const BIG_TIFF_SIGNATURE = 0x2b;
const TIFF_SIGNATURE_POSITION = 2;
const TIFF_FIRST_DIRECTORY_POINTER_POSITION = 4;
const BIG_TIFF_OFFSET_SIZE_POSITION = 4;
const BIG_TIFF_FIRST_DIRECTORY_POINTER_POSITION = 8;
const BYTES_IN_A_BIG_TIFF_OFFSET = 8;

const TIFF_TAG_MODIFY_DATE = 0x0132;
const TIFF_TAG_JPEG_FROM_RAW = 0x002e;
const TIFF_TAG_EXIF_DIRECTORY_POINTER = 0x8769;
const TIFF_TAG_DATE_TIME_ORIGINAL = 0x9003;
const TIFF_TAG_CREATE_DATE = 0x9004;

const TIFF_VALUE_TYPE_ASCII = 2;
const BYTES_PER_TIFF_VALUE_TYPE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8, 11: 4, 12: 8 };
const BYTES_PER_UNKNOWN_TIFF_VALUE_TYPE = 1;
const MOST_ENTRIES_A_REAL_DIRECTORY_HAS = 512;
const LONGEST_DATE_STRING_IN_BYTES = 32;

const ORDINARY_TIFF_DIRECTORY_LAYOUT = {
  bytesInEntryCountField: 2,
  bytesPerDirectoryEntry: 12,
  bytesFromEntryStartToValueField: 8,
  largestValueStoredInsideAnEntry: 4,
  readEntryCount: readUInt16At,
  readValueCount: readUInt32At,
  readOffset: readUInt32At,
};

const BIG_TIFF_DIRECTORY_LAYOUT = {
  bytesInEntryCountField: 8,
  bytesPerDirectoryEntry: 20,
  bytesFromEntryStartToValueField: 12,
  largestValueStoredInsideAnEntry: 8,
  readEntryCount: readUInt64EitherWayRoundAt,
  readValueCount: readUInt64EitherWayRoundAt,
  readOffset: readUInt64EitherWayRoundAt,
};

export const startsWithATiffByteOrderMark = (byteSource) => {
  const byteOrderMark = readTextAt(byteSource, 0, 2);
  return byteOrderMark === TIFF_LITTLE_ENDIAN_MARK || byteOrderMark === TIFF_BIG_ENDIAN_MARK;
};

export function byteOrderAt(byteSource, position) {
  const byteOrderMark = readTextAt(byteSource, position, 2);
  if (byteOrderMark !== TIFF_LITTLE_ENDIAN_MARK && byteOrderMark !== TIFF_BIG_ENDIAN_MARK) return null;
  return { isLittleEndian: byteOrderMark === TIFF_LITTLE_ENDIAN_MARK };
}

function readTiffDirectoryEntries(byteSource, tiffStart, directoryStart, isLittleEndian, layout) {
  const entryCount = layout.readEntryCount(byteSource, directoryStart, isLittleEndian);
  if (entryCount === null || entryCount === 0 || entryCount > MOST_ENTRIES_A_REAL_DIRECTORY_HAS) return [];

  const entries = [];
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const entryStart = directoryStart + layout.bytesInEntryCountField + entryIndex * layout.bytesPerDirectoryEntry;
    const valueFieldStart = entryStart + layout.bytesFromEntryStartToValueField;
    const tag = readUInt16At(byteSource, entryStart, isLittleEndian);
    const valueType = readUInt16At(byteSource, entryStart + 2, isLittleEndian);
    const valueCount = layout.readValueCount(byteSource, entryStart + 4, isLittleEndian);
    if (tag === null || valueCount === null) break;

    const bytesPerValue = BYTES_PER_TIFF_VALUE_TYPE[valueType] ?? BYTES_PER_UNKNOWN_TIFF_VALUE_TYPE;
    const valueSizeInBytes = bytesPerValue * valueCount;
    const valueIsStoredInsideTheEntry = valueSizeInBytes <= layout.largestValueStoredInsideAnEntry;
    const valueStart = valueIsStoredInsideTheEntry
      ? valueFieldStart
      : tiffStart + layout.readOffset(byteSource, valueFieldStart, isLittleEndian);

    entries.push({ tag, valueType, valueStart, valueSizeInBytes });
  }
  return entries;
}

function readAsciiEntry(byteSource, entry) {
  const text = readTextAt(byteSource, entry.valueStart, Math.min(entry.valueSizeInBytes, LONGEST_DATE_STRING_IN_BYTES));
  return text === null ? null : text.split('\0')[0].trim();
}

const findEntry = (entries, tag, valueType) =>
  entries.find((entry) => entry.tag === tag && entry.valueType === valueType) ?? null;

// `readEmbeddedJpeg` is how a raw that keeps its only date inside the preview JPEG it
// carries gets read. It is passed in rather than imported so that tiff and jpeg, which
// each need the other, do not have to be one module.
export function readCameraClockFromTiff(byteSource, tiffStart, { readEmbeddedJpeg = null } = {}) {
  const byteOrder = byteOrderAt(byteSource, tiffStart);
  if (byteOrder === null) return null;
  const { isLittleEndian } = byteOrder;

  const signature = readUInt16At(byteSource, tiffStart + TIFF_SIGNATURE_POSITION, isLittleEndian);
  const isBigTiff = signature === BIG_TIFF_SIGNATURE;
  if (!isBigTiff && !TIFF_SIGNATURES_WORTH_READING.has(signature)) return null;

  const layout = isBigTiff ? BIG_TIFF_DIRECTORY_LAYOUT : ORDINARY_TIFF_DIRECTORY_LAYOUT;
  const offsetsAreEightBytesWide = !isBigTiff
    || readUInt16At(byteSource, tiffStart + BIG_TIFF_OFFSET_SIZE_POSITION, isLittleEndian) === BYTES_IN_A_BIG_TIFF_OFFSET;
  if (!offsetsAreEightBytesWide) return null;

  const firstDirectoryOffset = isBigTiff
    ? readUInt64EitherWayRoundAt(byteSource, tiffStart + BIG_TIFF_FIRST_DIRECTORY_POINTER_POSITION, isLittleEndian)
    : readUInt32At(byteSource, tiffStart + TIFF_FIRST_DIRECTORY_POINTER_POSITION, isLittleEndian);
  if (firstDirectoryOffset === null) return null;

  const mainEntries = readTiffDirectoryEntries(byteSource, tiffStart, tiffStart + firstDirectoryOffset, isLittleEndian, layout);
  const exifDirectoryPointer = mainEntries.find((entry) => entry.tag === TIFF_TAG_EXIF_DIRECTORY_POINTER) ?? null;
  const exifDirectoryOffset = exifDirectoryPointer === null
    ? null
    : layout.readOffset(byteSource, exifDirectoryPointer.valueStart, isLittleEndian);
  const exifEntries = exifDirectoryOffset === null
    ? []
    : readTiffDirectoryEntries(byteSource, tiffStart, tiffStart + exifDirectoryOffset, isLittleEndian, layout);

  const dateEntriesInPreferenceOrder = [
    findEntry(exifEntries, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII),
    findEntry(exifEntries, TIFF_TAG_CREATE_DATE, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_CREATE_DATE, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_MODIFY_DATE, TIFF_VALUE_TYPE_ASCII),
  ];
  for (const entry of dateEntriesInPreferenceOrder) {
    if (entry === null) continue;
    const clock = cameraClockFromExifText(readAsciiEntry(byteSource, entry) ?? '');
    if (clock !== null) return clock;
  }

  if (readEmbeddedJpeg === null) return null;
  const embeddedJpeg = mainEntries.find(
    (entry) => entry.tag === TIFF_TAG_JPEG_FROM_RAW && entry.valueSizeInBytes > layout.largestValueStoredInsideAnEntry,
  );
  return embeddedJpeg === undefined ? null : readEmbeddedJpeg(byteSource, embeddedJpeg.valueStart);
}
