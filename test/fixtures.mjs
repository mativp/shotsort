import fs from 'node:fs';
import path from 'node:path';

const SECONDS_BETWEEN_1904_AND_1970 = 2082844800;
const MILLISECONDS_PER_SECOND = 1000;

const TIFF_LITTLE_ENDIAN_MARK = 'II';
const TIFF_BIG_ENDIAN_MARK = 'MM';
export const TIFF_STANDARD_SIGNATURE = 0x2a;
export const PANASONIC_RAW_SIGNATURE = 0x55;
export const OLYMPUS_RAW_SIGNATURE = 0x4f52;
export const OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES = 0x5352;

const TIFF_TAG_JPEG_FROM_RAW = 0x002e;
const TIFF_TAG_EXIF_DIRECTORY_POINTER = 0x8769;
export const TIFF_TAG_MODIFY_DATE = 0x0132;
export const TIFF_TAG_DATE_TIME_ORIGINAL = 0x9003;
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

export function jpegFilePaddedTo(dateTimeOriginal, totalBytes) {
  const complete = jpegFile(dateTimeOriginal);
  if (totalBytes < complete.length) {
    throw new Error(`a jpeg carrying a date cannot be smaller than ${complete.length} bytes`);
  }
  return Buffer.concat([complete, Buffer.alloc(totalBytes - complete.length)]);
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

export function movieFile(cameraClock, {
  creationTimeIs64Bit = false, videoDataUses64BitBoxSize = false,
  extraUserData = null, extraMovieBoxes = null,
} = {}) {
  const videoData = Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    videoDataUses64BitBoxSize ? isoBoxWith64BitSize('mdat', videoData) : isoBox('mdat', videoData),
    isoBox('moov', Buffer.concat([
      isoBox('udta', extraUserData ?? Buffer.alloc(16)),
      movieHeaderBox(cameraClock, creationTimeIs64Bit),
      ...(extraMovieBoxes === null ? [] : [extraMovieBoxes]),
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

const BIG_TIFF_SIGNATURE = 0x2b;
const BYTES_IN_A_BIG_TIFF_HEADER = 16;
const BYTES_PER_BIG_TIFF_DIRECTORY_ENTRY = 20;
const BYTES_IN_A_BIG_TIFF_OFFSET = 8;
const BYTES_IN_A_BIG_TIFF_DIRECTORY_HOLDING_ONE_ENTRY =
  BYTES_IN_A_BIG_TIFF_OFFSET + BYTES_PER_BIG_TIFF_DIRECTORY_ENTRY + BYTES_IN_A_BIG_TIFF_OFFSET;

const CANON_METADATA_UUID = Buffer.from('85c0b687820f11e08111f4ce462b6a48', 'hex');
const FUJIFILM_RAW_HEADER_BYTES = 148;
const BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER = 84;
const APPLE_CREATION_DATE_KEY = 'com.apple.quicktime.creationdate';
const METADATA_KEY_NAMESPACE = 'mdta';
const BYTES_IN_A_METADATA_KEY_HEADER = 8;
const ITEM_LOCATION_VERSION_WITH_LONG_COUNTS = 2;
const ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID = 3;
const EXIF_ITEM_ID = 1;
const HEIF_EXIF_PAYLOAD_SKIPPING_THE_MARKER = 6;
const OFFSET_AND_LENGTH_BOTH_FOUR_BYTES_WIDE = 0x44;

const bigEndianUInt16 = (value) => { const bytes = Buffer.alloc(2); bytes.writeUInt16BE(value, 0); return bytes; };
const bigEndianUInt32 = (value) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value, 0); return bytes; };

function isoFullBox(boxType, version, body) {
  return isoBox(boxType, Buffer.concat([Buffer.from([version, 0, 0, 0]), body]));
}

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

export function bigTiffFile(dateTimeOriginal, { bigEndian = false } = {}) {
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
  const entry = (tag, valueType, valueCount, valueOrOffset) =>
    Buffer.concat([uInt16(tag), uInt16(valueType), uInt64(valueCount), uInt64(valueOrOffset)]);
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
    directoryHolding([entry(TIFF_TAG_EXIF_DIRECTORY_POINTER, TIFF_VALUE_TYPE_LONG, 1, exifDirectoryOffset)]),
    directoryHolding([entry(TIFF_TAG_DATE_TIME_ORIGINAL, TIFF_VALUE_TYPE_ASCII, dateValue.length, dateValueOffset)]),
    dateValue,
  ]);
}

export function canonRawFile(dateTimeOriginal, { modifyDate = '2001:01:01 00:00:00' } = {}) {
  const movieHeader = Buffer.alloc(BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('crx crx isom', 'latin1')),
    isoBox('moov', Buffer.concat([
      isoBox('mvhd', movieHeader),
      isoBox('uuid', Buffer.concat([
        CANON_METADATA_UUID,
        isoBox('CMT1', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_MODIFY_DATE, modifyDate)),
        isoBox('CMT2', tiffFileWithTheDateInItsMainDirectory(TIFF_TAG_DATE_TIME_ORIGINAL, dateTimeOriginal)),
      ])),
    ])),
    isoBox('mdat', Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)),
  ]);
}

