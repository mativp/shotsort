import test from 'node:test';
import assert from 'node:assert/strict';
import { asfFilePropertiesObject, asfPaddingObjects, windowsMediaMovieHolding } from '../../fixtures/asf.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const RECORDED = '2026-08-27 10:50:00';
const MOST_OBJECTS_WALKED = 256;

const readFrom = (children, layout) => clockTextInside(windowsMediaMovieHolding(children, layout));

test('the objects an ASF header is walked through', async (context) => {
  await context.test('file properties in the last object walked are still read', () => assert.equal(
    readFrom([...asfPaddingObjects(MOST_OBJECTS_WALKED - 1), asfFilePropertiesObject(RECORDED)]),
    RECORDED,
  ));
  await context.test('and in one an object further are not', () => assert.equal(
    readFrom([...asfPaddingObjects(MOST_OBJECTS_WALKED), asfFilePropertiesObject(RECORDED)]),
    null,
  ));
  await context.test('an object holding nothing but its own header is stepped over',
    () => assert.equal(readFrom([...asfPaddingObjects(1, 0), asfFilePropertiesObject(RECORDED)]), RECORDED));

  // Stepping twelve bytes lands on a second header, overlapping the first, whose size in
  // turn steps exactly onto the file properties.
  const claimingLessThanItsHeader = Buffer.alloc(36);
  claimingLessThanItsHeader.writeBigUInt64LE(12n, 16);
  claimingLessThanItsHeader.writeBigUInt64LE(24n, 28);
  await context.test('an object claiming less than its own header is refused, though stepping over it would lead to the date',
    () => assert.equal(readFrom([claimingLessThanItsHeader, asfFilePropertiesObject(RECORDED)]), null));
  await context.test('file properties after the header object are not looked for',
    () => assert.equal(readFrom([], { afterTheHeader: [asfFilePropertiesObject(RECORDED)] }), null));
});
