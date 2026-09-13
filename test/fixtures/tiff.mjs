export const TIFF_LITTLE_ENDIAN_MARK = 'II';
const TIFF_BIG_ENDIAN_MARK = 'MM';
export const TIFF_STANDARD_SIGNATURE = 0x2a;
export const PANASONIC_RAW_SIGNATURE = 0x55;
export const OLYMPUS_RAW_SIGNATURE = 0x4f52;
export const OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES = 0x5352;

export const TIFF_TAG_JPEG_FROM_RAW = 0x002e;
const TIFF_TAG_EXIF_DIRECTORY_POINTER = 0x8769;
export const TIFF_TAG_MODIFY_DATE = 0x0132;
export const TIFF_TAG_DATE_TIME_ORIGINAL = 0x9003;
const TIFF_VALUE_TYPE_ASCII = 2;
export const TIFF_VALUE_TYPE_LONG = 4;
const TIFF_VALUE_TYPE_LONG8 = 16;
export const TIFF_VALUE_TYPE_UNDEFINED = 7;

export const BYTES_IN_TIFF_HEADER = 8;
const BYTES_IN_TIFF_ENTRY_COUNT_FIELD = 2;
const BYTES_PER_TIFF_DIRECTORY_ENTRY = 12;
const BYTES_IN_NEXT_DIRECTORY_POINTER = 4;
export const BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY =
  BYTES_IN_TIFF_ENTRY_COUNT_FIELD + BYTES_PER_TIFF_DIRECTORY_ENTRY + BYTES_IN_NEXT_DIRECTORY_POINTER;

export const EXIF_HEADER = 'Exif\0\0';

export function tiffDirectoryEntry({ tag, valueType, valueCount, valueOrOffset }) {
  const entry = Buffer.alloc(BYTES_PER_TIFF_DIRECTORY_ENTRY);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(valueType, 2);
  entry.writeUInt32LE(valueCount, 4);
  entry.writeUInt32LE(valueOrOffset, 8);
  return entry;
}

export function tiffDirectoryHolding(entries) {
  const entryCount = Buffer.alloc(BYTES_IN_TIFF_ENTRY_COUNT_FIELD);
  entryCount.writeUInt16LE(entries.length, 0);
  const noFurtherDirectories = Buffer.alloc(BYTES_IN_NEXT_DIRECTORY_POINTER);
  return Buffer.concat([entryCount, ...entries, noFurtherDirectories]);
}

