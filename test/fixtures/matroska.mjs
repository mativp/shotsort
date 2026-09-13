import { secondsSince1970For } from './moments.mjs';

const EBML_HEADER_ELEMENT = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const MATROSKA_SEGMENT_ELEMENT = Buffer.from([0x18, 0x53, 0x80, 0x67]);
const MATROSKA_SEGMENT_INFORMATION_ELEMENT = Buffer.from([0x15, 0x49, 0xa9, 0x66]);
const MATROSKA_RECORDING_DATE_ELEMENT = Buffer.from([0x44, 0x61]);
const MATROSKA_DOCUMENT_TYPE_ELEMENT = Buffer.from([0x42, 0x82]);
const NANOSECONDS_PER_SECOND = 1000000000;
const SECONDS_BETWEEN_1970_AND_2001 = 978307200;

// An element's length is written with a leading bit saying how many bytes it takes. Eight
// bytes is always enough and is what is used here, so the marker is the top bit alone.
function ebmlElement(elementId, body) {
  const length = Buffer.alloc(8);
  length.writeBigUInt64BE(BigInt(body.length));
  length[0] |= 0x01;
  return Buffer.concat([elementId, length, body]);
}

export function matroskaMovie(cameraClock) {
  const nanoseconds = Buffer.alloc(8);
  nanoseconds.writeBigInt64BE(
    BigInt(secondsSince1970For(cameraClock) - SECONDS_BETWEEN_1970_AND_2001) * BigInt(NANOSECONDS_PER_SECOND),
  );
  return Buffer.concat([
    ebmlElement(EBML_HEADER_ELEMENT, ebmlElement(MATROSKA_DOCUMENT_TYPE_ELEMENT, Buffer.from('matroska', 'latin1'))),
    ebmlElement(MATROSKA_SEGMENT_ELEMENT, ebmlElement(MATROSKA_SEGMENT_INFORMATION_ELEMENT, Buffer.concat([
      ebmlElement(Buffer.from([0x2a, 0xd7, 0xb1]), Buffer.alloc(3)),
      ebmlElement(MATROSKA_RECORDING_DATE_ELEMENT, nanoseconds),
    ]))),
  ]);
}

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
