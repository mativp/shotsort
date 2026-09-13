import { bigEndianUInt16, bigEndianUInt32 } from './bigEndian.mjs';
import { EXIF_HEADER, TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';
import { isoBox, isoFullBox } from './isoBaseMedia.mjs';

const ITEM_LOCATION_VERSION_WITH_LONG_COUNTS = 2;
const ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID = 3;
const EXIF_ITEM_ID = 1;
const HEIF_EXIF_PAYLOAD_SKIPPING_THE_MARKER = 6;

// The payload opens with how many bytes to skip to reach the TIFF header, which either
// spells out the Exif marker or is simply whatever comes before the TIFF.
export function heifExifPayload(dateTimeOriginal, {
  spellsOutTheExifMarker = true, bytesBeforeTheTiff = 0, bytesItSaysToSkip = HEIF_EXIF_PAYLOAD_SKIPPING_THE_MARKER,
} = {}) {
  const tiff = tiffFile({ signature: TIFF_STANDARD_SIGNATURE, dateTimeOriginal });
  return spellsOutTheExifMarker
    ? Buffer.concat([bigEndianUInt32(bytesItSaysToSkip), Buffer.from(EXIF_HEADER, 'latin1'), tiff])
    : Buffer.concat([bigEndianUInt32(bytesBeforeTheTiff), Buffer.alloc(bytesBeforeTheTiff), tiff]);
}

export const heifItemInformationEntry = ({ id = EXIF_ITEM_ID, version = 2, type = 'Exif', boxType = 'infe' } = {}) =>
  isoFullBox(boxType, version, Buffer.concat([
    version >= ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID ? bigEndianUInt32(id) : bigEndianUInt16(id),
    bigEndianUInt16(0), Buffer.from(`${type}\0`, 'latin1'),
  ]));

export const heifItemInformationBox = (entries, { version = 0 } = {}) => isoFullBox('iinf', version, Buffer.concat([
  version > 0 ? bigEndianUInt32(entries.length) : bigEndianUInt16(entries.length), ...entries,
]));

function unsignedOfWidth(value, byteCount) {
  const bytes = Buffer.alloc(byteCount);
  if (byteCount === 8) bytes.writeBigUInt64BE(BigInt(value));
  else if (byteCount > 0) bytes.writeUIntBE(value, 0, byteCount);
  return bytes;
}

// Each item is an id, a construction method (from version one on), a base offset and its
// extents, every field as wide as the box's header says.
export function heifItemLocationBox(items, {
  version = 1, offsetSize = 4, lengthSize = 4, baseOffsetSize = 0, indexSize = 0, declaredItemCount = items.length,
} = {}) {
  const countsAreLong = version >= ITEM_LOCATION_VERSION_WITH_LONG_COUNTS;
  const asLongAsTheVersionNeeds = (value) => (countsAreLong ? bigEndianUInt32(value) : bigEndianUInt16(value));
  const itemBytes = items.map(({ id = EXIF_ITEM_ID, constructionMethod = 0, baseOffset = 0, extents }) => Buffer.concat([
    asLongAsTheVersionNeeds(id),
    ...(version >= 1 ? [bigEndianUInt16(constructionMethod)] : []),
    bigEndianUInt16(0),
    unsignedOfWidth(baseOffset, baseOffsetSize),
    bigEndianUInt16(extents.length),
    ...extents.flatMap(({ index = 0, offset, length }) => [
      unsignedOfWidth(index, indexSize), unsignedOfWidth(offset, offsetSize), unsignedOfWidth(length, lengthSize),
    ]),
  ]));
  return isoFullBox('iloc', version, Buffer.concat([
    Buffer.from([(offsetSize << 4) | lengthSize, (baseOffsetSize << 4) | indexSize]),
    asLongAsTheVersionNeeds(declaredItemCount), ...itemBytes,
  ]));
}

// Where the payload lands depends on how long the boxes before it are, so the boxes are
// built once to measure and again knowing where the payload starts.
export function heifStillHolding(boxesKnowingWhereThePayloadStarts, payload) {
  const buildWithThePayloadAt = (payloadStart) => {
    const { itemInformation, itemLocation } = boxesKnowingWhereThePayloadStarts(payloadStart);
    return Buffer.concat([
      isoBox('ftyp', Buffer.from('heicmif1miafheic', 'latin1')),
      isoFullBox('meta', 0, Buffer.concat([isoBox('hdlr', Buffer.alloc(24)), itemInformation, itemLocation])),
      isoBox('mdat', payload),
    ]);
  };
  const measured = buildWithThePayloadAt(0);
  return buildWithThePayloadAt(measured.length - payload.length);
}

export function heifStill(dateTimeOriginal, {
  itemLocationVersion = 1, itemEntryVersion = 2, spellsOutTheExifMarker = true,
} = {}) {
  const payload = heifExifPayload(dateTimeOriginal, { spellsOutTheExifMarker });
  return heifStillHolding((payloadStart) => ({
    itemInformation: heifItemInformationBox([heifItemInformationEntry({ version: itemEntryVersion })]),
    itemLocation: heifItemLocationBox([{ extents: [{ offset: payloadStart, length: payload.length }] }], { version: itemLocationVersion }),
  }), payload);
}
