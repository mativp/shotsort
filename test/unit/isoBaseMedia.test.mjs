import test from 'node:test';
import assert from 'node:assert/strict';
import { byteSourceForBuffer } from '../../src/bytes.mjs';
import { findIsoBox } from '../../src/formats/isoBaseMedia.mjs';
import { isoBox, isoBoxWith64BitSize } from '../fixtures/isoBaseMedia.mjs';

const wantedIn = (bytes, searchEnd = bytes.length) => findIsoBox(byteSourceForBuffer(bytes), 0, searchEnd, 'want');

test('finding a box among its siblings', async (context) => {
  const emptyBoxLast = Buffer.concat([isoBox('skip', Buffer.alloc(8)), isoBox('want', Buffer.alloc(0))]);
  await context.test('an empty box that ends the range searched is still found',
    () => assert.deepEqual(wantedIn(emptyBoxLast), { contentStart: 24, contentEnd: 24 }));

  const wantedJustPastTheRange = Buffer.concat([isoBox('skip', Buffer.alloc(8)), isoBox('want', Buffer.alloc(8))]);
  await context.test('a box just past the end of the range searched is not found',
    () => assert.equal(wantedIn(wantedJustPastTheRange, 16), null));

  const behindABoxWithA64BitSize = Buffer.concat([isoBoxWith64BitSize('mdat', Buffer.alloc(20)), isoBox('want', Buffer.alloc(4))]);
  await context.test('a box whose size is written in 64 bits is stepped over by that size',
    () => assert.deepEqual(wantedIn(behindABoxWithA64BitSize), { contentStart: 44, contentEnd: 48 }));

  const claimingPastTheRange = isoBox('want', Buffer.alloc(92));
  await context.test('a box claiming to run past the range searched ends where the range does',
    () => assert.deepEqual(wantedIn(claimingPastTheRange, 32), { contentStart: 8, contentEnd: 32 }));

  const smallerThanItsHeaderWithABoxInsideIt = Buffer.concat([
    Buffer.from([0, 0, 0, 4]), isoBox('want', Buffer.alloc(8)),
  ]);
  await context.test('a box smaller than its own header is refused, though stepping over it would land on a box',
    () => assert.equal(wantedIn(smallerThanItsHeaderWithABoxInsideIt), null));
});
