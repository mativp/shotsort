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
export const TIFF_VALUE_TYPE_LONG = 4;
const TIFF_VALUE_TYPE_LONG8 = 16;
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
const JPEG_MARKER_APP2_ICC_PROFILE = 0xe2;
const SEGMENTS_MORE_THAN_THE_PARSER_WILL_WALK = 4100;
const SEGMENTS_A_COLOUR_MANAGED_PHOTO_REALLY_CARRIES = 96;
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
const BYTES_IN_A_PRETEND_TRUNCATED_MOVIE = 64;
const BYTES_IN_AN_ISO_BOX_SIZE_FIELD = 4;
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

// A handler box says what kind of metadata follows it, and Apple's keys are only read as
// Apple's keys when the handler names them: version and flags, four reserved bytes, then
// the four letters.
const APPLE_METADATA_HANDLER = 'mdta';
const BYTES_IN_A_METADATA_HANDLER_BOX = 24;
const BYTES_FROM_A_HANDLER_BOX_START_TO_ITS_NAME = 8;

function metadataHandlerNaming(handler) {
  const box = Buffer.alloc(BYTES_IN_A_METADATA_HANDLER_BOX);
  box.write(handler, BYTES_FROM_A_HANDLER_BOX_START_TO_ITS_NAME, 'latin1');
  return box;
}

// Apple writes the QuickTime metadata box, which goes straight to its children; an MP4
// writes the ISO one, which puts a version and flags in front of them first.
export function movieFileWithAnAppleCreationDate(mvhdClock, spelledOutDate, { isoStyleMetadataBox = false } = {}) {
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
  const children = Buffer.concat([isoBox('hdlr', metadataHandlerNaming(APPLE_METADATA_HANDLER)), keys, itemList]);
  const metadata = isoStyleMetadataBox ? isoFullBox('meta', 0, children) : isoBox('meta', children);
  return movieFile(mvhdClock, { extraMovieBoxes: metadata });
}

const CIFF_HEADER_BYTES = 26;
const CIFF_TAG_CAPTURE_TIME = 0x180e;
const CIFF_TAG_IMAGE_PROPERTIES = 0x2807;
const BYTES_PER_CIFF_DIRECTORY_ENTRY = 10;
const BYTES_IN_A_CIFF_CAPTURE_TIME = 12;
const SIGMA_PROPERTY_SECTION_HEADER_BYTES = 24;
// Sigma's later versions put a second, longer header after the first one; version two
// does not, which keeps the fixture to the part this actually reads.
const SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS = 0x00020000;
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