export function tiffHeaderPointingAtFirstDirectory(signature, firstDirectoryOffset) {
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

export function bigEndianTiffFile(dateTimeOriginal) {
  const directoryEntry = (tag, valueType, valueCount, valueOrOffset) => {
    const entry = Buffer.alloc(BYTES_PER_TIFF_DIRECTORY_ENTRY);
    entry.writeUInt16BE(tag, 0);
    entry.writeUInt16BE(valueType, 2);
    entry.writeUInt32BE(valueCount, 4);
    entry.writeUInt32BE(valueOrOffset, 8);
    return entry;
  };
  const directoryHolding = (entries) => {
    const entryCount = Buffer.alloc(BYTES_IN_TIFF_ENTRY_COUNT_FIELD);
    entryCount.writeUInt16BE(entries.length, 0);
    return Buffer.concat([entryCount, ...entries, Buffer.alloc(BYTES_IN_NEXT_DIRECTORY_POINTER)]);
  };

  const header = Buffer.alloc(BYTES_IN_TIFF_HEADER);
  header.write(TIFF_BIG_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt16BE(TIFF_STANDARD_SIGNATURE, 2);
  header.writeUInt32BE(BYTES_IN_TIFF_HEADER, 4);

  const exifDirectoryOffset = BYTES_IN_TIFF_HEADER + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValueOffset = exifDirectoryOffset + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValue = Buffer.from(`${dateTimeOriginal}\0`, 'latin1');

  return Buffer.concat([
    header,
    directoryHolding([directoryEntry(TIFF_TAG_EXIF_DIRECTORY_POINTER, TIFF_VALUE_TYPE_LONG, 1, exifDirectoryOffset)]),
    directoryHolding([directoryEntry(TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII, dateValue.length, dateValueOffset)]),
    dateValue,
  ]);
}

const BIG_TIFF_SIGNATURE = 0x2b;
const BYTES_IN_A_BIG_TIFF_HEADER = 16;
const BYTES_PER_BIG_TIFF_DIRECTORY_ENTRY = 20;
const BYTES_IN_A_BIG_TIFF_OFFSET = 8;
const BYTES_IN_A_BIG_TIFF_DIRECTORY_HOLDING_ONE_ENTRY =
  BYTES_IN_A_BIG_TIFF_OFFSET + BYTES_PER_BIG_TIFF_DIRECTORY_ENTRY + BYTES_IN_A_BIG_TIFF_OFFSET;

export function tiffFileWithTheDateInItsMainDirectory(dateTag, dateTimeOriginal) {
  const header = tiffHeaderPointingAtFirstDirectory(TIFF_STANDARD_SIGNATURE, BYTES_IN_TIFF_HEADER);
  const dateValue = Buffer.from(`${dateTimeOriginal}\0`, 'latin1');
  const mainDirectory = tiffDirectoryHolding([tiffDirectoryEntry({
    tag: dateTag,
    valueType: TIFF_VALUE_TYPE_ASCII,
    valueCount: dateValue.length,
    valueOrOffset: BYTES_IN_TIFF_HEADER + BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY,
  })]);
  return Buffer.concat([header, mainDirectory, dateValue]);
}

// A BigTIFF writer normally points at another directory with the eight-byte type BigTIFF
// added, but nothing stops it using the ordinary four-byte LONG, and a file that does sits
// its pointer in the first four bytes of an eight-byte value field. Both are built here
// because a reader that assumes the wide one reads a big-endian file off the end of its
// own pointer.
export function bigTiffFile(dateTimeOriginal, { bigEndian = false, pointerType = TIFF_VALUE_TYPE_LONG8 } = {}) {
  const uInt16 = (value) => {
    const bytes = Buffer.alloc(2);
    if (bigEndian) bytes.writeUInt16BE(value); else bytes.writeUInt16LE(value);
    return bytes;
  };
  const uInt64 = (value) => {
    const bytes = Buffer.alloc(8);
    if (bigEndian) bytes.writeBigUInt64BE(BigInt(value)); else bytes.writeBigUInt64LE(BigInt(value));
    return bytes;
  };
  const uInt32PaddedToTheValueField = (value) => {
    const bytes = Buffer.alloc(BYTES_IN_A_BIG_TIFF_OFFSET);
    if (bigEndian) bytes.writeUInt32BE(value); else bytes.writeUInt32LE(value);
    return bytes;
  };
  const entry = (tag, valueType, valueCount, valueOrOffset) => Buffer.concat([
    uInt16(tag), uInt16(valueType), uInt64(valueCount),
    valueType === TIFF_VALUE_TYPE_LONG ? uInt32PaddedToTheValueField(valueOrOffset) : uInt64(valueOrOffset),
  ]);
  const directoryHolding = (entries) => Buffer.concat([uInt64(entries.length), ...entries, uInt64(0)]);

  const header = Buffer.concat([
    Buffer.from(bigEndian ? TIFF_BIG_ENDIAN_MARK : TIFF_LITTLE_ENDIAN_MARK, 'latin1'),
    uInt16(BIG_TIFF_SIGNATURE), uInt16(BYTES_IN_A_BIG_TIFF_OFFSET), uInt16(0),
    uInt64(BYTES_IN_A_BIG_TIFF_HEADER),
  ]);
  const exifDirectoryOffset = BYTES_IN_A_BIG_TIFF_HEADER + BYTES_IN_A_BIG_TIFF_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValueOffset = exifDirectoryOffset + BYTES_IN_A_BIG_TIFF_DIRECTORY_HOLDING_ONE_ENTRY;
  const dateValue = Buffer.from(`${dateTimeOriginal}\0`, 'latin1');

  return Buffer.concat([
    header,
    directoryHolding([entry(TIFF_TAG_EXIF_DIRECTORY_POINTER, pointerType, 1, exifDirectoryOffset)]),
    directoryHolding([entry(TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII, dateValue.length, dateValueOffset)]),
    dateValue,
  ]);
}
