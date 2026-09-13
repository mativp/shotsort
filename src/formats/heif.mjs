// HEIC and AVIF stills keep their Exif as a numbered item: one box says which item is the
// Exif one, another says where in the file that item's bytes begin.
import {
  BYTES_IN_A_SHORT_FIELD,
  readBytesAt, readTextAt, readUInt16At, readUInt32At, readUnsignedOfWidthAt,
} from '../bytes.mjs';
import {
  BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS, ISO_BOX_TYPE_FIELD_BYTES, METADATA_BOX_TYPE,
  findIsoBox, findIsoBoxWhere, insideAMetadataBox, versionOfBoxAt,
} from './isoBaseMedia.mjs';
import { readCameraClockFromTiff } from './tiff.mjs';
import { EXIF_HEADER } from './jpeg.mjs';

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

const BYTES_IN_A_SHORT_ITEM_ID = 2;
const BYTES_IN_A_LONG_ITEM_ID = 4;
const BYTES_IN_A_DATA_REFERENCE_INDEX = 2;
const BYTES_IN_AN_EXTENT_COUNT = 2;
const BYTES_IN_A_CONSTRUCTION_METHOD = 2;
const LOW_FOUR_BITS = 0x0f;
const BITS_TO_THE_HIGH_NIBBLE = 4;

export function readCameraClockFromExifPayload(byteSource, payloadStart, payloadLength) {
  const preamble = readTextAt(byteSource, payloadStart, Math.min(payloadLength, LONGEST_HEIF_EXIF_PREAMBLE_IN_BYTES));
  if (preamble !== null && preamble.includes(EXIF_HEADER)) {
    return readCameraClockFromTiff(byteSource, payloadStart + preamble.indexOf(EXIF_HEADER) + EXIF_HEADER.length);
  }
  const tiffHeaderOffset = readUInt32At(byteSource, payloadStart, false);
  return readCameraClockFromTiff(byteSource, payloadStart + BYTES_IN_A_SHORT_FIELD + tiffHeaderOffset);
}

function findTheExifItemsId(byteSource, metadataContents) {
  const itemInformation = findIsoBox(
    byteSource, metadataContents.contentStart, metadataContents.contentEnd, ITEM_INFORMATION_BOX_TYPE,
  );
  if (itemInformation === null) return null;

  const version = versionOfBoxAt(byteSource, itemInformation);
  const countIsLong = version > 0;
  const entriesStart = itemInformation.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS
    + (countIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID);

  const idOfEntry = (entry) => {
    const entryVersion = versionOfBoxAt(byteSource, entry);
    const theEntryNamesItsType = entryVersion >= ITEM_ENTRY_EARLIEST_VERSION_NAMING_A_TYPE;
    if (!theEntryNamesItsType) return null;
    const idIsLong = entryVersion >= ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID;
    const idStart = entry.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
    const typeStart = idStart + (idIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID)
      + BYTES_IN_A_DATA_REFERENCE_INDEX;
    if (readTextAt(byteSource, typeStart, ISO_BOX_TYPE_FIELD_BYTES) !== EXIF_ITEM_TYPE) return null;
    return idIsLong
      ? readUInt32At(byteSource, idStart, false)
      : readUInt16At(byteSource, idStart, false);
  };

  let exifItemId = null;
  findIsoBoxWhere(byteSource, entriesStart, itemInformation.contentEnd, (boxType, box) => {
    if (boxType !== ITEM_INFORMATION_ENTRY_BOX_TYPE) return false;
    exifItemId = idOfEntry(box);
    return exifItemId !== null;
  });
  return exifItemId;
}

function findWhereTheItemIsStored(byteSource, metadataContents, wantedItemId) {
  const itemLocation = findIsoBox(
    byteSource, metadataContents.contentStart, metadataContents.contentEnd, ITEM_LOCATION_BOX_TYPE,
  );
  if (itemLocation === null) return null;
  const version = versionOfBoxAt(byteSource, itemLocation);

  let position = itemLocation.contentStart + BYTES_IN_A_BOX_THAT_STARTS_WITH_A_VERSION_AND_FLAGS;
  const widths = readBytesAt(byteSource, position, 2);
  if (widths === null) return null;
  const offsetSize = widths[0] >> BITS_TO_THE_HIGH_NIBBLE;
  const lengthSize = widths[0] & LOW_FOUR_BITS;
  const baseOffsetSize = widths[1] >> BITS_TO_THE_HIGH_NIBBLE;
  const carriesAConstructionMethod = version >= ITEM_LOCATION_EARLIEST_VERSION_WITH_A_CONSTRUCTION_METHOD;
  const indexSize = carriesAConstructionMethod ? (widths[1] & LOW_FOUR_BITS) : 0;
  position += 2;

  const idIsLong = version >= ITEM_LOCATION_VERSION_WITH_LONG_COUNTS;
  const bytesInAnId = idIsLong ? BYTES_IN_A_LONG_ITEM_ID : BYTES_IN_A_SHORT_ITEM_ID;
  const readId = (at) => (idIsLong ? readUInt32At(byteSource, at, false) : readUInt16At(byteSource, at, false));

  const itemCount = readId(position);
  if (itemCount > MOST_ITEMS_A_REAL_STILL_HAS) return null;
  position += bytesInAnId;

  for (let item = 0; item < itemCount; item++) {
    const itemId = readId(position);
    position += bytesInAnId;

    let constructionMethod = ITEM_STORED_AT_A_PLAIN_FILE_OFFSET;
    if (carriesAConstructionMethod) {
      constructionMethod = (readUInt16At(byteSource, position, false) ?? 0) & LOW_FOUR_BITS;
      position += BYTES_IN_A_CONSTRUCTION_METHOD;
    }
    position += BYTES_IN_A_DATA_REFERENCE_INDEX;

    const baseOffset = readUnsignedOfWidthAt(byteSource, position, baseOffsetSize);
    if (baseOffset === null) return null;
    position += baseOffsetSize;

    const extentCount = readUInt16At(byteSource, position, false);
    position += BYTES_IN_AN_EXTENT_COUNT;

    for (let extent = 0; extent < extentCount; extent++) {
      position += indexSize;
      const extentOffset = readUnsignedOfWidthAt(byteSource, position, offsetSize);
      position += offsetSize;
      const extentLength = readUnsignedOfWidthAt(byteSource, position, lengthSize);
      position += lengthSize;
      if (extentOffset === null || extentLength === null) return null;

      const thisIsTheItemWanted = itemId === wantedItemId && constructionMethod === ITEM_STORED_AT_A_PLAIN_FILE_OFFSET;
      if (thisIsTheItemWanted) return { start: baseOffset + extentOffset, length: extentLength };
    }
  }
  return null;
}

export function readCameraClockFromHeifStill(byteSource) {
  const metadataBox = findIsoBox(byteSource, 0, byteSource.sizeInBytes, METADATA_BOX_TYPE);
  if (metadataBox === null) return null;
  const metadataContents = insideAMetadataBox(byteSource, metadataBox);

  const whereItIsStored = findWhereTheItemIsStored(byteSource, metadataContents, findTheExifItemsId(byteSource, metadataContents));
  if (whereItIsStored === null) return null;
  return readCameraClockFromExifPayload(byteSource, whereItIsStored.start, whereItIsStored.length);
}