export function canonCiffRawFile(cameraClock, { heapsTheCaptureTimeIsBuriedUnder = 1 } = {}) {
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

  let heap = heapHolding([entry(CIFF_TAG_CAPTURE_TIME, captureTime.length, 0)], captureTime);
  for (let level = 0; level < heapsTheCaptureTimeIsBuriedUnder; level++) {
    heap = heapHolding([entry(CIFF_TAG_IMAGE_PROPERTIES, heap.length, 0)], heap);
  }

  const header = Buffer.alloc(CIFF_HEADER_BYTES);
  header.write(TIFF_LITTLE_ENDIAN_MARK, 0, 'latin1');
  header.writeUInt32LE(CIFF_HEADER_BYTES, 2);
  header.write('HEAPCCDR', 6, 'latin1');
  header.writeUInt32LE(0x00010002, 14);
  return Buffer.concat([header, heap]);
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
  fileHeader.writeUInt32LE(SIGMA_VERSION_WHOSE_HEADER_ENDS_WHERE_IT_SAYS, 4);
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

// ---------------------------------------------------------------------------
// The formats that are not a TIFF, a JPEG or a box tree: RIFF, PNG, Matroska,
// ASF and the JPEG XL container.
// ---------------------------------------------------------------------------

const BYTES_IN_A_RIFF_CHUNK_HEADER = 8;
const RIFF_RECORDING_DATE_CHUNK = 'IDIT';
const RIFF_DATE_CREATED_CHUNK = 'ICRD';

function riffChunk(chunkType, body) {
  const header = Buffer.alloc(BYTES_IN_A_RIFF_CHUNK_HEADER);
  header.write(chunkType, 0, 'latin1');
  header.writeUInt32LE(body.length, 4);
  const padToAnEvenLength = body.length % 2 === 1 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([header, body, padToAnEvenLength]);
}

function riffList(listType, chunks) {
  return riffChunk('LIST', Buffer.concat([Buffer.from(listType, 'latin1'), ...chunks]));
}

function riffFile(formType, chunks) {
  return riffChunk('RIFF', Buffer.concat([Buffer.from(formType, 'latin1'), ...chunks]));
}

export function aviFileRecordingWhenItWasShot(dateWrittenOut) {
  return riffFile('AVI ', [
    riffList('hdrl', [
      riffChunk('avih', Buffer.alloc(56)),
      riffChunk(RIFF_RECORDING_DATE_CHUNK, Buffer.from(`${dateWrittenOut}\n\0`, 'latin1')),
    ]),
    riffChunk('movi', Buffer.alloc(64)),
  ]);
}

export function aviFileSayingOnlyWhenItWasCreated(dateWrittenOut) {
  return riffFile('AVI ', [
    riffList('hdrl', [riffChunk('avih', Buffer.alloc(56))]),
    riffList('INFO', [riffChunk(RIFF_DATE_CREATED_CHUNK, Buffer.from(`${dateWrittenOut}\0`, 'latin1'))]),
    riffChunk('movi', Buffer.alloc(64)),
  ]);
}

export function webPStill(dateTimeOriginal) {
  return riffFile('WEBP', [
    riffChunk('VP8 ', Buffer.alloc(32)),
    riffChunk('EXIF', Buffer.concat([
      Buffer.from(EXIF_HEADER, 'latin1'),
      tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
    ])),
  ]);
}

const PNG_SIGNATURE = '\x89PNG\r\n\x1a\n';
const PNG_CHECKSUM_TABLE = (() => {
  const table = new Int32Array(256);
  for (let byteValue = 0; byteValue < 256; byteValue++) {
    let remainder = byteValue;
    for (let bit = 0; bit < 8; bit++) {
      remainder = (remainder & 1) === 1 ? 0xedb88320 ^ (remainder >>> 1) : remainder >>> 1;
    }
    table[byteValue] = remainder;
  }
  return table;
})();

function pngChecksumOf(bytes) {
  let remainder = 0xffffffff;
  for (const byte of bytes) remainder = PNG_CHECKSUM_TABLE[(remainder ^ byte) & 0xff] ^ (remainder >>> 8);
  return (remainder ^ 0xffffffff) >>> 0;
}

function pngChunk(chunkType, body) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const typeAndBody = Buffer.concat([Buffer.from(chunkType, 'latin1'), body]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(pngChecksumOf(typeAndBody));
  return Buffer.concat([length, typeAndBody, checksum]);
}

const SMALLEST_PNG_HEADER = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const SHORTEST_DEFLATE_STREAM = Buffer.from([0x78, 0x9c, 0x62, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]);

function pngFileHolding(chunksBeforeTheImage) {
  return Buffer.concat([
    Buffer.from(PNG_SIGNATURE, 'latin1'),
    pngChunk('IHDR', SMALLEST_PNG_HEADER),
    ...chunksBeforeTheImage,
    pngChunk('IDAT', SHORTEST_DEFLATE_STREAM),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pngStill(dateTimeOriginal) {
  return pngFileHolding([
    pngChunk('eXIf', tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal })),
  ]);
}

export function pngStillDatedOnlyInItsText(dateWrittenOut) {
  return pngFileHolding([
    pngChunk('tEXt', Buffer.from(`Creation Time\0${dateWrittenOut}`, 'latin1')),
  ]);
}

const EBML_HEADER_ELEMENT = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const MATROSKA_SEGMENT_ELEMENT = Buffer.from([0x18, 0x53, 0x80, 0x67]);
const MATROSKA_SEGMENT_INFORMATION_ELEMENT = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
const MATROSKA_RECORDING_DATE_ELEMENT = Buffer.from([0x44, 0x61]);
const MATROSKA_DOCUMENT_TYPE_ELEMENT = Buffer.from([0x42, 0x82]);
const NANOSECONDS_PER_SECOND = 1000000000;
const SECONDS_BETWEEN_1970_AND_2001 = 978307200;

// An element's length is written with a leading bit saying how many bytes it takes. Eight
// bytes is always enough and is what is used here, so the marker is the top bit alone.
function ebmlElement(elementId, body) {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(body.length));
  length[0] |= 0x01;
  return Buffer.concat([elementId, length, body]);
}

export function matroskaMovie(cameraClock) {
  const nanoseconds = Buffer.alloc(8);
  nanoseconds.writeBigInt64BE(
    BigInt(secondsSince1970For(cameraClock) - SECONDS_BETWEEN_1970_AND_2001) * BigInt(NANOSECONDS_PER_SECOND),
  );
  return Buffer.concat([
    ebmlElement(EBML_HEADER_ELEMENT, ebmlElement(MATROSKA_DOCUMENT_TYPE_ELEMENT, Buffer.from('matroska', 'latin1'))),
    ebmlElement(MATROSKA_SEGMENT_ELEMENT, ebmlElement(MATROSKA_SEGMENT_INFORMATION_ELEMENT, Buffer.concat([
      ebmlElement(Buffer.from([0x2a, 0xd7, 0xb1]), Buffer.alloc(3)),
      ebmlElement(MATROSKA_RECORDING_DATE_ELEMENT, nanoseconds),
    ]))),
  ]);
}

const ASF_HEADER_OBJECT_ID = Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex');
const ASF_FILE_PROPERTIES_OBJECT_ID = Buffer.from('a1dcab8c47a9cf118ee400c00c205365', 'hex');
const ASF_PADDING_OBJECT_ID = Buffer.from('7400000000000000000000000000000f', 'hex');
const BYTES_IN_AN_ASF_OBJECT_HEADER = 24;
const HUNDRED_NANOSECONDS_PER_SECOND = 10000000;
const SECONDS_BETWEEN_1601_AND_1970 = 11644473600;

function asfObject(objectId, body) {
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(BYTES_IN_AN_ASF_OBJECT_HEADER + body.length));
  return Buffer.concat([objectId, size, body]);
}

