// DV, off a tape camcorder. The file is a run of fixed-size blocks; five of the first six
// carry auxiliary packs, and two of those packs hold the recording date and the recording
// time, each written as binary-coded decimal -- one nibble per digit -- with the top bits
// of some bytes used for something else entirely and masked off here.
import { readBytesAt, readUInt8At } from '../bytes.mjs';
import { cameraClockFrom, onlyIfPlausible } from '../clock.mjs';

const DV_BLOCK_MARK = [0x1f, 0x07, 0x00];
const DV_BLOCK_MARK_LAST_BYTES = [0x3f, 0xbf];
const BYTES_IN_A_DV_BLOCK = 80;
const BLOCKS_AT_THE_START_THAT_CARRY_PACKS = 6;
const AUXILIARY_BLOCK_MARK = 0x50;
const WHICH_KIND_OF_BLOCK_IT_IS = 0xf0;
const PACKS_PER_BLOCK = 15;
const BYTES_PER_PACK = 5;
const BYTES_FROM_A_BLOCK_START_TO_ITS_PACKS = 3;
const RECORDING_DATE_PACK = 0x62;
const RECORDING_TIME_PACK = 0x63;

const LOW_FIVE_BITS = 0x1f;
const LOW_SIX_BITS = 0x3f;
const LOW_SEVEN_BITS = 0x7f;
// The year is two digits. A camcorder that recorded a year of 90 or more recorded it in
// the nineteen hundreds; anything else is this century. Tape ran out long before 2090.
const HIGHEST_TWO_DIGIT_YEAR_STILL_IN_THE_NINETEEN_HUNDREDS = 89;

export const startsWithADvBlockMark = (byteSource) => {
  const mark = readBytesAt(byteSource, 0, DV_BLOCK_MARK.length + 1);
  return mark !== null
    && DV_BLOCK_MARK.every((byte, index) => mark[index] === byte)
    && DV_BLOCK_MARK_LAST_BYTES.includes(mark[DV_BLOCK_MARK.length]);
};

// Each byte holds two decimal digits, one per nibble, so a byte reading 0x59 means 59 and
// a byte with a nibble above nine is not a number at all.
function decimalDigitsIn(byte) {
  const tens = byte >> 4;
  const units = byte & 0x0f;
  return tens > 9 || units > 9 ? null : tens * 10 + units;
}

function recordingDateInPack(byteSource, packStart) {
  const fields = readBytesAt(byteSource, packStart + 1, 4);
  if (fields === null) return null;
  const twoDigitYear = decimalDigitsIn(fields[3]);
  const month = decimalDigitsIn(fields[2] & LOW_FIVE_BITS);
  const day = decimalDigitsIn(fields[1] & LOW_SIX_BITS);
  if (twoDigitYear === null || month === null || day === null) return null;
  const century = twoDigitYear > HIGHEST_TWO_DIGIT_YEAR_STILL_IN_THE_NINETEEN_HUNDREDS ? 1900 : 2000;
  return { year: century + twoDigitYear, month, day };
}

function recordingTimeInPack(byteSource, packStart) {
  const fields = readBytesAt(byteSource, packStart + 1, 4);
  if (fields === null) return null;
  const hour = decimalDigitsIn(fields[3] & LOW_SIX_BITS);
  const minute = decimalDigitsIn(fields[2] & LOW_SEVEN_BITS);
  const second = decimalDigitsIn(fields[1] & LOW_SEVEN_BITS);
  if (hour === null || minute === null || second === null) return null;
  return { hour, minute, second };
}

export function readCameraClockFromDigitalVideo(byteSource) {
  if (!startsWithADvBlockMark(byteSource)) return null;

  let recordingDate = null;
  for (let blockIndex = 1; blockIndex < BLOCKS_AT_THE_START_THAT_CARRY_PACKS; blockIndex++) {
    const blockStart = blockIndex * BYTES_IN_A_DV_BLOCK;
    const blockKind = readUInt8At(byteSource, blockStart);
    if (blockKind === null) return null;
    if ((blockKind & WHICH_KIND_OF_BLOCK_IT_IS) !== AUXILIARY_BLOCK_MARK) continue;

    for (let packIndex = 0; packIndex < PACKS_PER_BLOCK; packIndex++) {
      const packStart = blockStart + BYTES_FROM_A_BLOCK_START_TO_ITS_PACKS + packIndex * BYTES_PER_PACK;
      const packKind = readUInt8At(byteSource, packStart);
      if (packKind === null) return null;

      if (packKind === RECORDING_DATE_PACK) {
        recordingDate = recordingDateInPack(byteSource, packStart);
      } else if (packKind === RECORDING_TIME_PACK && recordingDate !== null) {
        const recordingTime = recordingTimeInPack(byteSource, packStart);
        if (recordingTime === null) continue;
        return onlyIfPlausible(cameraClockFrom(
          recordingDate.year, recordingDate.month, recordingDate.day,
          recordingTime.hour, recordingTime.minute, recordingTime.second,
        ));
      }
    }
  }
  return null;
}
