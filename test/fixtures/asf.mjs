import { PADDING_CHUNK_BODY_BYTES } from './filler.mjs';
import { secondsSince1970For } from './moments.mjs';

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

const OBJECTS_MORE_THAN_AN_ASF_WALK_LOOKS_THROUGH = 300;

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
