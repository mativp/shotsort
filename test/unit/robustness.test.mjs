import test from 'node:test';
import assert from 'node:assert/strict';
import { movieFileWhoseBoxIsSmallerThanItsOwnHeader } from '../fixtures/quicktime.mjs';
import { canonCiffRawFile } from '../fixtures/canon.mjs';
import {
  aviFileBuriedUnderMoreChunksThanAreWalked, aviFileNestingItsListsDeeperThanACameraDoes,
  aviFileRecordingWhenItWasShot,
} from '../fixtures/riff.mjs';
import { pngStill, pngStillBuriedUnderMoreChunksThanAreWalked } from '../fixtures/png.mjs';
import { matroskaMovieWhoseIdIsWiderThanAnyIdMayBe } from '../fixtures/matroska.mjs';
import { windowsMediaMovie, windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked } from '../fixtures/asf.mjs';
import { redcodeClipBuriedUnderMoreRecordsThanAreWalked } from '../fixtures/redcode.mjs';
import {
  A_CLOCK_THE_READER_MUST_PASS_OVER, THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS, everyFixtureFormatIsBuiltFrom,
} from '../fixtures/catalogue.mjs';
import { formatCameraClock } from '../../src/clock.mjs';
import { clockInside } from '../support/inMemory.mjs';

// A container is a tree, and a tree read out of bytes that went bad can point at itself.
// Every walk in here therefore stops at a depth no real file reaches, and these are the
// files that reach it: each one would be read forever, or read something that is not there,
// if the ceiling were taken out.
test('the shapes a walk must not be led round forever by', async (context) => {
  const dateWrittenOut = 'Thu Mar 04 05:06:07 2021';
  await context.test('a RIFF nesting its lists deeper than a camera nests them is given up on',
    () => assert.equal(clockInside(aviFileNestingItsListsDeeperThanACameraDoes(dateWrittenOut)), null));
  await context.test('while one nested the way a camcorder writes it is still read', () => assert.equal(
    formatCameraClock(clockInside(aviFileRecordingWhenItWasShot(dateWrittenOut)).clock),
    '2021-03-04 05:06:07',
  ));

  await context.test('a CIFF heap buried deeper than a camera buries one is given up on', () => assert.equal(
    clockInside(canonCiffRawFile('2021-03-04 05:06:07', { heapsTheCaptureTimeIsBuriedUnder: 10 })),
    null,
  ));
  await context.test('while the depth a camera does bury it at is still read', () => assert.equal(
    formatCameraClock(clockInside(canonCiffRawFile('2021-03-04 05:06:07')).clock),
    '2021-03-04 05:06:07',
  ));

  await context.test('an element claiming an id wider than any id may be is refused',
    () => assert.equal(clockInside(matroskaMovieWhoseIdIsWiderThanAnyIdMayBe()), null));
  await context.test('a box declaring itself smaller than the header it is written in is refused',
    () => assert.equal(clockInside(movieFileWhoseBoxIsSmallerThanItsOwnHeader()), null));
});

// The walks that run along a level rather than down one stop after more items than a real
// file carries, for the same reason: a length read out of a corrupted byte can point at
// the chunk it came from, and a walk that trusted it would never come back.
test('the files carrying more than a walk looks through', async (context) => {
  await context.test('a PNG burying its Exif under more chunks than are walked is given up on',
    () => assert.equal(clockInside(pngStillBuriedUnderMoreChunksThanAreWalked('2021:03:04 05:06:07')), null));
  await context.test('while one carrying the chunks a photo really has is read',
    () => assert.equal(formatCameraClock(clockInside(pngStill('2021:03:04 05:06:07')).clock), '2021-03-04 05:06:07'));

  await context.test('a WMV burying its file properties under more objects than are walked is given up on',
    () => assert.equal(clockInside(windowsMediaMovieBuriedUnderMoreObjectsThanAreWalked('2021-03-04 05:06:07')), null));
  await context.test('while one written the way a camcorder writes it is read', () => assert.equal(
    formatCameraClock(clockInside(windowsMediaMovie('2021-03-04 05:06:07')).clock),
    '2021-03-04 05:06:07',
  ));

  await context.test('an AVI burying its date under more chunks than are walked is given up on',
    () => assert.equal(clockInside(aviFileBuriedUnderMoreChunksThanAreWalked('Thu Mar 04 05:06:07 2021')), null));
  await context.test('and a Redcode directory holding more records than are walked is too',
    () => assert.equal(clockInside(redcodeClipBuriedUnderMoreRecordsThanAreWalked('2021-03-04 05:06:07')), null));
});

