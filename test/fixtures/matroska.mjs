import { secondsSince1970For } from './moments.mjs';

const EBML_HEADER_ELEMENT = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const MATROSKA_SEGMENT_ELEMENT = Buffer.from([0x18, 0x53, 0x80, 0x67]);
const MATROSKA_SEGMENT_INFORMATION_ELEMENT = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
const MATROSKA_RECORDING_DATE_ELEMENT = Buffer.from([0x44, 0x61]);
const MATROSKA_DOCUMENT_TYPE_ELEMENT = Buffer.from([0x42, 0x82]);
const MATROSKA_TIMECODE_SCALE_ELEMENT = Buffer.from([0x2a, 0xd7, 0xb1]);
export const MATROSKA_VOID_ELEMENT = Buffer.from([0xec]);
const NANOSECONDS_PER_SECOND = 1000000000;
const SECONDS_BETWEEN_1970_AND_2001 = 978307200;
const BITS_OF_A_LENGTH_IN_EACH_BYTE = 7;

// An element's length is written with a leading bit saying how many bytes it takes, and a
// length with every other bit set means the length is not known.
export function ebmlElement(elementId, body, { lengthWidth = 8, lengthIsUnknown = false } = {}) {
  const valueBits = BigInt(BITS_OF_A_LENGTH_IN_EACH_BYTE * lengthWidth);
  const lengthValue = lengthIsUnknown ? (1n << valueBits) - 1n : BigInt(body.length);
  const length = Buffer.alloc(lengthWidth);
  let remaining = lengthValue;
  for (let byteIndex = lengthWidth - 1; byteIndex >= 0; byteIndex--) {
    length[byteIndex] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  length[0] |= 0x80 >> (lengthWidth - 1);
  return Buffer.concat([elementId, length, body]);
}

export function matroskaRecordingDateElement(cameraClock, layout) {
  const nanoseconds = Buffer.alloc(8);
  nanoseconds.writeBigInt64BE(
    BigInt(secondsSince1970For(cameraClock) - SECONDS_BETWEEN_1970_AND_2001) * BigInt(NANOSECONDS_PER_SECOND),
  );
  return ebmlElement(MATROSKA_RECORDING_DATE_ELEMENT, nanoseconds, layout);
}

export function matroskaMovieHolding(informationChildren, {
  lengthWidth = 8, segmentLengthIsUnknown = false, beforeTheInformation = [], afterTheInformation = [],
} = {}) {
  return Buffer.concat([
    ebmlElement(EBML_HEADER_ELEMENT,
      ebmlElement(MATROSKA_DOCUMENT_TYPE_ELEMENT, Buffer.from('matroska', 'latin1'), { lengthWidth }), { lengthWidth }),
    ebmlElement(MATROSKA_SEGMENT_ELEMENT, Buffer.concat([
      ...beforeTheInformation,
      ebmlElement(MATROSKA_SEGMENT_INFORMATION_ELEMENT, Buffer.concat(informationChildren), { lengthWidth }),
      ...afterTheInformation,
    ]), { lengthWidth, lengthIsUnknown: segmentLengthIsUnknown }),
  ]);
}

export const matroskaMovie = (cameraClock, { lengthWidth } = {}) => matroskaMovieHolding([
  ebmlElement(MATROSKA_TIMECODE_SCALE_ELEMENT, Buffer.alloc(3), { lengthWidth }),
  matroskaRecordingDateElement(cameraClock, { lengthWidth }),
], { lengthWidth });

const EBML_HEADER_ELEMENT_BYTES = [0x1a, 0x45, 0xdf, 0xa3];
const EBML_LENGTH_OF_NOTHING = 0x80;
// The width of an id is written in the leading zeros of its first byte, so a byte with
// four of them claims an id five bytes wide -- wider than any id is allowed to be.
const AN_ID_CLAIMING_TO_BE_WIDER_THAN_ANY_ID_MAY_BE = 0x08;

export function matroskaMovieWhoseIdIsWiderThanAnyIdMayBe() {
  return Buffer.from([
    ...EBML_HEADER_ELEMENT_BYTES, EBML_LENGTH_OF_NOTHING,
    AN_ID_CLAIMING_TO_BE_WIDER_THAN_ANY_ID_MAY_BE, 0, 0, 0, 0, 0, 0, 0,
  ]);
}
