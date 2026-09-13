import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATROSKA_VOID_ELEMENT, ebmlElement, matroskaMovie, matroskaMovieHolding, matroskaRecordingDateElement,
} from '../../fixtures/matroska.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const RECORDED = '2026-08-27 11:00:00';
const MOST_ELEMENTS_WALKED_ON_A_LEVEL = 1024;
const LONGEST_ONE_BYTE_LENGTH = 127;
const LONGEST_TWO_BYTE_LENGTH = 16383;

const voidElement = (bytes, layout) => ebmlElement(MATROSKA_VOID_ELEMENT, Buffer.alloc(bytes), layout);

test('the lengths a Matroska element is written with', async (context) => {
  await context.test('a movie whose elements carry one-byte lengths, as most do, is read',
    () => assert.equal(clockTextInside(matroskaMovie(RECORDED, { lengthWidth: 1 })), RECORDED));
  await context.test('a segment of unknown length, as a recording written live leaves one, runs to the end of the file', () => assert.equal(
    clockTextInside(matroskaMovieHolding([matroskaRecordingDateElement(RECORDED, { lengthWidth: 1 })], {
      lengthWidth: 1, segmentLengthIsUnknown: true, beforeTheInformation: [voidElement(LONGEST_ONE_BYTE_LENGTH + 1, { lengthWidth: 2 })],
    })),
    RECORDED,
  ));
  await context.test('and so does one whose unknown length takes two bytes to say so', () => assert.equal(
    clockTextInside(matroskaMovieHolding([matroskaRecordingDateElement(RECORDED, { lengthWidth: 2 })], {
      lengthWidth: 2, segmentLengthIsUnknown: true, beforeTheInformation: [voidElement(LONGEST_TWO_BYTE_LENGTH + 1, { lengthWidth: 4 })],
    })),
    RECORDED,
  ));
});

test('the elements a Matroska level is walked through', async (context) => {
  const withBeforeTheDate = (elements) => clockTextInside(matroskaMovieHolding([...elements, matroskaRecordingDateElement(RECORDED)]));

  await context.test('a date in the last element walked is still read', () => assert.equal(
    withBeforeTheDate(Array.from({ length: MOST_ELEMENTS_WALKED_ON_A_LEVEL - 1 }, () => voidElement(0))),
    RECORDED,
  ));
  await context.test('and one an element further is not', () => assert.equal(
    withBeforeTheDate(Array.from({ length: MOST_ELEMENTS_WALKED_ON_A_LEVEL }, () => voidElement(0))),
    null,
  ));

  // A first byte with four leading zeros claims an id five bytes wide. Each of these is laid
  // out so that reading it as four bytes, or as the five it claims, steps onto the date.
  const anIdTooWideReadAsFourBytes = Buffer.from([0x08, 0, 0, 0, 0x80]);
  const anIdTooWideReadAsFiveBytes = Buffer.from([0x08, 0, 0, 0, 0, 0x80]);
  await context.test('an element whose id claims more bytes than any id may have is refused, though the date follows it', () => assert.deepEqual(
    [withBeforeTheDate([anIdTooWideReadAsFourBytes]), withBeforeTheDate([anIdTooWideReadAsFiveBytes])],
    [null, null],
  ));
  await context.test('and so is one whose id begins with a byte of nothing but zeros',
    () => assert.equal(withBeforeTheDate([Buffer.from([0x00, 0x80])]), null));

  await context.test('a recording date after the segment information rather than inside it is not read', () => assert.equal(
    clockTextInside(matroskaMovieHolding([], { afterTheInformation: [matroskaRecordingDateElement(RECORDED)] })),
    null,
  ));
});
