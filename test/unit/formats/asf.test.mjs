import test from 'node:test';
import assert from 'node:assert/strict';
import { asfFilePropertiesObject, asfObject, asfPaddingObjects, windowsMediaMovieHolding } from '../../fixtures/asf.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';
import { byteSourceForBuffer } from '../../../src/bytes.mjs';
import { readCameraClockFromAsf } from '../../../src/formats/asf.mjs';

const RECORDED = '2026-08-27 10:50:00';
const MOST_OBJECTS_WALKED = 256;
const BYTES_IN_AN_OBJECT_HEADER = 24;

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

test('the last object an ASF header holds', async (context) => {
  const holdingNothingButItsHeader = asfObject(Buffer.alloc(16, 1), Buffer.alloc(0));
  const movie = windowsMediaMovieHolding([holdingNothingButItsHeader]);
  const inMemory = byteSourceForBuffer(movie);
  const positionsRead = [];
  readCameraClockFromAsf({
    sizeInBytes: inMemory.sizeInBytes,
    readInto: (into, position, byteCount) => {
      positionsRead.push(position);
      return inMemory.readInto(into, position, byteCount);
    },
  });
  await context.test('is looked at even when its header takes up all the room left', () => assert.ok(
    positionsRead.includes(movie.length - BYTES_IN_AN_OBJECT_HEADER),
    JSON.stringify(positionsRead),
  ));
});

test('where an ASF creation date may be read from', async (context) => {
  const BYTES_TO_THE_END_OF_THE_CREATION_DATE = 56;
  const propertiesClaiming = (declaredSize, keepingBytes = BYTES_IN_AN_OBJECT_HEADER) => {
    const properties = Buffer.from(asfFilePropertiesObject(RECORDED).subarray(0, keepingBytes));
    properties.writeBigUInt64LE(BigInt(declaredSize), 16);
    return properties;
  };
  const whatFollowsTheirHeader = asfFilePropertiesObject(RECORDED).subarray(BYTES_IN_AN_OBJECT_HEADER);

  await context.test('file properties holding nothing but their header, ending the header object, are not read from what follows it', () => assert.equal(
    readFrom([propertiesClaiming(BYTES_IN_AN_OBJECT_HEADER)], { afterTheHeader: [whatFollowsTheirHeader] }),
    null,
  ));
  await context.test('nor are file properties whose size runs past the end of the header object', () => assert.equal(
    readFrom([propertiesClaiming(104)], { afterTheHeader: [whatFollowsTheirHeader] }),
    null,
  ));
  await context.test('nor file properties too small to hold a creation date, from the object after them', () => assert.equal(
    readFrom([propertiesClaiming(BYTES_IN_AN_OBJECT_HEADER), asfObject(Buffer.alloc(16, 1), whatFollowsTheirHeader.subarray(BYTES_IN_AN_OBJECT_HEADER))]),
    null,
  ));
  // The next object's id begins with the last four bytes of the date, so a read that ran on
  // past the end of the properties would find the whole of it.
  const theRestOfTheDate = asfFilePropertiesObject(RECORDED).subarray(BYTES_TO_THE_END_OF_THE_CREATION_DATE - 4, BYTES_TO_THE_END_OF_THE_CREATION_DATE);
  await context.test('nor file properties that end part way through their creation date', () => assert.equal(
    readFrom([propertiesClaiming(BYTES_TO_THE_END_OF_THE_CREATION_DATE - 4, BYTES_TO_THE_END_OF_THE_CREATION_DATE - 4),
      asfObject(Buffer.concat([theRestOfTheDate, Buffer.alloc(12, 1)]), Buffer.alloc(8))]),
    null,
  ));
  await context.test('but file properties just large enough to hold their creation date are read', () => assert.equal(
    readFrom([propertiesClaiming(BYTES_TO_THE_END_OF_THE_CREATION_DATE, BYTES_TO_THE_END_OF_THE_CREATION_DATE)]),
    RECORDED,
  ));
});
