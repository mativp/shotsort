import test from 'node:test';
import assert from 'node:assert/strict';
import {
  heifExifPayload, heifItemInformationBox, heifItemInformationEntry, heifItemLocationBox, heifStillHolding,
} from '../../fixtures/heif.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const SHOT = '2026:08:27 11:50:00';
const WHEN_IT_WAS_SHOT = '2026-08-27 11:50:00';
const exifPayload = heifExifPayload(SHOT);
const MOST_ITEMS_READ = 512;

const theExifEntry = heifItemInformationEntry();
const anImageEntry = heifItemInformationEntry({ id: 2, type: 'hvc1' });
const theExifItemAt = (payloadStart, item = {}) => ({ extents: [{ offset: payloadStart, length: exifPayload.length }], ...item });
const anItemHoldingNothing = (id) => ({ id, extents: [{ offset: 0, length: 0 }] });

const readWith = (entries, itemsAt, { itemInformation = {}, itemLocation = {}, payload = exifPayload } = {}) =>
  clockTextInside(heifStillHolding((payloadStart) => ({
    itemInformation: heifItemInformationBox(entries, itemInformation),
    itemLocation: heifItemLocationBox(itemsAt(payloadStart), itemLocation),
  }), payload));

test('the item entries that say which item of a HEIF still is its Exif', async (context) => {
  await context.test('are read from an item information box of the version counting in four bytes',
    () => assert.equal(readWith([theExifEntry], (at) => [theExifItemAt(at)], { itemInformation: { version: 1 } }), WHEN_IT_WAS_SHOT));
  await context.test('an entry too old to name its type is not taken for the Exif item, whatever its name says',
    () => assert.equal(readWith([heifItemInformationEntry({ version: 1 })], (at) => [theExifItemAt(at)]), null));

  const zerosThenTheExif = Buffer.concat([Buffer.alloc(8), exifPayload]);
  await context.test('the Exif entry is found behind the image\'s own', () => assert.equal(
    readWith([anImageEntry, theExifEntry], (at) => [{ id: 2, extents: [{ offset: at, length: 8 }] }, theExifItemAt(at + 8)], { payload: zerosThenTheExif }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('and in front of it', () => assert.equal(
    readWith([theExifEntry, anImageEntry], (at) => [{ id: 2, extents: [{ offset: at, length: 8 }] }, theExifItemAt(at + 8)], { payload: zerosThenTheExif }),
    WHEN_IT_WAS_SHOT,
  ));

  const decoyThenTheExif = Buffer.concat([heifExifPayload('2026:01:01 00:00:00'), exifPayload]);
  await context.test('a box of another type laid out like an Exif entry is not taken for one', () => assert.equal(
    readWith([heifItemInformationEntry({ id: 2, boxType: 'free' }), theExifEntry], (at) => [
      { id: 2, extents: [{ offset: at, length: exifPayload.length }] }, theExifItemAt(at + exifPayload.length),
    ], { payload: decoyThenTheExif }),
    WHEN_IT_WAS_SHOT,
  ));
});

test('the item locations that say where a HEIF still keeps its Exif', async (context) => {
  await context.test('a payload that skips a few bytes before its TIFF, without the Exif marker, is read past them', () => assert.equal(
    readWith([theExifEntry], (at) => [theExifItemAt(at)], { payload: heifExifPayload(SHOT, { spellsOutTheExifMarker: false, bytesBeforeTheTiff: 6 }) }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('a payload that spells the Exif marker out is read past it, though it says no bytes are skipped', () => assert.equal(
    readWith([theExifEntry], (at) => [theExifItemAt(at)], { payload: heifExifPayload(SHOT, { bytesItSaysToSkip: 0 }) }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('an Exif item said to be stored past the end of the file leaves the still undated',
    () => assert.equal(readWith([theExifEntry], (at) => [theExifItemAt(at + 100000)]), null));
  await context.test('and so does one the item location box does not list',
    () => assert.equal(readWith([theExifEntry], () => [anItemHoldingNothing(2)]), null));
  await context.test('an Exif item past the count the box declares is not read', () => assert.equal(
    readWith([theExifEntry], (at) => [anItemHoldingNothing(2), theExifItemAt(at)], { itemLocation: { declaredItemCount: 1 } }),
    null,
  ));
  await context.test('a box declaring as many items as are worth reading is read', () => assert.equal(
    readWith([theExifEntry], (at) => [...Array.from({ length: MOST_ITEMS_READ - 1 }, () => anItemHoldingNothing(2)), theExifItemAt(at)]),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('and one declaring an item more is not', () => assert.equal(
    readWith([theExifEntry], (at) => [...Array.from({ length: MOST_ITEMS_READ }, () => anItemHoldingNothing(2)), theExifItemAt(at)]),
    null,
  ));
  await context.test('an Exif item built some other way than from a plain file offset is not read',
    () => assert.equal(readWith([theExifEntry], (at) => [theExifItemAt(at, { constructionMethod: 1 })]), null));
  await context.test('an Exif item after one with extents and indexes of its own is read', () => assert.equal(
    readWith([theExifEntry], (at) => [
      { id: 2, extents: [{ offset: 0, length: 0 }, { offset: 0, length: 0 }] }, theExifItemAt(at),
    ], { itemLocation: { indexSize: 4 } }),
    WHEN_IT_WAS_SHOT,
  ));
  await context.test('the offset of an extent counts from the item\'s base offset', () => assert.equal(
    readWith([theExifEntry], (at) => [{ baseOffset: at, extents: [{ offset: 4, length: exifPayload.length }] }], {
      itemLocation: { baseOffsetSize: 4 }, payload: Buffer.concat([Buffer.alloc(4), exifPayload]),
    }),
    WHEN_IT_WAS_SHOT,
  ));

  const fieldsOfAWidthNoBoxMayUse = [
    ['a base offset', { baseOffsetSize: 2 }, (at) => [theExifItemAt(at)]],
    ['an extent length', { lengthSize: 2 }, (at) => [theExifItemAt(at)]],
    ['an extent offset', { offsetSize: 2, baseOffsetSize: 4 }, (at) => [{ baseOffset: at, extents: [{ offset: 0, length: exifPayload.length }] }]],
  ];
  for (const [whichField, widths, itemsAt] of fieldsOfAWidthNoBoxMayUse) {
    await context.test(`${whichField} two bytes wide, which no item location box may use, is refused`,
      () => assert.equal(readWith([theExifEntry], itemsAt, { itemLocation: widths }), null));
  }
});