export function fujifilmRawFile(dateTimeOriginal) {
  const header = Buffer.alloc(FUJIFILM_RAW_HEADER_BYTES);
  header.write('FUJIFILMCCD-RAW 0201FF129502', 0, 'latin1');
  header.write('X-T5', 32, 'latin1');
  const embeddedJpeg = jpegFile(dateTimeOriginal);
  header.writeUInt32BE(FUJIFILM_RAW_HEADER_BYTES, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER);
  header.writeUInt32BE(embeddedJpeg.length, BYTES_FROM_RAW_FILE_START_TO_ITS_EMBEDDED_JPEG_POINTER + 4);
  return Buffer.concat([header, embeddedJpeg, Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)]);
}

export function heifStill(dateTimeOriginal, {
  itemLocationVersion = 1, itemEntryVersion = 2, spellsOutTheExifMarker = true,
} = {}) {
  const exifPayload = spellsOutTheExifMarker
    ? Buffer.concat([
      bigEndianUInt32(HEIF_EXIF_PAYLOAD_SKIPPING_THE_MARKER), Buffer.from(EXIF_HEADER, 'latin1'),
      tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
    ])
    : Buffer.concat([bigEndianUInt32(0), tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal })]);

  const idIsLong = itemEntryVersion >= ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID;
  const itemInformationEntry = isoFullBox('infe', itemEntryVersion, Buffer.concat([
    idIsLong ? bigEndianUInt32(EXIF_ITEM_ID) : bigEndianUInt16(EXIF_ITEM_ID),
    bigEndianUInt16(0), Buffer.from('Exif\0', 'latin1'),
  ]));
  const itemInformation = isoFullBox('iinf', 0, Buffer.concat([bigEndianUInt16(1), itemInformationEntry]));

  const countsAreLong = itemLocationVersion >= ITEM_LOCATION_VERSION_WITH_LONG_COUNTS;
  const asLongAsTheVersionNeeds = (value) => (countsAreLong ? bigEndianUInt32(value) : bigEndianUInt16(value));

  const buildWithTheExifItemAt = (payloadStart) => {
    const carriesAConstructionMethod = itemLocationVersion >= 1;
    const item = Buffer.concat([
      asLongAsTheVersionNeeds(EXIF_ITEM_ID),
      ...(carriesAConstructionMethod ? [bigEndianUInt16(0)] : []),
      bigEndianUInt16(0), bigEndianUInt16(1),
      bigEndianUInt32(payloadStart), bigEndianUInt32(exifPayload.length),
    ]);
    const itemLocation = isoFullBox('iloc', itemLocationVersion, Buffer.concat([
      Buffer.from([OFFSET_AND_LENGTH_BOTH_FOUR_BYTES_WIDE, 0x00]), asLongAsTheVersionNeeds(1), item,
    ]));
    return Buffer.concat([
      isoBox('ftyp', Buffer.from('heicmif1miafheic', 'latin1')),
      isoFullBox('meta', 0, Buffer.concat([isoBox('hdlr', Buffer.alloc(24)), itemInformation, itemLocation])),
      isoBox('mdat', exifPayload),
    ]);
  };
  const measured = buildWithTheExifItemAt(0);
  return buildWithTheExifItemAt(measured.length - exifPayload.length);
}