// A card pulled out mid-write, a copy that stopped half way, a file whose end never made it
// off the buffer: the reader meets all three, and a format reader walking a length field it
// has not got the bytes for is where a parser throws. So every fixture is cut short at
// every byte and read again. The point is not only that nothing throws -- it is that a
// half-written file is read as less than the whole and never as a different shot.
const LONGEST_FIXTURE_CUT_AT_EVERY_BYTE = 16 * 1024;

// One fixture carries more segments than any photo does, purely to prove the walk stops;
// cutting it at every byte re-walks all of them and buys nothing, so it is stepped through
// on a prime stride, which no structure in it is aligned to.
const BYTES_STEPPED_OVER_IN_A_LONGER_FIXTURE = 13;

const toTheMinute = (moment) => moment.slice(0, 'YYYY-MM-DD HH:MM'.length);

const MOMENTS_A_CUT_FIXTURE_MAY_STILL_HOLD = new Set(
  [THE_ONE_MOMENT_EVERY_FIXTURE_HOLDS, A_CLOCK_THE_READER_MUST_PASS_OVER].map(toTheMinute),
);

function everyCutOf(bytes) {
  const step = bytes.length > LONGEST_FIXTURE_CUT_AT_EVERY_BYTE ? BYTES_STEPPED_OVER_IN_A_LONGER_FIXTURE : 1;
  const cuts = [];
  for (let cut = 0; cut <= bytes.length; cut += step) cuts.push(cut);
  return cuts;
}

test('a file that stops half way is read as less than the whole', async (context) => {
  const readWrongly = [];
  const threw = [];

  for (const { fileName, bytes } of everyFixtureFormatIsBuiltFrom()) {
    for (const cut of everyCutOf(bytes)) {
      let found;
      try {
        found = clockInside(bytes.subarray(0, cut));
      } catch (whatTheReaderThrew) {
        threw.push(`${fileName} cut to ${cut} bytes: ${whatTheReaderThrew.message}`);
        break;
      }
      if (found === null) continue;
      const moment = formatCameraClock(found.clock);
      if (!MOMENTS_A_CUT_FIXTURE_MAY_STILL_HOLD.has(toTheMinute(moment))) {
        readWrongly.push(`${fileName} cut to ${cut} bytes read ${moment}`);
      }
    }
  }

  await context.test('no format reader throws on a file that stops half way, at any byte of any fixture',
    () => assert.deepEqual(threw, []));
  await context.test('and a cut file reads as nothing or as the moment it holds, never as a different shot',
    () => assert.deepEqual(readWrongly, []));
});

// The other half of the same worry: a card that went bad writes rubbish rather than
// stopping. A length or a count read out of a corrupted byte is what sends a walk past the
// end of the file or round forever, so every byte of every fixture is made to read 0x00 and
// then 0xff -- the two that turn a field into nothing and into far more than the file holds.
const BYTES_A_BAD_CARD_WRITES = [0x00, 0xff];

test('a file gone bad is read without the reader giving up', async (context) => {
  const threw = [];

  for (const { fileName, bytes } of everyFixtureFormatIsBuiltFrom()) {
    for (const position of everyCutOf(bytes)) {
      if (position === bytes.length) continue;
      for (const rubbish of BYTES_A_BAD_CARD_WRITES) {
        const corrupted = Buffer.from(bytes);
        corrupted[position] = rubbish;
        try {
          clockInside(corrupted);
        } catch (whatTheReaderThrew) {
          threw.push(`${fileName} byte ${position} set to ${rubbish}: ${whatTheReaderThrew.message}`);
        }
      }
    }
  }

  await context.test('no format reader throws on a file gone bad, whichever byte of whichever fixture went',
    () => assert.deepEqual(threw, []));
});
