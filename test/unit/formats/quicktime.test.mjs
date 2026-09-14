import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appleMetadataItemList, appleMetadataKey, appleMetadataKeysBox, canonThumbnailBox, movieFile, movieFileWithAppleMetadata,
  quickTimeCreationDateBox,
} from '../../fixtures/quicktime.mjs';
import { jpegMarker } from '../../fixtures/jpeg.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const THE_MOVIE_HEADER_SAYS = '2026-01-01 00:00:00';
const APPLE_SAYS = '2026-08-27T10:30:00+0200';
const WHEN_APPLE_SAYS_IT_WAS_SHOT = '2026-08-27 10:30:00';
const MOST_METADATA_KEYS_READ = 256;
const LONGEST_METADATA_VALUE_READ = 128;

const readWithAppleMetadata = (keys, items, declaredKeyCount) => clockTextInside(movieFileWithAppleMetadata(
  THE_MOVIE_HEADER_SAYS, appleMetadataKeysBox(keys, declaredKeyCount), appleMetadataItemList(items),
));

test('the date Apple writes among its metadata keys', async (context) => {
  await context.test('is found when it is not the first key', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey('com.apple.quicktime.make'), appleMetadataKey()], [[1, 'Apple'], [2, APPLE_SAYS]]),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('and behind a key with no name at all', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey(''), appleMetadataKey()], [[2, APPLE_SAYS]]),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('the keys after it are not read, however broken they are', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey(), appleMetadataKey('broken', { declaredSize: 4 })], [[1, APPLE_SAYS]]),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('nor is a key past the count the keys box declares', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey('com.apple.quicktime.make'), appleMetadataKey()], [[2, APPLE_SAYS]], 1),
    THE_MOVIE_HEADER_SAYS,
  ));
  await context.test('an item numbered zero is never taken for the date, there being no key zero', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey('com.apple.quicktime.make')], [[0, APPLE_SAYS]]),
    THE_MOVIE_HEADER_SAYS,
  ));
  await context.test('a date at the very end of the longest value worth reading is read whole', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey()], [[1, APPLE_SAYS.padStart(LONGEST_METADATA_VALUE_READ)]]),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('a keys box declaring as many keys as are worth reading is read', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey()], [[1, APPLE_SAYS]], MOST_METADATA_KEYS_READ),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('and one declaring a key more is not', () => assert.equal(
    readWithAppleMetadata([appleMetadataKey()], [[1, APPLE_SAYS]], MOST_METADATA_KEYS_READ + 1),
    THE_MOVIE_HEADER_SAYS,
  ));
});

test('the date a camera spells out in the user data', async (context) => {
  const aThumbnailWithNoDate = canonThumbnailBox(Buffer.concat([jpegMarker(0xd8), jpegMarker(0xd9)]));
  await context.test('a Canon thumbnail carrying no date leaves the creation date beside it to be read', () => assert.equal(
    clockTextInside(movieFile(THE_MOVIE_HEADER_SAYS, {
      extraUserData: Buffer.concat([aThumbnailWithNoDate, quickTimeCreationDateBox(APPLE_SAYS)]),
    })),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
  await context.test('a creation date in the last box of the file is read up to the end of the file', () => assert.equal(
    clockTextInside(movieFile(THE_MOVIE_HEADER_SAYS, {
      extraUserData: quickTimeCreationDateBox(APPLE_SAYS), userDataEndsTheFile: true,
    })),
    WHEN_APPLE_SAYS_IT_WAS_SHOT,
  ));
});
