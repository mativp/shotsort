import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY, redcodeClipHolding, redcodeFillerRecords, redcodeRecord,
  redcodeRunOfDigits, redcodeTimecodeRecord, redcodeWhenItWasShotRecord,
} from '../../fixtures/redcode.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const SHOT = '2026-08-27 11:30:00';
const THE_DECOY_SAYS = '2026-01-01 00:00:00';
const MOST_RECORDS_WALKED = 256;

const theDirectory = [redcodeTimecodeRecord(), redcodeWhenItWasShotRecord(SHOT)];
const aDecoyDirectory = Buffer.concat([redcodeTimecodeRecord(), redcodeWhenItWasShotRecord(THE_DECOY_SAYS)]);
const readFrom = (records, layout) => clockTextInside(redcodeClipHolding(records, layout));

test('the directory the header of a Redcode clip counts its way to', async (context) => {
  // A decoy directory stands where the search for one would find it first, so only
  // counting to the real one reads the time the take was shot.
  const oneOfEachRecord = [1, 1, 1];
  const bytesOfOneOfEach = 24 + 20 + 16;
  const decoyAmongTheRecords = Buffer.concat([aDecoyDirectory, Buffer.alloc(bytesOfOneOfEach - aDecoyDirectory.length)]);
  await context.test('is trusted over a directory a search would find first, once it is counted past the image, audio and extra records', () => assert.equal(
    readFrom(theDirectory, { recordCountsInTheHeader: oneOfEachRecord, bytesBeforeTheDirectory: decoyAmongTheRecords }),
    SHOT,
  ));
  await context.test('and so is the first version\'s, a fixed distance into the block after the header', () => assert.equal(
    readFrom(theDirectory, { version: '1', bytesBeforeTheDirectory: aDecoyDirectory }),
    SHOT,
  ));
  const countedTo = (records, layout) => readFrom(records, {
    recordCountsInTheHeader: oneOfEachRecord, bytesBeforeTheDirectory: decoyAmongTheRecords, padToALengthWorthTrusting: false, ...layout,
  });
  const aDirectoryOfLength = (bytes) => [redcodeWhenItWasShotRecord(SHOT), redcodeRecord(0x1019, Buffer.alloc(bytes - 19 - 4))];
  await context.test('a directory counted to that is too short to trust is passed over for the one the search finds',
    () => assert.equal(countedTo([redcodeWhenItWasShotRecord(SHOT)]), THE_DECOY_SAYS));
  await context.test('as is one as long as the longest worth trusting', () => assert.equal(countedTo(aDirectoryOfLength(2048)), THE_DECOY_SAYS));
  await context.test('but one a byte shorter is trusted', () => assert.equal(countedTo(aDirectoryOfLength(2047)), SHOT));
  await context.test('a directory counted to that ends exactly where the file does is trusted', () => assert.equal(countedTo(aDirectoryOfLength(300)), SHOT));
  await context.test('and one claiming to run a byte past it is not',
    () => assert.equal(countedTo(aDirectoryOfLength(300), { declaredDirectoryLength: 301 }), THE_DECOY_SAYS));
  const digitsOf = (cameraClock) => Buffer.from(redcodeRunOfDigits(cameraClock), 'latin1');
  const endingTheDirectory = (dateRecordBytes) => [
    redcodeRecord(0x1019, Buffer.alloc(300 - dateRecordBytes - 4)),
  ];
  const aDateRecordWithNoTerminator = redcodeRecord(0x1005, digitsOf(SHOT));
  await context.test('a date record whose digits end exactly where the counted directory does is read whole', () => assert.equal(
    countedTo([...endingTheDirectory(aDateRecordWithNoTerminator.length), aDateRecordWithNoTerminator]),
    SHOT,
  ));
  await context.test('and one whose header ends the counted directory is not read from the digits past its end', () => assert.equal(
    countedTo([...endingTheDirectory(4), aDateRecordWithNoTerminator.subarray(0, 4)], {
      declaredDirectoryLength: 300, recordsAfterTheDirectory: [aDateRecordWithNoTerminator.subarray(4)],
    }),
    THE_DECOY_SAYS,
  ));
  await context.test('a date record just past the end of the directory counted to is not taken from it', () => assert.equal(
    readFrom([redcodeTimecodeRecord()], {
      recordCountsInTheHeader: oneOfEachRecord, bytesBeforeTheDirectory: decoyAmongTheRecords,
      recordsAfterTheDirectory: [redcodeWhenItWasShotRecord(SHOT)],
    }),
    THE_DECOY_SAYS,
  ));
});

