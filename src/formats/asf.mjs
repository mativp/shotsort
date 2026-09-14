// ASF, which is WMV off an older camcorder. Its objects are named by a sixteen-byte id
// rather than a four-letter one, and the recording time is Windows' own count of
// ten-millionths of a second since 1601.
import { readBytesAt, readUInt64EitherWayRoundAt } from '../bytes.mjs';
import { cameraClockFromHundredNanosecondsSince1601, onlyIfPlausible } from '../clock.mjs';

// Written the way the bytes actually sit in the file: the first three groups of the
// sixteen-byte id go in least significant byte first and the last two go in as they read,
// which is why neither of these spells out the id the way the specification prints it.
const ASF_HEADER_OBJECT_ID = '3026b2758e66cf11a6d900aa0062ce6c';
const ASF_FILE_PROPERTIES_OBJECT_ID = 'a1dcab8c47a9cf118ee400c00c205365';
const BYTES_IN_AN_ASF_OBJECT_ID = 16;
const BYTES_IN_AN_ASF_OBJECT_SIZE = 8;
const BYTES_IN_AN_ASF_OBJECT_HEADER = BYTES_IN_AN_ASF_OBJECT_ID + BYTES_IN_AN_ASF_OBJECT_SIZE;
const BYTES_FROM_THE_HEADER_OBJECT_START_TO_ITS_CHILDREN = BYTES_IN_AN_ASF_OBJECT_HEADER + 4 + 2;
const BYTES_FROM_FILE_PROPERTIES_START_TO_THE_CREATION_DATE = BYTES_IN_AN_ASF_OBJECT_HEADER + 16 + 8;
const BYTES_IN_A_CREATION_DATE = 8;
const MOST_OBJECTS_A_REAL_HEADER_HAS = 256;

export const startsWithAnAsfHeaderObject = (byteSource) =>
  readBytesAt(byteSource, 0, BYTES_IN_AN_ASF_OBJECT_ID)?.toString('hex') === ASF_HEADER_OBJECT_ID;

export function readCameraClockFromAsf(byteSource) {
  if (!startsWithAnAsfHeaderObject(byteSource)) return null;

  const headerObjectSize = readUInt64EitherWayRoundAt(byteSource, BYTES_IN_AN_ASF_OBJECT_ID, true);
  const headerEnd = Math.min(headerObjectSize, byteSource.sizeInBytes);

  let objectStart = BYTES_FROM_THE_HEADER_OBJECT_START_TO_ITS_CHILDREN;
  for (let objectIndex = 0; objectIndex < MOST_OBJECTS_A_REAL_HEADER_HAS; objectIndex++) {
    if (objectStart + BYTES_IN_AN_ASF_OBJECT_HEADER > headerEnd) return null;
    const objectId = readBytesAt(byteSource, objectStart, BYTES_IN_AN_ASF_OBJECT_ID).toString('hex');
    const objectSize = readUInt64EitherWayRoundAt(byteSource, objectStart + BYTES_IN_AN_ASF_OBJECT_ID, true);
    if (objectSize < BYTES_IN_AN_ASF_OBJECT_HEADER) return null;

    if (objectId === ASF_FILE_PROPERTIES_OBJECT_ID) {
      const creationDateEnd = objectStart + BYTES_FROM_FILE_PROPERTIES_START_TO_THE_CREATION_DATE + BYTES_IN_A_CREATION_DATE;
      if (creationDateEnd > Math.min(objectStart + objectSize, headerEnd)) return null;
      const hundredNanoseconds = readUInt64EitherWayRoundAt(
        byteSource, objectStart + BYTES_FROM_FILE_PROPERTIES_START_TO_THE_CREATION_DATE, true,
      );
      return onlyIfPlausible(cameraClockFromHundredNanosecondsSince1601(hundredNanoseconds));
    }
    objectStart += objectSize;
  }
  return null;
}