export function windowsMediaMovie(cameraClock) {
  const fileProperties = Buffer.alloc(80);
  fileProperties.writeBigUInt64LE(
    BigInt(secondsSince1970For(cameraClock) + SECONDS_BETWEEN_1601_AND_1970) * BigInt(HUNDRED_NANOSECONDS_PER_SECOND),
    24,
  );
  const children = asfObject(ASF_FILE_PROPERTIES_OBJECT_ID, fileProperties);

  const howManyChildrenAndTwoReservedBytes = Buffer.alloc(6);
  howManyChildrenAndTwoReservedBytes.writeUInt32LE(1, 0);
  return asfObject(ASF_HEADER_OBJECT_ID, Buffer.concat([howManyChildrenAndTwoReservedBytes, children]));
}

const JPEG_XL_CONTAINER_SIGNATURE = Buffer.from('0000000c4a584c200d0a870a', 'hex');
const BYTES_IN_A_JPEG_XL_EXIF_PREAMBLE = 4;

export function jpegXlStill(dateTimeOriginal) {
  const exifPayload = Buffer.concat([
    Buffer.alloc(BYTES_IN_A_JPEG_XL_EXIF_PREAMBLE),
    tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal }),
  ]);
  return Buffer.concat([
    JPEG_XL_CONTAINER_SIGNATURE,
    isoBox('ftyp', Buffer.from('jxl jxl ', 'latin1')),
    isoBox('Exif', exifPayload),
    isoBox('jxlc', Buffer.alloc(32)),
  ]);
}

const DV_BLOCK_MARK = Buffer.from([0x1f, 0x07, 0x00, 0x3f]);
const BYTES_IN_A_DV_BLOCK = 80;
const BLOCKS_IN_A_PRETEND_DV_CLIP = 150;
const DV_AUXILIARY_BLOCK_MARK = 0x50;
const DV_RECORDING_DATE_PACK = 0x62;
const DV_RECORDING_TIME_PACK = 0x63;
const BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS = 3;
const BYTES_PER_DV_PACK = 5;