export function movieFileSayingWhichZoneItsClockIsIn(mvhdClock, spelledOutDate) {
  const creationDate = isoBox('\u00a9day', Buffer.concat([
    bigEndianUInt16(spelledOutDate.length), bigEndianUInt16(0), Buffer.from(spelledOutDate, 'latin1'),
  ]));
  return movieFile(mvhdClock, { extraUserData: creationDate });
}

export function movieFileCarryingACanonThumbnail(mvhdClock, dateTimeOriginal) {
  return movieFile(mvhdClock, { extraUserData: isoBox('CNTH', isoBox('CNDA', jpegFile(dateTimeOriginal))) });
}

export function movieFileWithAnAppleCreationDate(mvhdClock, spelledOutDate) {
  const keyName = Buffer.from(APPLE_CREATION_DATE_KEY, 'latin1');
  const keys = isoFullBox('keys', 0, Buffer.concat([
    bigEndianUInt32(1),
    bigEndianUInt32(BYTES_IN_A_METADATA_KEY_HEADER + keyName.length),
    Buffer.from(METADATA_KEY_NAMESPACE, 'latin1'), keyName,
  ]));
  const value = isoBox('data', Buffer.concat([
    bigEndianUInt32(1), bigEndianUInt32(0), Buffer.from(spelledOutDate, 'latin1'),
  ]));
  const itemList = isoBox('ilst', isoBox(bigEndianUInt32(1).toString('latin1'), value));
  const metadata = isoFullBox('meta', 0, Buffer.concat([isoBox('hdlr', Buffer.alloc(24)), keys, itemList]));
  return movieFile(mvhdClock, { extraMovieBoxes: metadata });
}

const CIFF_HEADER_BYTES = 26;
const CIFF_TAG_CAPTURE_TIME = 0x180e;
const CIFF_TAG_IMAGE_PROPERTIES = 0x2807;
const BYTES_PER_CIFF_DIRECTORY_ENTRY = 10;
const BYTES_IN_A_CIFF_CAPTURE_TIME = 12;
const SIGMA_PROPERTY_SECTION_HEADER_BYTES = 24;
const BYTES_PER_SIGMA_PROPERTY_ENTRY = 8;
const BYTES_PER_SIGMA_DIRECTORY_ENTRY = 12;

const secondsSince1970For = (cameraClock) => {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  return Date.UTC(year, month - 1, day, hour, minute, second) / MILLISECONDS_PER_SECOND;
};

export function minoltaRawFile(dateTimeOriginal) {
  const minoltaBlock = (blockType, body) => {
    const header = Buffer.alloc(8);
    header.write(blockType, 0, 'latin1');
    header.writeUInt32BE(body.length, 4);
    return Buffer.concat([header, body]);
  };
  const thumbnail = minoltaBlock('\0PRD', Buffer.alloc(24, 3));
  const exifBlock = minoltaBlock('\0TTW', bigEndianTiffFile(dateTimeOriginal));
  const whiteBalance = minoltaBlock('\0WBG', Buffer.alloc(16, 4));
  const body = Buffer.concat([thumbnail, exifBlock, whiteBalance]);
  return Buffer.concat([minoltaBlock('\0MRM', Buffer.alloc(0)).subarray(0, 4),
    bigEndianUInt32(body.length),
    body, Buffer.alloc(64, 5)]);
}