test('the directory a Redcode clip has to be searched for', async (context) => {
  const untrustworthy = { padToALengthWorthTrusting: false };
  await context.test('is searched for from the block after the header in the first version',
    () => assert.equal(readFrom(theDirectory, { version: '1', ...untrustworthy }), SHOT));
  await context.test('and found when it starts the very first byte searched', () => assert.equal(
    readFrom(theDirectory, { version: '1', ...untrustworthy, blockSize: 68 + BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY + 2 }),
    SHOT,
  ));

  // The byte before the second block and the bytes that start it read as a date record,
  // so a search that went a byte too far back would find one.
  const aDateRecordStraddlingTheBlocks = Buffer.concat([
    Buffer.from([0x13, 0x10, 0x05]), Buffer.from(`${redcodeRunOfDigits(SHOT)}\0`, 'latin1'),
  ]);
  await context.test('a clip with no directory to be found is left undated, however its bytes fall', () => assert.equal(
    readFrom([], {
      version: '1', ...untrustworthy,
      bytesBeforeTheDirectory: Buffer.concat([aDateRecordStraddlingTheBlocks, Buffer.alloc(BYTES_FROM_A_FIRST_VERSION_SECOND_BLOCK_TO_ITS_DIRECTORY - aDateRecordStraddlingTheBlocks.length)]),
    }),
    null,
  ));
  await context.test('a first version block claiming to be shorter than any block is refused',
    () => assert.equal(readFrom(theDirectory, { version: '1', ...untrustworthy, blockSize: 7 }), null));
  await context.test('and one exactly as short as a block may be is read',
    () => assert.equal(readFrom(theDirectory, { version: '1', ...untrustworthy, blockSize: 8 }), SHOT));
});

test('the records a Redcode directory is walked through', async (context) => {
  const untrustworthy = { padToALengthWorthTrusting: false };
  await context.test('a date in the last record walked is still read', () => assert.equal(
    readFrom([redcodeTimecodeRecord(), ...redcodeFillerRecords(MOST_RECORDS_WALKED - 2), redcodeWhenItWasShotRecord(SHOT)], untrustworthy),
    SHOT,
  ));
  await context.test('and one a record further is not', () => assert.equal(
    readFrom([redcodeTimecodeRecord(), ...redcodeFillerRecords(MOST_RECORDS_WALKED - 1), redcodeWhenItWasShotRecord(SHOT)], untrustworthy),
    null,
  ));
  await context.test('an empty record before the date is stepped over', () => assert.equal(
    readFrom([redcodeTimecodeRecord(), redcodeRecord(0x1019, Buffer.alloc(0)), redcodeWhenItWasShotRecord(SHOT)], untrustworthy),
    SHOT,
  ));
  await context.test('digits in a record other than the one saying when it was shot are not taken for it', () => assert.equal(
    readFrom([redcodeTimecodeRecord(), redcodeRecord(0x1006, Buffer.from(`${redcodeRunOfDigits(THE_DECOY_SAYS)}\0`, 'latin1')), redcodeWhenItWasShotRecord(SHOT)], untrustworthy),
    SHOT,
  ));

  // Stepping two bytes lands on a record whose length is this one's number, and whose number
  // says it holds when the take was shot.
  const claimingLessThanItsHeader = Buffer.concat([
    Buffer.from([0x00, 0x02, 0x00, 0x17, 0x10, 0x05]), Buffer.from(`${redcodeRunOfDigits(SHOT)}\0\0\0\0\0\0`, 'latin1'),
  ]);
  await context.test('a record claiming less than its own header is refused, though stepping over it would lead to the date',
    () => assert.equal(readFrom([redcodeTimecodeRecord(), claimingLessThanItsHeader], untrustworthy), null));
});
