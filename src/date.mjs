import fs from 'node:fs';

const STILL_IMAGE_EXTENSIONS = ['.JPG', '.JPEG', '.MPO', '.HSP', '.HIF', '.HEIC', '.THM'];

const RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY = [
  '.RW2', '.RAW', '.RWL', '.DNG', '.TIF', '.TIFF',
  '.CR2', '.NEF', '.NRW', '.ARW', '.SR2', '.SRF', '.ORF', '.PEF',
  '.SRW', '.ERF', '.3FR', '.IIQ', '.MOS', '.MEF', '.DCR', '.KDC',
];

const RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN = ['.CR3', '.CRM', '.RAF'];

const VIDEO_EXTENSIONS = ['.MP4', '.MOV', '.MTS', '.M2TS', '.AVI'];

export const MEDIA_FILE_EXTENSIONS = new Set([
  ...STILL_IMAGE_EXTENSIONS,
  ...RAW_EXTENSIONS_HOLDING_A_TIFF_DIRECTORY,
  ...RAW_EXTENSIONS_HOLDING_A_CONTAINER_OF_THEIR_OWN,
  ...VIDEO_EXTENSIONS,
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

const FUJIFILM_RAW_MARK = 'FUJIFILM';
const BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER = 84;

const ISO_BOX_HEADER_BYTES = 8;
const ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES = 16;
const ISO_BOX_SIZE_FIELD_BYTES = 4;
const ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS = 1;
const ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END = 0;
const ISO_BOX_TYPE_FIELD_BYTES = 4;
const MOVIE_BOX_TYPE = 'moov';
const MOVIE_HEADER_BOX_TYPE = 'mvhd';
const USER_DATA_BOX_TYPE = 'udta';
const METADATA_BOX_TYPE = 'meta';
const BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS = 4;

const ITEM_INFORMATION_BOX_TYPE = 'iinf';
const ITEM_INFORMATION_ENTRY_BOX_TYPE = 'infe';
const ITEM_LOCATION_BOX_TYPE = 'iloc';
const EXIF_ITEM_TYPE = 'Exif';
const ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID = 3;
const ITEM_ENTRY_EARLIEST_VERSION_NAMING_A_TYPE = 2;
const ITEM_LOCATION_VERSION_WITH_LONG_COUNTS = 2;
const ITEM_LOCATION_EARLIEST_VERSION_WITH_A_CONSTRUCTION_METHOD = 1;
const ITEM_STORED_AT_A_PLAIN_FILE_OFFSET = 0;
const MOST_ITEMS_A_REAL_STILL_HAS = 512;
const LONGEST_HEIF_EXIF_PREAMBLE_IN_BYTES = 64;

const UUID_BOX_TYPE = 'uuid';
const BYTES_IN_AN_ISO_UUID = 16;
const BYTES_IN_A_SHORT_ITEM_OFFSET = 4;
const BYTES_IN_A_LONG_ITEM_OFFSET = 8;
const BYTES_IN_A_SHORT_ITEM_ID = 2;
const BYTES_IN_A_LONG_ITEM_ID = 4;
const BYTES_IN_A_DATA_REFERENCE_INDEX = 2;
const BYTES_IN_AN_EXTENT_COUNT = 2;
const BYTES_IN_A_CONSTRUCTION_METHOD = 2;
const LOW_FOUR_BITS = 0x0f;
const BITS_TO_THE_HIGH_NIBBLE = 4;
const CANON_METADATA_UUID = '85c0b687820f11e08111f4ce462b6a48';
const CANON_EXIF_BOX_TYPES_IN_PREFERENCE_ORDER = ['CMT2', 'CMT1'];
const CANON_THUMBNAIL_BOX_TYPE = 'CNTH';
const CANON_THUMBNAIL_IMAGE_BOX_TYPE = 'CNDA';

const QUICKTIME_CREATION_DATE_BOX_TYPE = '\u00a9day';
const METADATA_KEYS_BOX_TYPE = 'keys';
const METADATA_ITEM_LIST_BOX_TYPE = 'ilst';
const METADATA_VALUE_BOX_TYPE = 'data';
const APPLE_CREATION_DATE_KEY = 'com.apple.quicktime.creationdate';
const MOST_METADATA_KEYS_A_REAL_MOVIE_HAS = 256;
const BYTES_IN_A_METADATA_KEY_HEADER = 8;
const BYTES_IN_A_METADATA_VALUE_HEADER = 8;
const LONGEST_METADATA_VALUE_IN_BYTES = 128;

const ISO_8601_DATE_TIME_PATTERN = /(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2}:\d{2})/;
const A_TIME_STAMPED_IN_UTC_RATHER_THAN_THE_CAMERA_S_OWN_CLOCK = /Z\s*$/;
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

const readUInt64EitherWayRoundAt = (fileDescriptor, position, isLittleEndian) => {
  const bytes = readBytesAt(fileDescriptor, position, 8);
  if (bytes === null) return null;
  return Number(isLittleEndian ? bytes.readBigUInt64LE() : bytes.readBigUInt64BE());
};

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

function exifDateTimeToTimestamp(exifDateTime) {
  const parts = EXIF_DATE_TIME_PATTERN.exec(exifDateTime);
  if (parts === null) return null;
  const [, year, month, day, timeOfDay] = parts;
  return `${year}-${month}-${day} ${timeOfDay}`;
}

function readTiffDirectoryEntries(fileDescriptor, tiffStart, directoryStart, isLittleEndian, layout) {
  const entryCount = layout.readEntryCount(fileDescriptor, directoryStart, isLittleEndian);
  if (entryCount === null || entryCount === 0 || entryCount > MOST_ENTRIES_A_REAL_DIRECTORY_HAS) return [];

  const entries = [];
  for (let entryIndex = 0; entryIndex < entryCount; entryIndex++) {
    const entryStart = directoryStart + layout.bytesInEntryCountField + entryIndex * layout.bytesPerDirectoryEntry;
    const valueFieldStart = entryStart + layout.bytesFromEntryStartToValueField;
    const tag = readUInt16At(fileDescriptor, entryStart, isLittleEndian);
    const valueType = readUInt16At(fileDescriptor, entryStart + 2, isLittleEndian);
    const valueCount = layout.readValueCount(fileDescriptor, entryStart + 4, isLittleEndian);
    if (tag === null || valueCount === null) break;

    const bytesPerValue = BYTES_PER_TIFF_VALUE_TYPE[valueType] ?? BYTES_PER_UNKNOWN_TIFF_VALUE_TYPE;
    const valueSizeInBytes = bytesPerValue * valueCount;
    const valueIsStoredInsideTheEntry = valueSizeInBytes <= layout.largestValueStoredInsideAnEntry;
    const valueStart = valueIsStoredInsideTheEntry
      ? valueFieldStart
      : tiffStart + layout.readOffset(fileDescriptor, valueFieldStart, isLittleEndian);

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
  const isBigTiff = signature === BIG_TIFF_SIGNATURE;
  if (!isBigTiff && !TIFF_SIGNATURES_WORTH_READING.has(signature)) return null;

  const layout = isBigTiff ? BIG_TIFF_DIRECTORY_LAYOUT : ORDINARY_TIFF_DIRECTORY_LAYOUT;
  const offsetsAreEightBytesWide = !isBigTiff
    || readUInt16At(fileDescriptor, tiffStart + BIG_TIFF_OFFSET_SIZE_POSITION, isLittleEndian) === BYTES_IN_A_BIG_TIFF_OFFSET;
  if (!offsetsAreEightBytesWide) return null;

  const firstDirectoryOffset = isBigTiff
    ? readUInt64EitherWayRoundAt(fileDescriptor, tiffStart + BIG_TIFF_FIRST_DIRECTORY_POINTER_POSITION, isLittleEndian)
    : readUInt32At(fileDescriptor, tiffStart + TIFF_FIRST_DIRECTORY_POINTER_POSITION, isLittleEndian);
  if (firstDirectoryOffset === null) return null;

  const mainEntries = readTiffDirectoryEntries(fileDescriptor, tiffStart, tiffStart + firstDirectoryOffset, isLittleEndian, layout);
  const exifDirectoryPointer = mainEntries.find((entry) => entry.tag === TIFF_TAG_EXIF_DIRECTORY_POINTER) ?? null;
  const exifDirectoryOffset = exifDirectoryPointer === null
    ? null
    : layout.readOffset(fileDescriptor, exifDirectoryPointer.valueStart, isLittleEndian);
  const exifEntries = exifDirectoryOffset === null
    ? []
    : readTiffDirectoryEntries(fileDescriptor, tiffStart, tiffStart + exifDirectoryOffset, isLittleEndian, layout);

  const dateEntriesInPreferenceOrder = [
    findEntry(exifEntries, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII),
    findEntry(exifEntries, TIFF_TAG_CREATE_DATE, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_CREATE_DATE, TIFF_VALUE_TYPE_ASCII),
    findEntry(mainEntries, TIFF_TAG_MODIFY_DATE, TIFF_VALUE_TYPE_ASCII),
  ];
  for (const entry of dateEntriesInPreferenceOrder) {
    if (entry === null) continue;
    const timestamp = exifDateTimeToTimestamp(readAsciiEntry(fileDescriptor, entry) ?? '');
    if (timestamp !== null) return timestamp;
  }

  if (!mayFallBackToEmbeddedJpeg) return null;
  const embeddedJpeg = mainEntries.find(
    (entry) => entry.tag === TIFF_TAG_JPEG_FROM_RAW && entry.valueSizeInBytes > layout.largestValueStoredInsideAnEntry,
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

function findIsoBoxWhere(fileDescriptor, searchStart, searchEnd, isTheOneWanted) {
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

    const box = { contentStart: boxStart + headerSize, contentEnd: Math.min(boxStart + boxSize, searchEnd) };
    if (isTheOneWanted(boxType, box)) return box;
    boxStart += boxSize;
  }
  return null;
}

const findIsoBox = (fileDescriptor, searchStart, searchEnd, wantedType) =>
  findIsoBoxWhere(fileDescriptor, searchStart, searchEnd, (boxType) => boxType === wantedType);

function findIsoBoxPath(fileDescriptor, searchStart, searchEnd, boxTypesFromTheOutermost) {
  let box = { contentStart: searchStart, contentEnd: searchEnd };
  for (const boxType of boxTypesFromTheOutermost) {
    box = findIsoBox(fileDescriptor, box.contentStart, box.contentEnd, boxType);
    if (box === null) return null;
  }
  return box;
}

const versionOfBoxAt = (fileDescriptor, box) => readBytesAt(fileDescriptor, box.contentStart, 1)?.[0] ?? null;
const insideABoxThatStartsWithAVersionAndFlags = (box) => ({
  contentStart: box.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS,
  contentEnd: box.contentEnd,
});

function readUnsignedOfWidthAt(fileDescriptor, position, byteCount) {
  if (byteCount === 0) return 0;
  if (byteCount === BYTES_IN_A_SHORT_ITEM_OFFSET) return readUInt32At(fileDescriptor, position, false);
  if (byteCount === BYTES_IN_A_LONG_ITEM_OFFSET) return readUInt64At(fileDescriptor, position);
  return null;
}

const fileStartsWithFujifilmRawMark = (fileDescriptor) =>
  readTextAt(fileDescriptor, 0, FUJIFILM_RAW_MARK.length) === FUJIFILM_RAW_MARK;

function readTimestampFromFujifilmRaw(fileDescriptor) {
  const embeddedJpegStart = readUInt32At(
    fileDescriptor, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER, false,
  );
  if (embeddedJpegStart === null || embeddedJpegStart === 0) return null;
  return readTimestampFromJpeg(fileDescriptor, embeddedJpegStart);
}

function readTimestampFromExifPayload(fileDescriptor, payloadStart, payloadLength) {
  const preamble = readTextAt(fileDescriptor, payloadStart, Math.min(payloadLength, LONGEST_HEIF_EXIF_PREAMBLE_IN_BYTES));
  const exifHeaderStart = preamble === null ? -1 : preamble.indexOf(EXIF_HEADER);
  if (exifHeaderStart >= 0) {
    return readTimestampFromTiff(fileDescriptor, payloadStart + exifHeaderStart + EXIF_HEADER.length, {
      mayFallBackToEmbeddedJpeg: false,
    });
  }
  const tiffHeaderOffset = readUInt32At(fileDescriptor, payloadStart, false);
  if (tiffHeaderOffset === null) return null;
  return readTimestampFromTiff(fileDescriptor, payloadStart + BYTES_IN_A_SHORT_ITEM_OFFSET + tiffHeaderOffset, {
    mayFallBackToEmbeddedJpeg: false,
  });
}

function findTheExifItemsId(fileDescriptor, metadataContents) {
  const itemInformation = findIsoBox(
    fileDescriptor, metadataContents.contentStart, metadataContents.contentEnd, ITEM_INFORMATION_BOX_TYPE,
  );
  if (itemInformation === null) return null;

  const version = versionOfBoxAt(fileDescriptor, itemInformation);
  if (version === null) return null;
  const countIsLong = version > 0;
  const entriesStart = itemInformation.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS
    + (countIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID);

  const idOfEntry = (entry) => {
    const entryVersion = versionOfBoxAt(fileDescriptor, entry);
    if (entryVersion === null || entryVersion < ITEM_ENTRY_EARLIEST_VERSION_NAMING_A_TYPE) return null;
    const idIsLong = entryVersion >= ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID;
    const idStart = entry.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
    const typeStart = idStart + (idIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID)
      + BYTES_IN_A_DATA_REFERENCE_INDEX;
    if (readTextAt(fileDescriptor, typeStart, ISO_BOX_TYPE_FIELD_BYTES) !== EXIF_ITEM_TYPE) return null;
    return idIsLong
      ? readUInt32At(fileDescriptor, idStart, false)
      : readUInt16At(fileDescriptor, idStart, false);
  };

  let exifItemId = null;
  findIsoBoxWhere(fileDescriptor, entriesStart, itemInformation.contentEnd, (boxType, box) => {
    if (boxType !== ITEM_INFORMATION_ENTRY_BOX_TYPE) return false;
    exifItemId = idOfEntry(box);
    return exifItemId !== null;
  });
  return exifItemId;
}

function findWhereTheItemIsStored(fileDescriptor, metadataContents, wantedItemId) {
  const itemLocation = findIsoBox(
    fileDescriptor, metadataContents.contentStart, metadataContents.contentEnd, ITEM_LOCATION_BOX_TYPE,
  );
  if (itemLocation === null) return null;
  const version = versionOfBoxAt(fileDescriptor, itemLocation);
  if (version === null) return null;

  let position = itemLocation.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
  const widths = readBytesAt(fileDescriptor, position, 2);
  if (widths === null) return null;
  const offsetSize = widths[0] >> BITS_TO_THE_HIGH_NIBBLE;
  const lengthSize = widths[0] & LOW_FOUR_BITS;
  const baseOffsetSize = widths[1] >> BITS_TO_THE_HIGH_NIBBLE;
  const carriesAConstructionMethod = version >= ITEM_LOCATION_EARLIEST_VERSION_WITH_A_CONSTRUCTION_METHOD;
  const indexSize = carriesAConstructionMethod ? (widths[1] & LOW_FOUR_BITS) : 0;
  position += 2;

  const idIsLong = version >= ITEM_LOCATION_VERSION_WITH_LONG_COUNTS;
  const bytesInAnId = idIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID;
  const readId = (at) => (idIsLong ? readUInt32At(fileDescriptor, at, false) : readUInt16At(fileDescriptor, at, false));

  const itemCount = readId(position);
  if (itemCount === null || itemCount > MOST_ITEMS_A_REAL_STILL_HAS) return null;
  position += bytesInAnId;

  for (let item = 0; item < itemCount; item++) {
    const itemId = readId(position);
    if (itemId === null) return null;
    position += bytesInAnId;

    let constructionMethod = ITEM_STORED_AT_A_PLAIN_FILE_OFFSET;
    if (carriesAConstructionMethod) {
      constructionMethod = (readUInt16At(fileDescriptor, position, false) ?? 0) & LOW_FOUR_BITS;
      position += BYTES_IN_A_CONSTRUCTION_METHOD;
    }
    position += BYTES_IN_A_DATA_REFERENCE_INDEX;

    const baseOffset = readUnsignedOfWidthAt(fileDescriptor, position, baseOffsetSize);
    if (baseOffset === null) return null;
    position += baseOffsetSize;

    const extentCount = readUInt16At(fileDescriptor, position, false);
    if (extentCount === null) return null;
    position += BYTES_IN_AN_EXTENT_COUNT;

    for (let extent = 0; extent < extentCount; extent++) {
      position += indexSize;
      const extentOffset = readUnsignedOfWidthAt(fileDescriptor, position, offsetSize);
      position += offsetSize;
      const extentLength = readUnsignedOfWidthAt(fileDescriptor, position, lengthSize);
      position += lengthSize;
      if (extentOffset === null || extentLength === null) return null;

      const thisIsTheItemWanted = itemId === wantedItemId
        && constructionMethod === ITEM_STORED_AT_A_PLAIN_FILE_OFFSET
        && extent === 0;
      if (thisIsTheItemWanted) return { start: baseOffset + extentOffset, length: extentLength };
    }
  }
  return null;
}

function readTimestampFromHeifStill(fileDescriptor, fileSizeInBytes) {
  const metadataBox = findIsoBox(fileDescriptor, 0, fileSizeInBytes, METADATA_BOX_TYPE);
  if (metadataBox === null) return null;
  const metadataContents = insideABoxThatStartsWithAVersionAndFlags(metadataBox);

  const exifItemId = findTheExifItemsId(fileDescriptor, metadataContents);
  if (exifItemId === null) return null;
  const whereItIsStored = findWhereTheItemIsStored(fileDescriptor, metadataContents, exifItemId);
  if (whereItIsStored === null) return null;
  return readTimestampFromExifPayload(fileDescriptor, whereItIsStored.start, whereItIsStored.length);
}

function readTimestampFromCanonRaw(fileDescriptor, fileSizeInBytes) {
  const movieBox = findIsoBox(fileDescriptor, 0, fileSizeInBytes, MOVIE_BOX_TYPE);
  if (movieBox === null) return null;

  const canonMetadata = findIsoBoxWhere(fileDescriptor, movieBox.contentStart, movieBox.contentEnd,
    (boxType, box) => boxType === UUID_BOX_TYPE
      && readBytesAt(fileDescriptor, box.contentStart, BYTES_IN_AN_ISO_UUID)?.toString('hex') === CANON_METADATA_UUID);
  if (canonMetadata === null) return null;

  const insideTheUuid = canonMetadata.contentStart + BYTES_IN_AN_ISO_UUID;
  for (const boxType of CANON_EXIF_BOX_TYPES_IN_PREFERENCE_ORDER) {
    const exifBox = findIsoBox(fileDescriptor, insideTheUuid, canonMetadata.contentEnd, boxType);
    if (exifBox === null) continue;
    const timestamp = readTimestampFromTiff(fileDescriptor, exifBox.contentStart, { mayFallBackToEmbeddedJpeg: false });
    if (timestamp !== null) return timestamp;
  }
  return null;
}

const readTimestampFromIsoBaseMediaStill = (fileDescriptor, fileSizeInBytes) =>
  readTimestampFromCanonRaw(fileDescriptor, fileSizeInBytes)
  ?? readTimestampFromHeifStill(fileDescriptor, fileSizeInBytes);

function cameraClockFromIso8601(text) {
  if (text === null) return null;
  if (A_TIME_STAMPED_IN_UTC_RATHER_THAN_THE_CAMERA_S_OWN_CLOCK.test(text)) return null;
  const parts = ISO_8601_DATE_TIME_PATTERN.exec(text);
  if (parts === null) return null;
  const [, year, month, day, timeOfDay] = parts;
  return `${year}-${month}-${day} ${timeOfDay}`;
}

const readTextInside = (fileDescriptor, box, skippingBytes) => {
  const textStart = box.contentStart + skippingBytes;
  const byteCount = Math.min(box.contentEnd - textStart, LONGEST_METADATA_VALUE_IN_BYTES);
  return byteCount <= 0 ? null : readTextAt(fileDescriptor, textStart, byteCount);
};

function readCreationDateFromUserData(fileDescriptor, movieBox) {
  const userData = findIsoBox(fileDescriptor, movieBox.contentStart, movieBox.contentEnd, USER_DATA_BOX_TYPE);
  if (userData === null) return null;

  const canonThumbnail = findIsoBoxPath(fileDescriptor, userData.contentStart, userData.contentEnd,
    [CANON_THUMBNAIL_BOX_TYPE, CANON_THUMBNAIL_IMAGE_BOX_TYPE]);
  if (canonThumbnail !== null) {
    const timestamp = readTimestampFromJpeg(fileDescriptor, canonThumbnail.contentStart);
    if (timestamp !== null) return timestamp;
  }

  const creationDate = findIsoBox(
    fileDescriptor, userData.contentStart, userData.contentEnd, QUICKTIME_CREATION_DATE_BOX_TYPE,
  );
  return creationDate === null ? null : cameraClockFromIso8601(readTextInside(fileDescriptor, creationDate, 0));
}

function readCreationDateWrittenByApple(fileDescriptor, movieBox) {
  const metadataBox = findIsoBox(fileDescriptor, movieBox.contentStart, movieBox.contentEnd, METADATA_BOX_TYPE);
  if (metadataBox === null) return null;
  const metadataContents = insideABoxThatStartsWithAVersionAndFlags(metadataBox);

  const keysBox = findIsoBox(fileDescriptor, metadataContents.contentStart, metadataContents.contentEnd, METADATA_KEYS_BOX_TYPE);
  const itemListBox = findIsoBox(fileDescriptor, metadataContents.contentStart, metadataContents.contentEnd, METADATA_ITEM_LIST_BOX_TYPE);
  if (keysBox === null || itemListBox === null) return null;

  let position = keysBox.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
  const keyCount = readUInt32At(fileDescriptor, position, false);
  if (keyCount === null || keyCount > MOST_METADATA_KEYS_A_REAL_MOVIE_HAS) return null;
  position += BYTES_IN_A_LONG_ITEM_ID;

  let indexOfTheCreationDate = null;
  for (let key = 1; key <= keyCount && indexOfTheCreationDate === null; key++) {
    const keySize = readUInt32At(fileDescriptor, position, false);
    if (keySize === null || keySize < BYTES_IN_A_METADATA_KEY_HEADER) return null;
    const keyName = readTextAt(
      fileDescriptor, position + BYTES_IN_A_METADATA_KEY_HEADER, keySize - BYTES_IN_A_METADATA_KEY_HEADER,
    );
    if (keyName === APPLE_CREATION_DATE_KEY) indexOfTheCreationDate = key;
    position += keySize;
  }
  if (indexOfTheCreationDate === null) return null;

  const itemType = Buffer.alloc(ISO_BOX_TYPE_FIELD_BYTES);
  itemType.writeUInt32BE(indexOfTheCreationDate);
  const itemBox = findIsoBox(
    fileDescriptor, itemListBox.contentStart, itemListBox.contentEnd, itemType.toString('latin1'),
  );
  if (itemBox === null) return null;
  const valueBox = findIsoBox(fileDescriptor, itemBox.contentStart, itemBox.contentEnd, METADATA_VALUE_BOX_TYPE);
  if (valueBox === null) return null;
  return cameraClockFromIso8601(readTextInside(fileDescriptor, valueBox, BYTES_IN_A_METADATA_VALUE_HEADER));
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

  const clockTheCameraSpeltOut = readCreationDateFromUserData(fileDescriptor, movieBox)
    ?? readCreationDateWrittenByApple(fileDescriptor, movieBox);
  if (clockTheCameraSpeltOut !== null) return clockTheCameraSpeltOut;

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
    if (fileStartsWithFujifilmRawMark(fileDescriptor)) {
      const timestamp = readTimestampFromFujifilmRaw(fileDescriptor);
      return timestamp === null ? null : { timestamp, source: DATE_SOURCE.exifMetadata };
    }
    const stillTimestamp = readTimestampFromIsoBaseMediaStill(fileDescriptor, fileSizeInBytes);
    if (stillTimestamp !== null) return { timestamp: stillTimestamp, source: DATE_SOURCE.exifMetadata };

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
