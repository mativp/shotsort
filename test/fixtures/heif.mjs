import { bigEndianUInt16, bigEndianUInt32 } from './bytes.mjs';
import { EXIF_HEADER, TIFF_STANDARD_SIGNATURE, tiffFile } from './tiff.mjs';
import { isoBox, isoFullBox } from './isoBaseMedia.mjs';

const ITEM_LOCATION_VERSION_WITH_LONG_COUNTS = 2;
const ITEM_ENTRY_VERSION_NAMING_THE_TYPE_AS_A_LONG_ID = 3;
const EXIF_ITEM_ID = 1;
const HEIF_EXIF_PAYLOAD_SKIPPING_THE_MARKER = 6;
const OFFSET_AND_LENGTH_BOTH_FOUR_BYTES_WIDE = 0x44;

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
