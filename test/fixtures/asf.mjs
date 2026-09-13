import { PADDING_CHUNK_BODY_BYTES } from './filler.mjs';
import { secondsSince1970For } from './moments.mjs';

const ASF_HEADER_OBJECT_ID = Buffer.from('3026b2758e66cf11a6d900aa0062ce6c', 'hex');
const ASF_FILE_PROPERTIES_OBJECT_ID = Buffer.from('a1dcab8c47a9cf118ee400c00c205365', 'hex');
const ASF_PADDING_OBJECT_ID = Buffer.from('7400000000000000000000000000000f', 'hex');
const BYTES_IN_AN_ASF_OBJECT_HEADER = 24;
const HUNDRED_NANOSECONDS_PER_SECOND = 10000000;
const SECONDS_BETWEEN_1601_AND_1970 = 11644473600;

export function asfObject(objectId, body, { declaredSize = BYTES_IN_AN_ASF_OBJECT_HEADER + body.length } = {}) {
  const size = Buffer.alloc(8);
  size.writeBigUInt64LE(BigInt(declaredSize));
  return Buffer.concat([objectId, size, body]);
}

export function asfFilePropertiesObject(cameraClock) {
  const fileProperties = Buffer.alloc(80);
  fileProperties.writeBigUInt64LE(
    BigInt(secondsSince1970For(cameraClock) + SECONDS_BETWEEN_1601_AND_1970) * BigInt(HUNDRED_NANOSECONDS_PER_SECOND),
    24,
  );
  return asfObject(ASF_FILE_PROPERTIES_OBJECT_ID, fileProperties);
}

export const asfPaddingObjects = (howMany, bodyBytes = PADDING_CHUNK_BODY_BYTES) =>
  Array.from({ length: howMany }, () => asfObject(ASF_PADDING_OBJECT_ID, Buffer.alloc(bodyBytes)));

export function windowsMediaMovieHolding(children, { afterTheHeader = [] } = {}) {
  const howManyChildrenAndTwoReservedBytes = Buffer.alloc(6);
  howManyChildrenAndTwoReservedBytes.writeUInt32LE(children.length, 0);
  return Buffer.concat([
    asfObject(ASF_HEADER_OBJECT_ID, Buffer.concat([howManyChildrenAndTwoReservedBytes, ...children])),
    ...afterTheHeader,
  ]);
}

export const windowsMediaMovie = (cameraClock) => windowsMediaMovieHolding([asfFilePropertiesObject(cameraClock)]);

const OBJECTS_MORE_THAN_AN_ASF_WALK_LOOKS_THROUGH = 300;

export const windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked = (cameraClock) => windowsMediaMovieHolding([
  ...asfPaddingObjects(OBJECTS_MORE_THAN_AN_ASF_WALK_LOOKS_THROUGH), asfFilePropertiesObject(cameraClock),
]);
