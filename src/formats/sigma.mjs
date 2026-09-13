// Sigma X3F ends with a pointer to a section directory; one of those sections is a table
// of named properties, and the capture time is the one called TIME, written as seconds
// since 1970 in two-byte-wide characters.
import { readTextAt, readTwoByteWideTextAt, readUInt32At } from '../bytes.mjs';
import { ISO_BOX_TYPE_FIELD_BYTES } from './isoBaseMedia.mjs';
import { cameraClockFromSecondsSince1970, onlyIfPlausible } from '../clock.mjs';

const SIGMA_RAW_MARK = 'FOVb';
const SIGMA_DIRECTORY_MARK = 'SECd';
const SIGMA_PROPERTY_SECTION_MARK = 'SECp';
const SIGMA_PROPERTY_SECTION_TYPE = 'PROP';
const SIGMA_CAPTURE_TIME_PROPERTY = 'TIME';
const BYTES_IN_A_SIGMA_MARK = ISO_BOX_TYPE_FIELD_BYTES;
const BYTES_IN_A_SIGMA_DIRECTORY_POINTER = 4;
const BYTES_IN_A_SIGMA_DIRECTORY_HEADER = 12;
const BYTES_PER_SIGMA_DIRECTORY_ENTRY = 12;
const BYTES_FROM_SIGMA_DIRECTORY_ENTRY_START_TO_ITS_TYPE = 8;
const BYTES_IN_A_SIGMA_PROPERTY_SECTION_HEADER = 24;
const BYTES_PER_SIGMA_PROPERTY_ENTRY = 8;
const BYTES_FROM_A_SECTION_START_TO_ITS_COUNT = 8;
const BYTES_PER_SIGMA_CHARACTER = 2;
const LONGEST_SIGMA_PROPERTY_IN_BYTES = 64;
const MOST_SECTIONS_A_REAL_SIGMA_RAW_HAS = 64;
const MOST_PROPERTIES_A_REAL_SIGMA_RAW_HAS = 256;

export const startsWithASigmaRawMark = (byteSource) =>
  readTextAt(byteSource, 0, SIGMA_RAW_MARK.length) === SIGMA_RAW_MARK;

function readCaptureTimeFromSigmaProperties(byteSource, sectionStart) {
  if (readTextAt(byteSource, sectionStart, BYTES_IN_A_SIGMA_MARK) !== SIGMA_PROPERTY_SECTION_MARK) return null;

  const propertyCount = readUInt32At(byteSource, sectionStart + BYTES_FROM_A_SECTION_START_TO_ITS_COUNT, true);
  if (propertyCount === null || propertyCount === 0 || propertyCount > MOST_PROPERTIES_A_REAL_SIGMA_RAW_HAS) return null;

  const tableStart = sectionStart + BYTES_IN_A_SIGMA_PROPERTY_SECTION_HEADER;
  const textStart = tableStart + propertyCount * BYTES_PER_SIGMA_PROPERTY_ENTRY;

  for (let propertyIndex = 0; propertyIndex < propertyCount; propertyIndex++) {
    const entryStart = tableStart + propertyIndex * BYTES_PER_SIGMA_PROPERTY_ENTRY;
    const nameOffset = readUInt32At(byteSource, entryStart, true);
    const valueOffset = readUInt32At(byteSource, entryStart + 4, true);
    if (nameOffset === null || valueOffset === null) return null;

    const name = readTwoByteWideTextAt(
      byteSource, textStart + nameOffset * BYTES_PER_SIGMA_CHARACTER, LONGEST_SIGMA_PROPERTY_IN_BYTES,
    );
    if (name !== SIGMA_CAPTURE_TIME_PROPERTY) continue;

    const value = readTwoByteWideTextAt(
      byteSource, textStart + valueOffset * BYTES_PER_SIGMA_CHARACTER, LONGEST_SIGMA_PROPERTY_IN_BYTES,
    );
    const secondsSince1970 = Number(value);
    if (!Number.isFinite(secondsSince1970) || secondsSince1970 <= 0) return null;
    return onlyIfPlausible(cameraClockFromSecondsSince1970(secondsSince1970));
  }
  return null;
}

export function readCameraClockFromSigmaRaw(byteSource) {
  if (!startsWithASigmaRawMark(byteSource)) return null;
  const directoryStart = readUInt32At(byteSource, byteSource.sizeInBytes - BYTES_IN_A_SIGMA_DIRECTORY_POINTER, true);
  if (directoryStart === null || directoryStart <= 0 || directoryStart >= byteSource.sizeInBytes) return null;
  if (readTextAt(byteSource, directoryStart, BYTES_IN_A_SIGMA_MARK) !== SIGMA_DIRECTORY_MARK) return null;

  const sectionCount = readUInt32At(byteSource, directoryStart + BYTES_FROM_A_SECTION_START_TO_ITS_COUNT, true);
  if (sectionCount === null || sectionCount === 0 || sectionCount > MOST_SECTIONS_A_REAL_SIGMA_RAW_HAS) return null;

  for (let sectionIndex = 0; sectionIndex < sectionCount; sectionIndex++) {
    const entryStart = directoryStart + BYTES_IN_A_SIGMA_DIRECTORY_HEADER
      + sectionIndex * BYTES_PER_SIGMA_DIRECTORY_ENTRY;
    const sectionStart = readUInt32At(byteSource, entryStart, true);
    const sectionType = readTextAt(
      byteSource, entryStart + BYTES_FROM_SIGMA_DIRECTORY_ENTRY_START_TO_ITS_TYPE, BYTES_IN_A_SIGMA_MARK,
    );
    if (sectionStart === null || sectionType === null) return null;
    if (sectionType !== SIGMA_PROPERTY_SECTION_TYPE || sectionStart >= byteSource.sizeInBytes) continue;

    const captured = readCaptureTimeFromSigmaProperties(byteSource, sectionStart);
    if (captured !== null) return captured;
  }
  return null;
}
