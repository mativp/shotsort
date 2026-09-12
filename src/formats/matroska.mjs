// Matroska, which is MKV and WebM: a tree of elements, each one a variable-width id, a
// variable-width length, and its content. The recording date sits in the segment's info
// element, counted in nanoseconds from 2001 rather than written out.
import { readBytesAt, readUInt8At } from '../bytes.mjs';
import { cameraClockFromNanosecondsSince2001, onlyIfPlausible } from '../clock.mjs';

const EBML_HEADER_ELEMENT = 0x1a45dfa3;
const SEGMENT_ELEMENT = 0x18538067;
const SEGMENT_INFORMATION_ELEMENT = 0x1549a966;
const RECORDING_DATE_ELEMENT = 0x4461;

const WIDEST_EBML_ID = 4;
const WIDEST_EBML_LENGTH = 8;
const BYTES_IN_A_RECORDING_DATE = 8;
const MOST_ELEMENTS_A_REAL_LEVEL_HAS = 1024;
const HIGHEST_BIT_OF_A_BYTE = 0x80;

// The width of an id or a length is written in the leading zeros of its first byte: the
// first set bit says how many bytes there are. An id keeps that marker bit as part of its
// value, because that is how the specification writes ids down; a length drops it.
function readWidthMarkedNumberAt(byteSource, position, widestAllowed, keepTheMarkerBit) {
  const firstByte = readUInt8At(byteSource, position);
  if (firstByte === null || firstByte === 0) return null;

  let width = 1;
  while (width <= widestAllowed && (firstByte & (HIGHEST_BIT_OF_A_BYTE >> (width - 1))) === 0) width++;
  if (width > widestAllowed) return null;

  const bytes = readBytesAt(byteSource, position, width);
  if (bytes === null) return null;

  let value = keepTheMarkerBit ? firstByte : firstByte & ((HIGHEST_BIT_OF_A_BYTE >> (width - 1)) - 1);
  let everyBitIsSet = value === ((HIGHEST_BIT_OF_A_BYTE >> (width - 1)) - 1);
  for (let byteIndex = 1; byteIndex < width; byteIndex++) {
    value = value * 256 + bytes[byteIndex];
    everyBitIsSet = everyBitIsSet && bytes[byteIndex] === 0xff;
  }
  return { value, width, meansUnknownLength: !keepTheMarkerBit && everyBitIsSet };
}

export const startsWithAnEbmlHeader = (byteSource) =>
  readBytesAt(byteSource, 0, WIDEST_EBML_ID)?.readUInt32BE() === EBML_HEADER_ELEMENT;

function findElement(byteSource, searchStart, searchEnd, wantedId) {
  let elementStart = searchStart;
  for (let elementIndex = 0; elementIndex < MOST_ELEMENTS_A_REAL_LEVEL_HAS; elementIndex++) {
    if (elementStart >= searchEnd) return null;
    const id = readWidthMarkedNumberAt(byteSource, elementStart, WIDEST_EBML_ID, true);
    if (id === null) return null;
    const length = readWidthMarkedNumberAt(byteSource, elementStart + id.width, WIDEST_EBML_LENGTH, false);
    if (length === null) return null;

    const contentStart = elementStart + id.width + length.width;
    const contentEnd = length.meansUnknownLength ? searchEnd : Math.min(contentStart + length.value, searchEnd);
    if (id.value === wantedId) return { contentStart, contentEnd };
    if (contentEnd <= elementStart) return null;
    elementStart = contentEnd;
  }
  return null;
}

export function readCameraClockFromMatroska(byteSource) {
  if (!startsWithAnEbmlHeader(byteSource)) return null;

  const segment = findElement(byteSource, 0, byteSource.sizeInBytes, SEGMENT_ELEMENT);
  if (segment === null) return null;
  const information = findElement(byteSource, segment.contentStart, segment.contentEnd, SEGMENT_INFORMATION_ELEMENT);
  if (information === null) return null;
  const recordingDate = findElement(byteSource, information.contentStart, information.contentEnd, RECORDING_DATE_ELEMENT);
  if (recordingDate === null) return null;

  const nanoseconds = readBytesAt(byteSource, recordingDate.contentStart, BYTES_IN_A_RECORDING_DATE);
  if (nanoseconds === null) return null;
  return onlyIfPlausible(cameraClockFromNanosecondsSince2001(Number(nanoseconds.readBigInt64BE())));
}
