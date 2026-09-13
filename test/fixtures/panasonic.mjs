import {
  BYTES_IN_A_DIRECTORY_HOLDING_ONE_ENTRY, BYTES_IN_TIFF_HEADER, PANASONIC_RAW_SIGNATURE, TIFF_TAG_JPEG_FROM_RAW,
  TIFF_VALUE_TYPE_UNDEFINED, tiffDirectoryEntry, tiffDirectoryHolding, tiffHeaderPointingAtFirstDirectory,
} from './tiff.mjs';
import { jpegFile } from './jpeg.mjs';

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