export function canonCiffRawFile(cameraClock) {
  const captureTime = Buffer.alloc(BYTES_IN_A_CIFF_CAPTURE_TIME);
  captureTime.writeUInt32LE(secondsSince1970For(cameraClock), 0);
  captureTime.writeInt32LE(0, 4);
  captureTime.writeUInt32LE(0, 8);

  // A heap is its data, then its directory, then a pointer back to that directory.
  const heapHolding = (entries, data) => {
    const count = Buffer.alloc(2);
    count.writeUInt16LE(entries.length, 0);
    const directory = Buffer.concat([count, ...entries, Buffer.alloc(4)]);
    const pointer = Buffer.alloc(4);
    pointer.writeUInt32LE(data.length, 0);
    return Buffer.concat([data, directory, pointer]);
  };
  const entry = (tag, length, offset) => {
    const buffer = Buffer.alloc(BYTES_PER_CIFF_DIRECTORY_ENTRY);
    buffer.writeUInt16LE(tag, 0);
    buffer.writeUInt32LE(length, 2);
    buffer.writeUInt32LE(offset, 6);
    return buffer;
  };

  const innerHeap = heapHolding([entry(CIFF_TAG_CAPTURE_TIME, captureTime.length, 0)], captureTime);
  const outerHeap = heapHolding([entry(CIFF_TAG_IMAGE_PROPERTIES, innerHeap.length, 0)], innerHeap);

  const header = Buffer.alloc(CIFF_HEADER_BYTES);
  header.write(TIFF_LITTLE_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt32LE(CIFF_HEADER_BYTES, 2);
  header.write('HEAPCCDR', 6, 'latin1');
  header.writeUInt32LE(0x00010002, 14);
  return Buffer.concat([header, outerHeap]);
}

export function sigmaRawFile(cameraClock) {
  const twoByteWide = (text) => Buffer.from(`${text}\0`, 'utf16le');
  const names = ['CAMMANUF', 'TIME', 'SHUTTER'];
  const values = ['SIGMA', String(secondsSince1970For(cameraClock)), '1/250'];

  const text = [];
  const table = Buffer.alloc(names.length * BYTES_PER_SIGMA_PROPERTY_ENTRY);
  let charactersSoFar = 0;
  names.forEach((name, propertyIndex) => {
    const nameText = twoByteWide(name);
    const valueText = twoByteWide(values[propertyIndex]);
    table.writeUInt32LE(charactersSoFar, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY);
    charactersSoFar += nameText.length / 2;
    table.writeUInt32LE(charactersSoFar, propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY + 4);
    charactersSoFar += valueText.length / 2;
    text.push(nameText, valueText);
  });

  const propertyHeader = Buffer.alloc(SIGMA_PROPERTY_SECTION_HEADER_BYTES);
  propertyHeader.write('SECp', 0, 'latin1');
  propertyHeader.writeUInt32LE(1, 4);
  propertyHeader.writeUInt32LE(names.length, 8);
  propertyHeader.writeUInt32LE(0, 12);
  propertyHeader.writeUInt32LE(0, 16);
  propertyHeader.writeUInt32LE(charactersSoFar, 20);
  const propertySection = Buffer.concat([propertyHeader, table, ...text]);

  const fileHeader = Buffer.alloc(64);
  fileHeader.write('FOVb', 0, 'latin1');
  fileHeader.writeUInt32LE(0x00030000, 4);
  const propertySectionStart = fileHeader.length;

  const directoryEntry = Buffer.alloc(BYTES_PER_SIGMA_DIRECTORY_ENTRY);
  directoryEntry.writeUInt32LE(propertySectionStart, 0);
  directoryEntry.writeUInt32LE(propertySection.length, 4);
  directoryEntry.write('PROP', 8, 'latin1');

  const directoryHeader = Buffer.alloc(12);
  directoryHeader.write('SECd', 0, 'latin1');
  directoryHeader.writeUInt32LE(1, 4);
  directoryHeader.writeUInt32LE(1, 8);
  const directory = Buffer.concat([directoryHeader, directoryEntry]);

  const directoryStart = propertySectionStart + propertySection.length;
  const pointer = Buffer.alloc(4);
  pointer.writeUInt32LE(directoryStart, 0);
  return Buffer.concat([fileHeader, propertySection, directory, pointer]);
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