const asBinaryCodedDecimal = (number) => ((Math.floor(number / 10) << 4) | (number % 10));

export function digitalVideoClip(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const clip = Buffer.alloc(BLOCKS_IN_A_PRETEND_DV_CLIP * BYTES_IN_A_DV_BLOCK);
  DV_BLOCK_MARK.copy(clip, 0);

  const auxiliaryBlockStart = BYTES_IN_A_DV_BLOCK;
  clip[auxiliaryBlockStart] = DV_AUXILIARY_BLOCK_MARK;
  const packAt = (packIndex) =>
    auxiliaryBlockStart + BYTES_FROM_A_DV_BLOCK_START_TO_ITS_PACKS + packIndex * BYTES_PER_DV_PACK;

  // Both packs are written the way a camcorder writes them: the field order runs backwards
  // and the two digits of each number share a byte.
  const datePack = packAt(0);
  clip[datePack] = DV_RECORDING_DATE_PACK;
  clip[datePack + 2] = asBinaryCodedDecimal(day);
  clip[datePack + 3] = asBinaryCodedDecimal(month);
  clip[datePack + 4] = asBinaryCodedDecimal(year % 100);

  const timePack = packAt(1);
  clip[timePack] = DV_RECORDING_TIME_PACK;
  clip[timePack + 2] = asBinaryCodedDecimal(second);
  clip[timePack + 3] = asBinaryCodedDecimal(minute);
  clip[timePack + 4] = asBinaryCodedDecimal(hour);
  return clip;
}

export function pngStillDatedOnlyByWhenItWasLastWritten(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const lastWritten = Buffer.alloc(7);
  lastWritten.writeUInt16BE(year, 0);
  lastWritten[2] = month;
  lastWritten[3] = day;
  lastWritten[4] = hour;
  lastWritten[5] = minute;
  lastWritten[6] = second;
  return pngFileHolding([pngChunk('tIME', lastWritten)]);
}

const REDCODE_MARK = 'RED';
const BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK = 4;
const BYTES_IN_A_PRETEND_REDCODE_HEADER = 0x44;
const REDCODE_FIRST_TIMECODE_RECORD = 0x1000;
const REDCODE_WHEN_IT_WAS_SHOT_RECORD = 0x1005;
const REDCODE_FILLER_RECORD = 0x1019;
const BYTES_IN_A_REDCODE_RECORD_HEADER = 4;
const BYTES_IN_A_REDCODE_TIMECODE = 11;
const SHORTEST_REDCODE_DIRECTORY_WORTH_TRUSTING = 300;
const BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY = 0x22;

function redcodeRecord(recordNumber, value) {
  const header = Buffer.alloc(BYTES_IN_A_REDCODE_RECORD_HEADER);
  header.writeUInt16BE(BYTES_IN_A_REDCODE_RECORD_HEADER + value.length, 0);
  header.writeUInt16BE(recordNumber, 2);
  return Buffer.concat([header, value]);
}

export function redcodeClip(cameraClock, { headerSaysWhereTheDirectoryIs = true, version = '2' } = {}) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const twoDigits = (number) => String(number).padStart(2, '0');
  const runOfDigits = `${year}${twoDigits(month)}${twoDigits(day)}${twoDigits(hour)}${twoDigits(minute)}${twoDigits(second)}`;

  const records = [
    redcodeRecord(REDCODE_FIRST_TIMECODE_RECORD, Buffer.alloc(BYTES_IN_A_REDCODE_TIMECODE)),
    redcodeRecord(REDCODE_WHEN_IT_WAS_SHOT_RECORD, Buffer.from(`${runOfDigits}\0`, 'latin1')),
  ];
  // A directory shorter than the length worth trusting is what a camera whose header
  // arithmetic does not hold looks like: the reader has to find the directory by looking
  // for the record that begins it rather than by counting to it.
  if (headerSaysWhereTheDirectoryIs) {
    const soFar = records.reduce((total, record) => total + record.length, 0);
    const padding = SHORTEST_REDCODE_DIRECTORY_WORTH_TRUSTING - soFar;
    records.push(redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(padding - BYTES_IN_A_REDCODE_RECORD_HEADER)));
  }

  const directory = Buffer.concat(records);
  const howLongTheDirectoryIs = Buffer.alloc(2);
  howLongTheDirectoryIs.writeUInt16BE(directory.length);

  const header = Buffer.alloc(BYTES_IN_A_PRETEND_REDCODE_HEADER);
  header.write(`${REDCODE_MARK}${version}`, BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK, 'latin1');

  // The first version of the format keeps its directory in a block of its own, a fixed
  // distance into the one after the header; the second keeps it in the header block.
  if (version === '1') {
    header.writeUInt32BE(header.length, 0);
    return Buffer.concat([
      header,
      Buffer.alloc(BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY),
      howLongTheDirectoryIs,
      directory,
    ]);
  }

  const block = Buffer.concat([header, howLongTheDirectoryIs, directory]);
  block.writeUInt32BE(block.length, 0);
  return block;
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

