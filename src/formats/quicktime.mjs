// Video. The movie header's own creation time is the last resort, because some makers
// write it in UTC and others in local time and the file does not say which. Anything that
// spells a timezone out -- the user data Canon and Nikon write, Apple's creation date,
// the thumbnail Canon stores beside the clip -- is preferred over it.
import { BYTES_IN_A_SHORT_FIELD, readTextAt, readUInt8At, readUInt32At, readUInt64At } from '../bytes.mjs';
import {
  ISO_BOX_TYPE_FIELD_BYTES, METADATA_BOX_TYPE, MOVIE_BOX_TYPE, MOVIE_HEADER_BOX_TYPE, USER_DATA_BOX_TYPE,
  BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS,
  findIsoBox, findIsoBoxPath, insideAMetadataBox, readTextInside,
} from './isoBaseMedia.mjs';
import { readCameraClockFromJpeg } from './jpeg.mjs';
import { cameraClockFromIso8601, cameraClockFromSecondsSince1904, onlyIfPlausible } from '../clock.mjs';

const QUICKTIME_CREATION_DATE_BOX_TYPE = '\u00a9day';
const METADATA_KEYS_BOX_TYPE = 'keys';
const METADATA_ITEM_LIST_BOX_TYPE = 'ilst';
const METADATA_VALUE_BOX_TYPE = 'data';
const APPLE_CREATION_DATE_KEY = 'com.apple.quicktime.creationdate';
const MOST_METADATA_KEYS_A_REAL_MOVIE_HAS = 256;
const BYTES_IN_A_METADATA_KEY_HEADER = 8;
const BYTES_IN_A_METADATA_VALUE_HEADER = 8;
const LONGEST_METADATA_VALUE_IN_BYTES = 128;

const CANON_THUMBNAIL_BOX_TYPE = 'CNTH';
const CANON_THUMBNAIL_IMAGE_BOX_TYPE = 'CNDA';

const MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES = 1;
const BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME = 4;

function readCreationDateFromUserData(byteSource, movieBox) {
  const userData = findIsoBox(byteSource, movieBox.contentStart, movieBox.contentEnd, USER_DATA_BOX_TYPE);
  if (userData === null) return null;

  const canonThumbnail = findIsoBoxPath(byteSource, userData.contentStart, userData.contentEnd,
    [CANON_THUMBNAIL_BOX_TYPE, CANON_THUMBNAIL_IMAGE_BOX_TYPE]);
  if (canonThumbnail !== null) {
    const clock = readCameraClockFromJpeg(byteSource, canonThumbnail.contentStart);
    if (clock !== null) return clock;
  }

  const creationDate = findIsoBox(
    byteSource, userData.contentStart, userData.contentEnd, QUICKTIME_CREATION_DATE_BOX_TYPE,
  );
  return creationDate === null
    ? null
    : cameraClockFromIso8601(readTextInside(byteSource, creationDate, 0, LONGEST_METADATA_VALUE_IN_BYTES));
}

function readCreationDateWrittenByApple(byteSource, movieBox) {
  const metadataBox = findIsoBox(byteSource, movieBox.contentStart, movieBox.contentEnd, METADATA_BOX_TYPE);
  if (metadataBox === null) return null;
  const metadataContents = insideAMetadataBox(byteSource, metadataBox);

  const keysBox = findIsoBox(byteSource, metadataContents.contentStart, metadataContents.contentEnd, METADATA_KEYS_BOX_TYPE);
  const itemListBox = findIsoBox(byteSource, metadataContents.contentStart, metadataContents.contentEnd, METADATA_ITEM_LIST_BOX_TYPE);
  if (keysBox === null || itemListBox === null) return null;

  let position = keysBox.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
  const keyCount = readUInt32At(byteSource, position, false);
  if (keyCount === null || keyCount > MOST_METADATA_KEYS_A_REAL_MOVIE_HAS) return null;
  position += BYTES_IN_A_SHORT_FIELD;

  let indexOfTheCreationDate = null;
  for (let key = 1; key <= keyCount && indexOfTheCreationDate === null; key++) {
    const keySize = readUInt32At(byteSource, position, false);
    if (keySize === null || keySize < BYTES_IN_A_METADATA_KEY_HEADER) return null;
    const keyName = readTextAt(
      byteSource, position + BYTES_IN_A_METADATA_KEY_HEADER, keySize - BYTES_IN_A_METADATA_KEY_HEADER,
    );
    if (keyName === APPLE_CREATION_DATE_KEY) indexOfTheCreationDate = key;
    position += keySize;
  }
  if (indexOfTheCreationDate === null) return null;

  const itemType = Buffer.alloc(ISO_BOX_TYPE_FIELD_BYTES);
  itemType.writeUInt32BE(indexOfTheCreationDate);
  const itemBox = findIsoBox(
    byteSource, itemListBox.contentStart, itemListBox.contentEnd, itemType.toString('latin1'),
  );
  if (itemBox === null) return null;
  const valueBox = findIsoBox(byteSource, itemBox.contentStart, itemBox.contentEnd, METADATA_VALUE_BOX_TYPE);
  if (valueBox === null) return null;
  return cameraClockFromIso8601(
    readTextInside(byteSource, valueBox, BYTES_IN_A_METADATA_VALUE_HEADER, LONGEST_METADATA_VALUE_IN_BYTES),
  );
}

export function readCameraClockFromMovie(byteSource) {
  const movieBox = findIsoBox(byteSource, 0, byteSource.sizeInBytes, MOVIE_BOX_TYPE);
  if (movieBox === null) return null;

  const clockTheCameraSpeltOut = readCreationDateFromUserData(byteSource, movieBox)
    ?? readCreationDateWrittenByApple(byteSource, movieBox);
  if (clockTheCameraSpeltOut !== null) return clockTheCameraSpeltOut;

  const movieHeaderBox = findIsoBox(byteSource, movieBox.contentStart, movieBox.contentEnd, MOVIE_HEADER_BOX_TYPE);
  if (movieHeaderBox === null) return null;

  const version = readUInt8At(byteSource, movieHeaderBox.contentStart);
  const creationTimeStart = movieHeaderBox.contentStart + BYTES_FROM_MOVIE_HEADER_START_TO_CREATION_TIME;
  const secondsSince1904 = version === MOVIE_HEADER_VERSION_WITH_64_BIT_TIMES
    ? readUInt64At(byteSource, creationTimeStart)
    : readUInt32At(byteSource, creationTimeStart, false);
  if (secondsSince1904 === null || secondsSince1904 === 0) return null;

  return onlyIfPlausible(cameraClockFromSecondsSince1904(secondsSince1904));
}
