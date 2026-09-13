import test from 'node:test';
import assert from 'node:assert/strict';
import {
  digitalVideoClipHolding, dvPack, dvRecordingDatePack, dvRecordingDatePackOfBytes, dvRecordingTimePack,
  dvRecordingTimePackOfBytes,
} from '../../fixtures/digitalVideo.mjs';
import { clockTextInside } from '../../support/inMemory.mjs';

const RECORDED = '2026-08-27 11:10:00';
const A_VIDEO_BLOCK = 0x90;
const BLOCKS_THAT_CARRY_PACKS = 6;
const PACKS_IN_A_BLOCK = 15;
const aPackOfAnotherKindThatWouldReadAsMidnight = dvPack(0x61, [0, 0, 0, 0]);

const clipWithPacks = (packs, layout) => clockTextInside(digitalVideoClipHolding([{ packs }], layout));
const withTheDateAnd = (timePack) => clipWithPacks([dvRecordingDatePack(RECORDED), timePack]);
const withTheTimeAnd = (datePack) => clipWithPacks([datePack, dvRecordingTimePack(RECORDED)]);

test('the mark a DV clip starts with', async (context) => {
  await context.test('a file whose first byte is not the one a DV block starts with is not read as DV', () => assert.equal(
    clipWithPacks([dvRecordingDatePack(RECORDED), dvRecordingTimePack(RECORDED)], { mark: Buffer.from([0x00, 0x07, 0x00, 0x3f]) }),
    null,
  ));
});

test('the digits a DV clip writes its date and time in', async (context) => {
  await context.test('every nine is read as the nine it is',
    () => assert.equal(clipWithPacks([dvRecordingDatePack('1999-09-19 19:59:59'), dvRecordingTimePack('1999-09-19 19:59:59')]), '1999-09-19 19:59:59'));
  await context.test('a year written as 89 is this century', () => assert.equal(withTheTimeAnd(dvRecordingDatePackOfBytes(0x27, 0x08, 0x89)), '2089-08-27 11:10:00'));

  const aDigitThatIsNotDecimal = [
    ['the tens of the year', dvRecordingDatePackOfBytes(0x27, 0x08, 0xa6), 'date'],
    ['the month', dvRecordingDatePackOfBytes(0x27, 0x0a, 0x26), 'date'],
    ['the day', dvRecordingDatePackOfBytes(0x1a, 0x08, 0x26), 'date'],
    ['the hour', dvRecordingTimePackOfBytes(0x00, 0x10, 0x1a), 'time'],
    ['the minute', dvRecordingTimePackOfBytes(0x00, 0x3a, 0x11), 'time'],
    ['the second', dvRecordingTimePackOfBytes(0x3a, 0x10, 0x11), 'time'],
  ];
  for (const [whichDigit, pack, whichPack] of aDigitThatIsNotDecimal) {
    await context.test(`a digit above nine in ${whichDigit} leaves the clip undated`,
      () => assert.equal(whichPack === 'date' ? withTheTimeAnd(pack) : withTheDateAnd(pack), null));
  }
});

test('the blocks and packs a DV clip is walked through', async (context) => {
  const auxiliaryBlockAt = (blockIndex) => clockTextInside(digitalVideoClipHolding([
    ...Array.from({ length: blockIndex - 1 }, () => ({ kind: A_VIDEO_BLOCK })),
    { packs: [dvRecordingDatePack(RECORDED), dvRecordingTimePack(RECORDED)] },
  ]));
  await context.test('packs in the last block that carries them are read', () => assert.equal(auxiliaryBlockAt(BLOCKS_THAT_CARRY_PACKS - 1), RECORDED));
  await context.test('and in a block further on are not', () => assert.equal(auxiliaryBlockAt(BLOCKS_THAT_CARRY_PACKS), null));
  await context.test('a date and time in a block that is not auxiliary are not read', () => assert.equal(
    clockTextInside(digitalVideoClipHolding([{ kind: A_VIDEO_BLOCK, packs: [dvRecordingDatePack(RECORDED), dvRecordingTimePack(RECORDED)] }])),
    null,
  ));

  const timePackAt = (packIndex) => clipWithPacks([
    dvRecordingDatePack(RECORDED),
    ...Array.from({ length: packIndex - 1 }, () => aPackOfAnotherKindThatWouldReadAsMidnight),
    dvRecordingTimePack(RECORDED),
  ]);
  await context.test('packs of another kind between the date and the time are stepped over', () => assert.equal(timePackAt(2), RECORDED));
  await context.test('a time in the last pack of a block is read', () => assert.equal(timePackAt(PACKS_IN_A_BLOCK - 1), RECORDED));
  await context.test('and one written past the packs a block holds is not', () => assert.equal(timePackAt(PACKS_IN_A_BLOCK), null));
});