// Every format this tool claims to read, built at one moment so the two suites that walk
// them can say the same thing about each. `test/oracle.mjs` puts the list to exiftool;
// `test/unittest.mjs` cuts each one short and corrupts it to check that a card holding a
// half-written file is read as undated rather than throwing. A format added here is
// therefore checked both ways round without either suite being touched.
export const WHEN_A_CAMERA_WOULD_WRITE_IT = '2021:03:04 05:06:07';
export const WHEN_SPELLED_OUT_WITH_DASHES = '2021-03-04 05:06:07';
export const WHEN_SPELLED_OUT_WITH_A_ZONE = '2021-03-04T05:06:07+0200';
export const WHEN_WRITTEN_IN_WORDS = 'Thu Mar 04 05:06:07 2021';
export const WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO = 'Thu, 04 Mar 2021 05:06:07 +0000';
export const A_CLOCK_THE_READER_MUST_PASS_OVER = '2001-01-01 00:00:00';
export const THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS = '2021-03-04 05:06:07';

export const everyFixtureFormatIsBuiltFrom = () => [
  ['jpeg.JPG', jpegFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-with-a-restart-marker-first.JPG', jpegFileWithARestartMarkerFirst(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-behind-the-segments-a-photo-has.JPG',
    jpegFileBehindAsManySegmentsAsAPhotoReallyHas(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-behind-more-segments-than-are-walked.JPG',
    jpegFileBuriedUnderManySegments(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['tiff.TIF', tiffFile({
    signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['tiff-written-big-endian.TIF', bigEndianTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['tiff-with-only-a-modify-date.TIF', tiffFileWithTheDateInItsMainDirectory(
    TIFF_TAG_MODIFY_DATE, WHEN_A_CAMERA_WOULD_WRITE_IT,
  )],
  ['big-tiff.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['big-tiff-written-big-endian.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, { bigEndian: true })],
  ['big-tiff-pointing-with-a-narrow-offset.TIF', bigTiffFile(WHEN_A_CAMERA_WOULD_WRITE_IT, {
    bigEndian: true, pointerType: TIFF_VALUE_TYPE_LONG,
  })],
  ['panasonic.RW2', tiffFile({
    signature: PANASONIC_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['panasonic-dated-only-in-its-preview.RW2',
    panasonicRawWithDateOnlyInEmbeddedJpeg(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['olympus.ORF', tiffFile({
    signature: OLYMPUS_RAW_SIGNATURE, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['olympus-on-a-later-body.ORF', tiffFile({
    signature: OLYMPUS_RAW_SIGNATURE_ON_LATER_BODIES, dateTimeOriginal: WHEN_A_CAMERA_WOULD_WRITE_IT,
  })],
  ['canon.CR3', canonRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['canon-ciff.CRW', canonCiffRawFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['fujifilm.RAF', fujifilmRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['minolta.MRW', minoltaRawFile(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['sigma.X3F', sigmaRawFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['heif.HEIC', heifStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['jpeg-xl.JXL', jpegXlStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['png.PNG', pngStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['png-dated-only-in-its-text.PNG', pngStillDatedOnlyInItsText(WHEN_WRITTEN_THE_WAY_MAIL_HEADERS_DO)],
  ['png-dated-only-by-when-it-was-written.PNG',
    pngStillDatedOnlyByWhenItWasLastWritten(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['webp.WEBP', webPStill(WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['movie.MP4', movieFile(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['movie-with-a-64-bit-clock.MP4', movieFile(WHEN_SPELLED_OUT_WITH_DASHES, { creationTimeIs64Bit: true })],
  ['movie-whose-box-runs-to-the-end.MOV', movieFileWhoseMovieBoxRunsToTheEnd(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['movie-saying-which-zone-it-is-in.MOV',
    movieFileSayingWhichZoneItsClockIsIn(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)],
  ['movie-carrying-a-canon-thumbnail.MOV',
    movieFileCarryingACanonThumbnail(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_A_CAMERA_WOULD_WRITE_IT)],
  ['movie-with-an-apple-date.MOV',
    movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE)],
  ['movie-with-an-apple-date-in-an-iso-metadata-box.MP4',
    movieFileWithAnAppleCreationDate(A_CLOCK_THE_READER_MUST_PASS_OVER, WHEN_SPELLED_OUT_WITH_A_ZONE,
      { isoStyleMetadataBox: true })],
  ['avi-recording-when-it-was-shot.AVI', aviFileRecordingWhenItWasShot(WHEN_WRITTEN_IN_WORDS)],
  ['avi-saying-only-when-it-was-created.AVI', aviFileSayingOnlyWhenItWasCreated(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['matroska.MKV', matroskaMovie(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['windows-media.WMV', windowsMediaMovie(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['digital-video.DV', digitalVideoClip(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['redcode.R3D', redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES)],
  ['redcode-whose-header-does-not-say-where-the-directory-is.R3D',
    redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES, { headerSaysWhereTheDirectoryIs: false })],
  ['redcode-of-the-first-version.R3D', redcodeClip(WHEN_SPELLED_OUT_WITH_DASHES, { version: '1' })],
];

// The shapes a walk must not be led round forever by, and the two format variants no
// camera in the catalogue above writes. None of these is a file a camera would produce:
// they are what a corrupted card, or a maker's older firmware, hands the reader instead.

const LISTS_NESTED_DEEPER_THAN_A_CAMERA_NESTS_THEM = 6;

export function aviFileNestingItsListsDeeperThanACameraDoes(dateWrittenOut) {
  let nested = [riffChunk(RIFF_RECORDING_DATE_CHUNK, Buffer.from(`${dateWrittenOut}\n\0`, 'latin1'))];
  for (let level = 0; level < LISTS_NESTED_DEEPER_THAN_A_CAMERA_NESTS_THEM; level++) {
    nested = [riffList('hdrl', nested)];
  }
  return riffFile('AVI ', [...nested, riffChunk('movi', Buffer.alloc(64))]);
}

const EBML_HEADER_ELEMENT_BYTES = [0x1a, 0x45, 0xdf, 0xa3];
const EBML_LENGTH_OF_NOTHING = 0x80;
// The width of an id is written in the leading zeros of its first byte, so a byte with
// four of them claims an id five bytes wide -- wider than any id is allowed to be.
const AN_ID_CLAIMING_TO_BE_WIDER_THAN_ANY_ID_MAY_BE = 0x08;

export function matroskaMovieWhoseIdIsWiderThanAnyIdMayBe() {
  return Buffer.from([
    ...EBML_HEADER_ELEMENT_BYTES, EBML_LENGTH_OF_NOTHING,
    AN_ID_CLAIMING_TO_BE_WIDER_THAN_ANY_ID_MAY_BE, 0, 0, 0, 0, 0, 0, 0,
  ]);
}

const A_BOX_SIZE_SMALLER_THAN_THE_HEADER_IT_IS_WRITTEN_IN = 4;

export function movieFileWhoseBoxIsSmallerThanItsOwnHeader() {
  const box = Buffer.alloc(BYTES_IN_A_PRETEND_TRUNCATED_MOVIE);
  box.writeUInt32BE(A_BOX_SIZE_SMALLER_THAN_THE_HEADER_IT_IS_WRITTEN_IN, 0);
  box.write('moov', BYTES_IN_AN_ISO_BOX_SIZE_FIELD, 'latin1');
  return box;
}

// The same worry as the nested walks above, for the walks that run along a level rather
// than down one: each stops after more items than a real file carries, and these are the
// files that carry more. A camera writes none of them.
const CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH = 300;
const OBJECTS_MORE_THAN_AN_ASF_WALK_LOOKS_THROUGH = 300;
const CHUNKS_MORE_THAN_A_RIFF_WALK_LOOKS_THROUGH = 1100;
const RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH = 300;
const PADDING_CHUNK_BODY_BYTES = 1;

export function pngStillBuriedUnderMoreChunksThanAreWalked(dateTimeOriginal) {
  const padding = Array.from({ length: CHUNKS_MORE_THAN_A_PNG_WALK_LOOKS_THROUGH },
    () => pngChunk('gAMA', Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));
  return pngFileHolding([...padding, pngChunk('eXIf', tiffFile({
    signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal,
  }))]);
}

export function windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked(cameraClock) {
  const fileProperties = Buffer.alloc(80);
  fileProperties.writeBigUInt64LE(
    BigInt(secondsSince1970For(cameraClock) + SECONDS_BETWEEN_1601_AND_1970) * BigInt(HUNDRED_NANOSECONDS_PER_SECOND),
    24,
  );
  const padding = Array.from({ length: OBJECTS_MORE_THAN_AN_ASF_WALK_LOOKS_THROUGH },
    () => asfObject(ASF_PADDING_OBJECT_ID, Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));
  const children = Buffer.concat([...padding, asfObject(ASF_FILE_PROPERTIES_OBJECT_ID, fileProperties)]);

  const howManyChildrenAndTwoReservedBytes = Buffer.alloc(6);
  howManyChildrenAndTwoReservedBytes.writeUInt32LE(padding.length + 1, 0);
  return asfObject(ASF_HEADER_OBJECT_ID, Buffer.concat([howManyChildrenAndTwoReservedBytes, children]));
}

export function aviFileBuriedUnderMoreChunksThanAreWalked(dateWrittenOut) {
  const padding = Array.from({ length: CHUNKS_MORE_THAN_A_RIFF_WALK_LOOKS_THROUGH },
    () => riffChunk('JUNK', Buffer.alloc(PADDING_CHUNK_BODY_BYTES)));
  return riffFile('AVI ', [
    ...padding,
    riffChunk(RIFF_RECORDING_DATE_CHUNK, Buffer.from(`${dateWrittenOut}\n\0`, 'latin1')),
  ]);
}

export function redcodeClipBuriedUnderMoreRecordsThanAreWalked(cameraClock) {
  const [year, month, day, hour, minute, second] = cameraClock.split(/[-: ]/).map(Number);
  const twoDigits = (number) => String(number).padStart(2, '0');
  const runOfDigits = `${year}${twoDigits(month)}${twoDigits(day)}${twoDigits(hour)}${twoDigits(minute)}${twoDigits(second)}`;

  const records = [
    redcodeRecord(REDCODE_FIRST_TIMECODE_RECORD, Buffer.alloc(BYTES_IN_A_REDCODE_TIMECODE)),
    ...Array.from({ length: RECORDS_MORE_THAN_A_REDCODE_WALK_LOOKS_THROUGH },
      () => redcodeRecord(REDCODE_FILLER_RECORD, Buffer.alloc(PADDING_CHUNK_BODY_BYTES))),
    redcodeRecord(REDCODE_WHEN_IT_WAS_SHOT_RECORD, Buffer.from(`${runOfDigits}\0`, 'latin1')),
  ];

  const directory = Buffer.concat(records);
  const howLongTheDirectoryIs = Buffer.alloc(2);
  howLongTheDirectoryIs.writeUInt16BE(directory.length);

  const header = Buffer.alloc(BYTES_IN_A_PRETEND_REDCODE_HEADER);
  header.write(`${REDCODE_MARK}2`, BYTES_FROM_A_REDCODE_FILE_START_TO_ITS_MARK, 'latin1');
  const block = Buffer.concat([header, howLongTheDirectoryIs, directory]);
  block.writeUInt32BE(block.length, 0);
  return block;
}
