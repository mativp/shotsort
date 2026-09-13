import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BYTES_IN_A_LONG_FIELD, BYTES_IN_A_SHORT_FIELD, byteSourceForBuffer, readTwoByteWideTextAt,
  readUInt64EitherWayRoundAt, readUnsignedOfWidthAt,
} from '../../src/bytes.mjs';

test('the byte readers hand back nothing rather than guessing', async (context) => {
  const eightBytes = byteSourceForBuffer(Buffer.from([0, 0, 1, 0, 0, 0, 0, 2]));

  await context.test('a field of no width at all counts as zero',
    () => assert.equal(readUnsignedOfWidthAt(eightBytes, 0, 0), 0));
  await context.test('a four byte field is read big endian',
    () => assert.equal(readUnsignedOfWidthAt(eightBytes, 0, BYTES_IN_A_SHORT_FIELD), 256));
  await context.test('an eight byte field is read big endian too',
    () => assert.equal(readUnsignedOfWidthAt(eightBytes, 0, BYTES_IN_A_LONG_FIELD), 0x0000010000000002));
  await context.test('a field of a width no format writes is refused rather than half read',
    () => assert.equal(readUnsignedOfWidthAt(eightBytes, 0, 3), null));
  await context.test('an eight byte field the file is too short for is refused',
    () => assert.equal(readUnsignedOfWidthAt(byteSourceForBuffer(Buffer.alloc(4)), 0, BYTES_IN_A_LONG_FIELD), null));

  await context.test('an eight byte count may be read little endian, which is how BigTIFF writes one', () => assert.equal(
    readUInt64EitherWayRoundAt(byteSourceForBuffer(Buffer.from([2, 0, 0, 0, 0, 0, 0, 0])), 0, true),
    2,
  ));
  await context.test('two byte wide text past the end of the file is nothing, not an empty string',
    () => assert.equal(readTwoByteWideTextAt(byteSourceForBuffer(Buffer.alloc(4)), 8, 4), null));
});
