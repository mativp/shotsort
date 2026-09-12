// The box tree that MP4, MOV, HEIC, AVIF and Canon's CR3 are all built out of. Finding a
// box is the whole of it; what is inside one is each format's own business.
import { readTextAt, readUInt8At, readUInt32At, readUInt64At } from '../bytes.mjs';

const ISO_BOX_HEADER_BYTES = 8;
const ISO_BOX_HEADER_WITH_64_BIT_SIZE_BYTES = 16;
export const ISO_BOX_SIZE_FIELD_BYTES = 4;
const ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS = 1;
const ISO_BOX_SIZE_MEANING_THIS_BOX_RUNS_TO_THE_END = 0;

export const ISO_BOX_TYPE_FIELD_BYTES = 4;
export const BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS = 4;
export const BYTES_IN_AN_ISO_UUID = 16;

export const MOVIE_BOX_TYPE = 'moov';
export const MOVIE_HEADER_BOX_TYPE = 'mvhd';
export const USER_DATA_BOX_TYPE = 'udta';
export const METADATA_BOX_TYPE = 'meta';
export const UUID_BOX_TYPE = 'uuid';
export const HANDLER_BOX_TYPE = 'hdlr';

export function findIsoBoxWhere(byteSource, searchStart, searchEnd, isTheOneWanted) {
  let boxStart = searchStart;
  while (boxStart + ISO_BOX_HEADER_BYTES <= searchEnd) {
    const declaredSize = readUInt32At(byteSource, boxStart, false);
    const boxType = readTextAt(byteSource, boxStart + ISO_BOX_SIZE_FIELD_BYTES, ISO_BOX_TYPE_FIELD_BYTES);
    if (declaredSize === null || boxType === null) return null;

    let headerSize = ISO_BOX_HEADER_BYTES;
    let boxSize = declaredSize;
    if (declaredSize === ISO_BOX_SIZE_MEANING_A_64_BIT_SIZE_FOLLOWS) {
      boxSize = readUInt64At(byteSource, boxStart + ISO_BOX_HEADER_BYTES);
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

export const findIsoBox = (byteSource, searchStart, searchEnd, wantedType) =>
  findIsoBoxWhere(byteSource, searchStart, searchEnd, (boxType) => boxType === wantedType);

export function findIsoBoxPath(byteSource, searchStart, searchEnd, boxTypesFromTheOutermost) {
  let box = { contentStart: searchStart, contentEnd: searchEnd };
  for (const boxType of boxTypesFromTheOutermost) {
    box = findIsoBox(byteSource, box.contentStart, box.contentEnd, boxType);
    if (box === null) return null;
  }
  return box;
}

export const versionOfBoxAt = (byteSource, box) => readUInt8At(byteSource, box.contentStart);

export const insideABoxThatStartsWithAVersionAndFlags = (box) => ({
  contentStart: box.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS,
  contentEnd: box.contentEnd,
});

// The metadata box is the one place the two families disagree about their own rules.
// QuickTime, which is what a .MOV off an iPhone is, goes straight to the children; MP4 and
// HEIF put a version and flags in front of them. Nothing in the box says which, so the
// handler box that has to come first either way is what settles it -- and getting this
// wrong is not a parse error but four bytes of drift, which finds nothing and says
// nothing about why.
export function insideAMetadataBox(byteSource, box) {
  const handlerAt = (position) =>
    readTextAt(byteSource, position + ISO_BOX_SIZE_FIELD_BYTES, ISO_BOX_TYPE_FIELD_BYTES) === HANDLER_BOX_TYPE;
  return handlerAt(box.contentStart)
    ? { contentStart: box.contentStart, contentEnd: box.contentEnd }
    : insideABoxThatStartsWithAVersionAndFlags(box);
}

export const readTextInside = (byteSource, box, skippingBytes, longestWorthReading) => {
  const textStart = box.contentStart + skippingBytes;
  const byteCount = Math.min(box.contentEnd - textStart, longestWorthReading);
  return byteCount <= 0 ? null : readTextAt(byteSource, textStart, byteCount);
};
