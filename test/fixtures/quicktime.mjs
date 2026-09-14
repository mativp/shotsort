import { bigEndianUInt16, bigEndianUInt32 } from './bigEndian.mjs';
import { BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE } from './filler.mjs';
import { MILLISECONDS_PER_SECOND } from './moments.mjs';
import { jpegFile } from './jpeg.mjs';
import {
  BYTES_IN_AN_ISO_BOX_SIZE_FIELD, isoBox, isoBoxRunningToTheEndOfTheFile, isoBoxWith64BitSize, isoFullBox,
} from './isoBaseMedia.mjs';

const SECONDS_BETWEEN_1904_AND_1970 = 2082844800;

const MOVIE_HEADER_VERSION_WITH_32_BIT_TIMES = 0;
const MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES = 1;
const BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME = 4;
export const BYTES_IN_MOVIE_HEADER_WITH_32_BIT_TIMES = 100;
const BYTES_IN_MOVIE_HEADER_WITH_64_BIT_TIMES = 120;

const BYTES_IN_A_PRETEND_TRUNCATED_MOVIE = 64;

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
  extraUserData = null, extraMovieBoxes = null, userDataEndsTheFile = false,
} = {}) {
  const videoData = Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE);
  const userData = isoBox('udta', extraUserData ?? Buffer.alloc(16));
  const movieHeader = movieHeaderBox(cameraClock, creationTimeIs64Bit);
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    videoDataUses64BitBoxSize ? isoBoxWith64BitSize('mdat', videoData) : isoBox('mdat', videoData),
    isoBox('moov', Buffer.concat([
      ...(userDataEndsTheFile ? [movieHeader, userData] : [userData, movieHeader]),
      ...(extraMovieBoxes === null ? [] : [extraMovieBoxes]),
    ])),
  ]);
}

export function movieFileWhoseMovieBoxRunsToTheEnd(cameraClock) {
  return Buffer.concat([
    isoBox('ftyp', Buffer.from('mp42mp42isom', 'latin1')),
    isoBox('mdat', Buffer.alloc(BYTES_OF_PRETEND_VIDEO_DATA, PRETEND_VIDEO_DATA_FILL_BYTE)),
    isoBoxRunningToTheEndOfTheFile('moov', movieHeaderBox(cameraClock, false)),
  ]);
}

const APPLE_CREATION_DATE_KEY = 'com.apple.quicktime.creationdate';
const METADATA_KEY_NAMESPACE = 'mdta';
const BYTES_IN_A_METADATA_KEY_HEADER = 8;

export const quickTimeCreationDateBox = (spelledOutDate) => isoBox('\u00a9day', Buffer.concat([
  bigEndianUInt16(spelledOutDate.length), bigEndianUInt16(0), Buffer.from(spelledOutDate, 'latin1'),
]));

export const movieFileSayingWhichZoneItsClockIsIn = (mvhdClock, spelledOutDate) =>
  movieFile(mvhdClock, { extraUserData: quickTimeCreationDateBox(spelledOutDate) });

export const canonThumbnailBox = (jpeg) => isoBox('CNTH', isoBox('CNDA', jpeg));

export const movieFileCarryingACanonThumbnail = (mvhdClock, dateTimeOriginal) =>
  movieFile(mvhdClock, { extraUserData: canonThumbnailBox(jpegFile(dateTimeOriginal)) });

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
export function appleMetadataKey(keyName = APPLE_CREATION_DATE_KEY, { declaredSize } = {}) {
  const name = Buffer.from(keyName, 'latin1');
  return Buffer.concat([
    bigEndianUInt32(declaredSize ?? BYTES_IN_A_METADATA_KEY_HEADER + name.length),
    Buffer.from(METADATA_KEY_NAMESPACE, 'latin1'), name,
  ]);
}

export const appleMetadataKeysBox = (keys, declaredCount = keys.length) =>
  isoFullBox('keys', 0, Buffer.concat([bigEndianUInt32(declaredCount), ...keys]));

export const appleMetadataItemList = (itemsByKeyIndex) => isoBox('ilst', Buffer.concat(
  itemsByKeyIndex.map(([keyIndex, spelledOutDate]) => isoBox(bigEndianUInt32(keyIndex).toString('latin1'), isoBox('data', Buffer.concat([
    bigEndianUInt32(1), bigEndianUInt32(0), Buffer.from(spelledOutDate, 'latin1'),
  ])))),
));

export function movieFileWithAppleMetadata(mvhdClock, keysBox, itemList, { isoStyleMetadataBox = false } = {}) {
  const children = Buffer.concat([isoBox('hdlr', metadataHandlerNaming(APPLE_METADATA_HANDLER)), keysBox, itemList]);
  const metadata = isoStyleMetadataBox ? isoFullBox('meta', 0, children) : isoBox('meta', children);
  return movieFile(mvhdClock, { extraMovieBoxes: metadata });
}

export const movieFileWithAnAppleCreationDate = (mvhdClock, spelledOutDate, layout) => movieFileWithAppleMetadata(
  mvhdClock, appleMetadataKeysBox([appleMetadataKey()]), appleMetadataItemList([[1, spelledOutDate]]), layout,
);

const A_BOX_SIZE_SMALLER_THAN_THE_HEADER_IT_IS_WRITTEN_IN = 4;

export function movieFileWhoseBoxIsSmallerThanItsOwnHeader() {
  const box = Buffer.alloc(BYTES_IN_A_PRETEND_TRUNCATED_MOVIE);
  box.writeUInt32BE(A_BOX_SIZE_SMALLER_THAN_THE_HEADER_IT_IS_WRITTEN_IN, 0);
  box.write('moov', BYTES_IN_AN_ISO_BOX_SIZE_FIELD, 'latin1');
  return box;
}
